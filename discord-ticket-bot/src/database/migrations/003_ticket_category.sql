-- Guild-level parent category for all ticket channels.
-- NULL = not configured (ticket creation will require configuration).
ALTER TABLE settings ADD COLUMN ticket_category_id TEXT;
