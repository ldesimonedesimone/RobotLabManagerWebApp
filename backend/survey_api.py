"""Pilot survey submission storage on the schedule (writable) Postgres pool.

Answers are stored as a JSONB blob keyed by question id, so the question set can
evolve without DDL. Each entry is one of:
  { "rating": "Satisfied", "comment": "optional free text" }
  { "rating": "Satisfied" }                         # rating-only
  { "comment": "free text" }                        # text-only question
"""

from __future__ import annotations

from datetime import datetime

import psycopg
from pydantic import BaseModel, Field


class SurveyResponseRow(BaseModel):
    id: int
    inserted_at: datetime
    pilot_name: str | None = None
    answers: dict[str, dict[str, str]] = Field(default_factory=dict)

# Idempotent: handles fresh installs and the earlier sample schema (3 columns).
MIGRATE_SQL = """
CREATE TABLE IF NOT EXISTS pilot_survey_responses (
    id BIGSERIAL PRIMARY KEY,
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pilot_name TEXT,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE pilot_survey_responses ADD COLUMN IF NOT EXISTS answers JSONB;
ALTER TABLE pilot_survey_responses DROP COLUMN IF EXISTS shift_rating;
ALTER TABLE pilot_survey_responses DROP COLUMN IF EXISTS trouble_area;
ALTER TABLE pilot_survey_responses DROP COLUMN IF EXISTS notes;
"""


class SurveyAnswer(BaseModel):
    rating: str | None = Field(default=None, max_length=80)
    comment: str | None = Field(default=None, max_length=4000)


class SurveySubmission(BaseModel):
    pilot_name: str | None = Field(default=None, max_length=120)
    answers: dict[str, SurveyAnswer] = Field(default_factory=dict)


class SurveyAck(BaseModel):
    id: int
    inserted_at: datetime


def ensure_survey_table(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(MIGRATE_SQL)
    conn.commit()


def list_responses(
    conn: psycopg.Connection,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 1000,
) -> list[SurveyResponseRow]:
    clauses: list[str] = []
    params: list = []
    if start is not None:
        clauses.append("inserted_at >= %s")
        params.append(start)
    if end is not None:
        clauses.append("inserted_at < %s")
        params.append(end)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
    SELECT id, inserted_at, pilot_name, answers
    FROM pilot_survey_responses
    {where}
    ORDER BY inserted_at DESC
    LIMIT %s
    """
    params.append(limit)
    out: list[SurveyResponseRow] = []
    with conn.cursor() as cur:
        cur.execute(sql, params)
        for row in cur.fetchall():
            ans = row[3] or {}
            cleaned: dict[str, dict[str, str]] = {}
            if isinstance(ans, dict):
                for qid, entry in ans.items():
                    if isinstance(entry, dict):
                        cleaned[str(qid)] = {
                            k: str(v)
                            for k, v in entry.items()
                            if isinstance(v, str) and v
                        }
            out.append(
                SurveyResponseRow(
                    id=int(row[0]),
                    inserted_at=row[1],
                    pilot_name=row[2],
                    answers=cleaned,
                )
            )
    return out


def insert_response(conn: psycopg.Connection, body: SurveySubmission) -> SurveyAck:
    cleaned: dict[str, dict[str, str]] = {}
    for qid, ans in body.answers.items():
        entry: dict[str, str] = {}
        if ans.rating and ans.rating.strip():
            entry["rating"] = ans.rating.strip()
        if ans.comment and ans.comment.strip():
            entry["comment"] = ans.comment.strip()
        if entry:
            cleaned[qid] = entry

    assert cleaned, "Submission must include at least one answer"

    import json

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO pilot_survey_responses (pilot_name, answers)
            VALUES (%s, %s::jsonb)
            RETURNING id, inserted_at
            """,
            (
                (body.pilot_name or "").strip() or None,
                json.dumps(cleaned),
            ),
        )
        row = cur.fetchone()
    conn.commit()
    assert row is not None, "insert returned no row"
    return SurveyAck(id=int(row[0]), inserted_at=row[1])
