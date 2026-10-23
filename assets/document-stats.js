/* Aggregate document generation only. No personal data or document contents. */
(function (g) {
  'use strict';
  const endpoint = '/api/document-events';
  const pending = new Map(), completed = new Set();
  function record(eventId, offers) {
    // Enable only after the private database and same-origin Worker are deployed.
    if (g.TEDocumentStatsEnabled !== true || !['tegroup.cc', 'www.tegroup.cc'].includes(location.hostname)) return;
    if (!eventId || completed.has(eventId) || pending.has(eventId)) return;
    const ids = [...new Set(offers.map(x => x.id))];
    if (!ids.length || ids.some(x => typeof x !== 'string')) return;
    const body = JSON.stringify({ event_id: eventId, offer_ids: ids });
    const send = async attempt => {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', keepalive: true });
        if (response.ok) { completed.add(eventId); pending.delete(eventId); return; }
        if (response.status >= 400 && response.status < 500) { pending.delete(eventId); return; }
      } catch (_) { /* Statistics must never prevent access to documents. */ }
      if (attempt < 2) pending.set(eventId, setTimeout(() => send(attempt + 1), 2000 * (attempt + 1)));
      else pending.delete(eventId);
    };
    pending.set(eventId, true); void send(0);
  }
  g.TEDocumentStats = { record };
})(window);
