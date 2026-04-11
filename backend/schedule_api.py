from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Literal

import psycopg
from pydantic import BaseModel, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Template models
# ---------------------------------------------------------------------------


class TemplateInfo(BaseModel):
    id: int
    name: str
    n_pilots: int
    n_robots: int
    n_tasks: int
    n_slots: int


class TemplateDetail(TemplateInfo):
    grid: list[list[int | None]]

SCHEDULE_VERSION = 1
DEFAULT_DAY_START = "06:00"
DEFAULT_DAY_END = "16:00"


def time_slot_count(start: str = DEFAULT_DAY_START, end: str = DEFAULT_DAY_END) -> int:
    def parse_hm(s: str) -> int:
        a, b = s.strip().split(":")
        return int(a) * 60 + int(b)

    m0 = parse_hm(start)
    m1 = parse_hm(end)
    if m1 <= m0:
        raise ValueError("day end must be after day start")
    if (m1 - m0) % 15 != 0:
        raise ValueError("time range must be a multiple of 15 minutes")
    return (m1 - m0) // 15


class SchedulePilot(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=200)
    color_hex: str = Field(..., min_length=7, max_length=7)

    @field_validator("color_hex")
    @classmethod
    def color_ok(cls, v: str) -> str:
        if not re.match(r"^#[0-9A-Fa-f]{6}$", v):
            raise ValueError("color_hex must be #RRGGBB")
        return v


class ScheduleGroup(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=200)
    robot_labels: list[str] = Field(default_factory=list)
    task_labels: list[str] = Field(default_factory=list)
    pilots: list[SchedulePilot] = Field(default_factory=list)
    grid: list[list[str | None]] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_counts_and_grid(self) -> ScheduleGroup:
        n_rows = len(self.robot_labels) + len(self.task_labels)
        n_pilots = len(self.pilots)
        if n_rows != n_pilots:
            raise ValueError(
                f"robot_labels ({len(self.robot_labels)}) + task_labels ({len(self.task_labels)}) "
                f"must equal pilots ({n_pilots})",
            )
        if n_rows == 0:
            if self.grid:
                raise ValueError("empty group must have empty grid")
            return self
        pilot_ids = {p.id for p in self.pilots}
        for ti, row in enumerate(self.grid):
            if len(row) != n_rows:
                raise ValueError(
                    f"grid time slice {ti} must have {n_rows} cells, got {len(row)}",
                )
            for cell in row:
                if cell is not None and cell not in pilot_ids:
                    raise ValueError(f"unknown pilot id in grid: {cell}")
        return self


class ScheduleDocument(BaseModel):
    version: int = SCHEDULE_VERSION
    slot_key: str = ""
    day_start: str = DEFAULT_DAY_START
    day_end: str = DEFAULT_DAY_END
    groups: list[ScheduleGroup] = Field(default_factory=list)

    @field_validator("day_start", "day_end")
    @classmethod
    def hm(cls, v: str) -> str:
        parts = v.strip().split(":")
        if len(parts) != 2:
            raise ValueError("expected HH:MM")
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError("invalid time")
        return f"{h:02d}:{m:02d}"

    @model_validator(mode="after")
    def validate_group_grids_vs_day(self) -> ScheduleDocument:
        n_slots = time_slot_count(self.day_start, self.day_end)
        for g in self.groups:
            n_rows = len(g.robot_labels) + len(g.task_labels)
            if n_rows == 0:
                continue
            if len(g.grid) != n_slots:
                raise ValueError(
                    f"group {g.id}: grid must have {n_slots} time rows for current day window",
                )
        return self


def slot_key(shift: int, day: Literal["today", "tomorrow"]) -> str:
    if shift not in (1, 2, 3):
        raise ValueError("shift must be 1, 2, or 3")
    return f"s{shift}-{day}"


def default_document(sk: str) -> ScheduleDocument:
    return ScheduleDocument(version=SCHEDULE_VERSION, slot_key=sk)


CREATE_SQL = """
CREATE TABLE IF NOT EXISTS schedule_slots (
    slot_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def ensure_schedule_table(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_SQL)
    conn.commit()


def get_schedule(conn: psycopg.Connection, sk: str) -> ScheduleDocument:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT payload FROM schedule_slots WHERE slot_key = %s",
            (sk,),
        )
        row = cur.fetchone()
    if row is None:
        return default_document(sk)
    raw: Any = row[0]
    if isinstance(raw, str):
        data = json.loads(raw)
    else:
        data = raw
    return ScheduleDocument.model_validate(data)


def put_schedule(conn: psycopg.Connection, doc: ScheduleDocument) -> datetime:
    now = datetime.now(timezone.utc)
    payload = doc.model_dump(mode="json")
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO schedule_slots (slot_key, payload, updated_at)
            VALUES (%s, %s::jsonb, %s)
            ON CONFLICT (slot_key) DO UPDATE SET
                payload = EXCLUDED.payload,
                updated_at = EXCLUDED.updated_at
            """,
            (doc.slot_key, json.dumps(payload), now),
        )
    conn.commit()
    return now


# ---------------------------------------------------------------------------
# Template DB helpers
# ---------------------------------------------------------------------------

CREATE_TEMPLATES_SQL = """
CREATE TABLE IF NOT EXISTS schedule_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    n_pilots INTEGER NOT NULL,
    n_robots INTEGER NOT NULL,
    n_tasks INTEGER NOT NULL,
    grid JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def list_templates(conn: psycopg.Connection) -> list[TemplateInfo]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, n_pilots, n_robots, n_tasks, jsonb_array_length(grid) "
            "FROM schedule_templates ORDER BY n_pilots, n_robots, n_tasks, name"
        )
        return [
            TemplateInfo(id=r[0], name=r[1], n_pilots=r[2], n_robots=r[3], n_tasks=r[4], n_slots=r[5])
            for r in cur.fetchall()
        ]


def get_template_by_id(conn: psycopg.Connection, template_id: int) -> TemplateDetail | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, n_pilots, n_robots, n_tasks, grid, jsonb_array_length(grid) "
            "FROM schedule_templates WHERE id = %s",
            (template_id,),
        )
        r = cur.fetchone()
    if not r:
        return None
    grid = r[5] if isinstance(r[5], list) else json.loads(r[5])
    return TemplateDetail(
        id=r[0], name=r[1], n_pilots=r[2], n_robots=r[3],
        n_tasks=r[4], grid=grid, n_slots=r[6],
    )
