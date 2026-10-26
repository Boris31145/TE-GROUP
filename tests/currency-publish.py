"""Exercise the actual Git race with disposable local repositories, no network."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

module_path = Path(__file__).resolve().parents[1] / 'scripts/save-currency-snapshot.py'
spec = importlib.util.spec_from_file_location('currency_publish', module_path)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


def run(root, *args):
    return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.STDOUT, text=True)


with tempfile.TemporaryDirectory(prefix='te-rates-test-') as folder:
    base = Path(folder)
    remote, first, second = [base / name for name in ['remote.git', 'first', 'second']]
    run(base, 'init', '--bare', '--initial-branch=main', str(remote))
    run(base, 'clone', str(remote), str(first))
    run(first, 'config', 'user.name', 'Test')
    run(first, 'config', 'user.email', 'test@example.invalid')
    (first / 'assets').mkdir()
    initial = dict(rate_date='2026-10-24', fetched_at='2026-10-24T10:00:00+03:00', rates={'USD': 80})
    (first / publisher.RATE_PATH).write_text(json.dumps(initial))
    (first / 'index.html').write_text('Original site')
    run(first, 'add', '.')
    run(first, 'commit', '-m', 'Initial')
    run(first, 'push', 'origin', 'main')
    run(base, 'clone', str(remote), str(second))
    run(second, 'config', 'user.name', 'Site editor')
    run(second, 'config', 'user.email', 'test@example.invalid')
    attempts = []

    def concurrent_push(attempt):
        attempts.append(attempt)
        if attempt == 0:
            (second / 'index.html').write_text('New mobile catalogue')
            run(second, 'add', 'index.html')
            run(second, 'commit', '-m', 'Concurrent site update')
            run(second, 'push', 'origin', 'main')

    newer = {**initial, 'fetched_at': '2026-10-25T12:00:00+03:00'}
    publisher.publish(first, json.dumps(newer).encode(), before_push=concurrent_push)
    assert attempts == [0, 1], attempts
    assert run(first, 'show', 'origin/main:index.html') == 'New mobile catalogue'
    assert json.loads(run(first, 'show', 'origin/main:' + publisher.RATE_PATH)) == newer
    head = run(first, 'rev-parse', 'origin/main')
    publisher.publish(first, json.dumps(initial).encode())
    assert run(first, 'rev-parse', 'origin/main') == head, 'Old rate jobs must not overwrite newer data'
    assert run(first, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'origin/main').strip() == publisher.RATE_PATH
    assert len(run(first, 'worktree', 'list', '--porcelain').split('worktree ')) == 2
print('PASS: concurrent site commit retained, rates saved on retry, stale snapshots ignored, temporary worktrees cleaned.')
