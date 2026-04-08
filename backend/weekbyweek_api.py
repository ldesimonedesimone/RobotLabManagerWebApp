from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Literal

import psycopg
from pydantic import BaseModel, Field, field_validator, model_validator

DOC_KEY = "weekbyweek-flow-v1"

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS weekbyweek_state (
    doc_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


class WeekByWeekCell(BaseModel):
    in_: int = Field(0, alias="in")
    out: int = 0
    end: int = 0
    outCustomer: int | None = None
    outNonPilot: int | None = None

    @field_validator("in_", "out", "end", "outCustomer", "outNonPilot")
    @classmethod
    def non_negative(cls, v: int | None) -> int | None:
        if v is None:
            return None
        return max(0, int(v))


class WeekByWeekModel(BaseModel):
    weekDates: list[str]
    streamOrder: list[str]
    cells: dict[str, list[WeekByWeekCell]]
    ultra: list[str]

    @model_validator(mode="after")
    def validate_lengths(self) -> WeekByWeekModel:
        n = len(self.weekDates)
        if len(self.ultra) != n:
            raise ValueError("ultra must have same length as weekDates")
        for sid in self.streamOrder:
            if sid == "Ultra Tasks":
                continue
            col = self.cells.get(sid)
            if col is None:
                continue
            if len(col) != n:
                raise ValueError(f"cells[{sid}] must have same length as weekDates")
        return self


class WeekByWeekSettings(BaseModel):
    days_in_week: Literal[5, 6, 7] = 5
    percent_usable: float = 100.0
    uptime_percent: float = 100.0
    hours_shift_1: float = 8.0
    hours_shift_2: float = 8.0
    hours_shift_3: float = 8.0

    @field_validator(
        "percent_usable",
        "uptime_percent",
        "hours_shift_1",
        "hours_shift_2",
        "hours_shift_3",
    )
    @classmethod
    def non_negative(cls, v: float) -> float:
        return max(0.0, float(v))

    @model_validator(mode="after")
    def validate_ranges(self) -> WeekByWeekSettings:
        self.percent_usable = min(100.0, self.percent_usable)
        self.uptime_percent = min(100.0, self.uptime_percent)
        self.hours_shift_1 = min(24.0, self.hours_shift_1)
        self.hours_shift_2 = min(24.0, self.hours_shift_2)
        self.hours_shift_3 = min(24.0, self.hours_shift_3)
        total = self.hours_shift_1 + self.hours_shift_2 + self.hours_shift_3
        if total > 24.0 + 1e-9:
            raise ValueError("hours_shift_1 + hours_shift_2 + hours_shift_3 must be <= 24")
        return self


class WeekByWeekState(BaseModel):
    model: WeekByWeekModel
    pinEnd: list[str] = Field(default_factory=list)
    sheetMode: Literal["flow", "end"] = "flow"
    settings: WeekByWeekSettings = Field(default_factory=WeekByWeekSettings)


class WeekByWeekStateEnvelope(BaseModel):
    state: WeekByWeekState | None = None
    updated_at: str | None = None


def ensure_table(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_SQL)
    conn.commit()


def get_state(conn: psycopg.Connection) -> tuple[WeekByWeekState | None, str | None]:
    ensure_table(conn)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT payload, updated_at FROM weekbyweek_state WHERE doc_key = %s",
            (DOC_KEY,),
        )
        row = cur.fetchone()
    if row is None:
        return None, None
    raw = row[0]
    payload = json.loads(raw) if isinstance(raw, str) else raw
    state = WeekByWeekState.model_validate(payload)
    updated = row[1]
    updated_s = (
        updated.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        if isinstance(updated, datetime)
        else None
    )
    return state, updated_s


def put_state(conn: psycopg.Connection, state: WeekByWeekState) -> str:
    ensure_table(conn)
    now = datetime.now(timezone.utc)
    payload = state.model_dump(mode="json", by_alias=True)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO weekbyweek_state (doc_key, payload, updated_at)
            VALUES (%s, %s::jsonb, %s)
            ON CONFLICT (doc_key) DO UPDATE SET
                payload = EXCLUDED.payload,
                updated_at = EXCLUDED.updated_at
            """,
            (DOC_KEY, json.dumps(payload), now),
        )
    conn.commit()
    return now.isoformat().replace("+00:00", "Z")
