"""Commit only the rate snapshot against current main, retrying concurrent pushes.

Each attempt uses an owned temporary worktree. No force push, rebase, or reset of
the deployment checkout is needed; unrelated changes are never committed.
"""
from pathlib import Path
import json
import subprocess
import tempfile

RATE_PATH = 'assets/currency-rates.json'


def git(root, *args, check=True):
    return subprocess.run(['git', *args], cwd=root, text=True, capture_output=True, check=check)


def publish(root, snapshot, attempts=3, before_push=None):
    root = Path(root).resolve()
    candidate = json.loads(snapshot)
    for attempt in range(attempts):
        git(root, 'fetch', 'origin', 'main')
        with tempfile.TemporaryDirectory(prefix='tegroup-rates-') as folder:
            checkout = Path(folder) / 'checkout'
            git(root, 'worktree', 'add', '--detach', str(checkout), 'origin/main')
            try:
                target = checkout / RATE_PATH
                current = json.loads(target.read_bytes())
                # An older scheduled job must not replace a newer rate snapshot.
                candidate_date = (candidate['rate_date'], candidate['fetched_at'])
                current_date = (current['rate_date'], current['fetched_at'])
                if candidate_date <= current_date:
                    return 'A current or newer rate snapshot is already saved.'
                target.write_bytes(snapshot)
                git(checkout, 'add', '--', RATE_PATH)
                git(checkout, '-c', 'user.name=TE GROUP rates', '-c',
                    'user.email=rates@users.noreply.github.com', 'commit',
                    '-m', 'Refresh official currency rates')
                if before_push:
                    before_push(attempt)
                result = git(checkout, 'push', 'origin', 'HEAD:main', check=False)
                if result.returncode == 0:
                    return 'Saved official rates on the current main branch.'
            finally:
                git(root, 'worktree', 'remove', '--force', str(checkout))
    raise RuntimeError('Could not save rates after three attempts; no published data was overwritten.')


def main():
    root = Path(__file__).resolve().parents[1]
    snapshot = (root / RATE_PATH).read_bytes()
    changed = git(root, 'diff', '--name-only', 'HEAD').stdout.splitlines()
    if any(name != RATE_PATH for name in changed):
        raise RuntimeError('The rates job contains unrelated edits; refusing to commit them.')
    print(publish(root, snapshot))
    # The Pages artifact must contain current site files, not the scheduled job's
    # old checkout. Restore only this job's generated file before fast-forwarding.
    git(root, 'restore', '--', RATE_PATH)
    git(root, 'fetch', 'origin', 'main')
    git(root, 'merge', '--ff-only', 'origin/main')


if __name__ == '__main__':
    main()
