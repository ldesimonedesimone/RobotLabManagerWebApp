from __future__ import annotations

import psycopg
from pydantic import BaseModel, Field


class Operator(BaseModel):
    id: int
    name: str
    shift: int
    absent: bool = False
    sort_order: int = 0


class OperatorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    shift: int = Field(..., ge=1, le=3)


class OperatorUpdate(BaseModel):
    name: str | None = None
    shift: int | None = Field(default=None, ge=1, le=3)
    absent: bool | None = None
    sort_order: int | None = None


CREATE_SQL = """
CREATE TABLE IF NOT EXISTS operator_roster (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    shift INTEGER NOT NULL CHECK (shift IN (1, 2, 3)),
    absent BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, shift)
);
"""


def ensure_roster_table(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_SQL)
    conn.commit()


def list_operators(conn: psycopg.Connection, shift: int | None = None) -> list[Operator]:
    if shift is not None:
        sql = "SELECT id, name, shift, absent, sort_order FROM operator_roster WHERE shift = %s ORDER BY sort_order, name"
        params: tuple = (shift,)
    else:
        sql = "SELECT id, name, shift, absent, sort_order FROM operator_roster ORDER BY shift, sort_order, name"
        params = ()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [Operator(id=r[0], name=r[1], shift=r[2], absent=r[3], sort_order=r[4]) for r in cur.fetchall()]


def add_operator(conn: psycopg.Connection, op: OperatorCreate) -> Operator:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO operator_roster (name, shift) VALUES (%s, %s) RETURNING id, name, shift, absent, sort_order",
            (op.name.strip(), op.shift),
        )
        r = cur.fetchone()
        assert r is not None
    conn.commit()
    return Operator(id=r[0], name=r[1], shift=r[2], absent=r[3], sort_order=r[4])


def update_operator(conn: psycopg.Connection, op_id: int, patch: OperatorUpdate) -> Operator | None:
    sets: list[str] = []
    vals: list = []
    if patch.name is not None:
        sets.append("name = %s")
        vals.append(patch.name.strip())
    if patch.shift is not None:
        sets.append("shift = %s")
        vals.append(patch.shift)
    if patch.absent is not None:
        sets.append("absent = %s")
        vals.append(patch.absent)
    if patch.sort_order is not None:
        sets.append("sort_order = %s")
        vals.append(patch.sort_order)
    if not sets:
        return None
    vals.append(op_id)
    sql = f"UPDATE operator_roster SET {', '.join(sets)} WHERE id = %s RETURNING id, name, shift, absent, sort_order"
    with conn.cursor() as cur:
        cur.execute(sql, tuple(vals))
        r = cur.fetchone()
    conn.commit()
    if not r:
        return None
    return Operator(id=r[0], name=r[1], shift=r[2], absent=r[3], sort_order=r[4])


def delete_operator(conn: psycopg.Connection, op_id: int) -> bool:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM operator_roster WHERE id = %s", (op_id,))
        deleted = cur.rowcount > 0
    conn.commit()
    return deleted
