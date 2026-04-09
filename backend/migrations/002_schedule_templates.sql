CREATE TABLE IF NOT EXISTS schedule_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    n_pilots INTEGER NOT NULL,
    n_robots INTEGER NOT NULL,
    n_tasks INTEGER NOT NULL,
    grid JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
