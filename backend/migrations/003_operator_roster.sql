CREATE TABLE IF NOT EXISTS operator_roster (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    shift INTEGER NOT NULL CHECK (shift IN (1, 2, 3)),
    absent BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, shift)
);
