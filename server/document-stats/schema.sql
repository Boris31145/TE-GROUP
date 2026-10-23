-- No buyer data, contract numbers, VINs, IP addresses or document contents.
CREATE TABLE IF NOT EXISTS document_events (
  event_id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  selection TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS document_models (
  event_id TEXT NOT NULL REFERENCES document_events(event_id),
  offer_id TEXT NOT NULL,
  PRIMARY KEY (event_id, offer_id)
);
CREATE INDEX IF NOT EXISTS document_models_offer ON document_models(offer_id);
CREATE VIEW IF NOT EXISTS model_daily_statistics AS
SELECT e.day, m.offer_id, COUNT(*) AS generated_document_sets
FROM document_events e JOIN document_models m USING(event_id)
GROUP BY e.day, m.offer_id;
-- Supports owner dashboard day/month queries without scanning historical rows.
CREATE INDEX IF NOT EXISTS document_events_day ON document_events(day);
