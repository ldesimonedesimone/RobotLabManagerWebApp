-- Run once against the same database as DATABASE_URL (Pilot Data Viewer API).
CREATE TABLE IF NOT EXISTS schedule_slots (
    slot_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
