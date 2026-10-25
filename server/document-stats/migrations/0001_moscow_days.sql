-- Apply once to the existing database BEFORE deploying the new collector/dashboard.
-- Preserve legacy dates: their time of day was never stored and cannot be recovered.
ALTER TABLE document_events ADD COLUMN day_timezone TEXT NOT NULL DEFAULT 'UTC';
