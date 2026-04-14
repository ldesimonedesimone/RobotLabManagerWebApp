from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Literal

from contextlib import contextmanager

import psycopg_pool
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AliasChoices, BaseModel, Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent


def _load_backend_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    path = _BACKEND_DIR / ".env"
    if path.is_file():
        load_dotenv(path, override=True)


_load_backend_dotenv()

GRAPH_DIR = _BACKEND_DIR.parent.parent / "GraphGenerator"
if str(GRAPH_DIR) not in sys.path:
    sys.path.insert(0, str(GRAPH_DIR))

import psycopg  # noqa: E402

try:  # noqa: E402
    from metrics_config import METRIC_BY_KEY, METRICS  # type: ignore
    from pilot_data_queries import (  # type: ignore
        aggregate_bucket_box_values,
        aggregate_bucket_box_values_panel_span,
        aggregate_buckets,
        aggregate_buckets_panel_span,
        ensure_utc,
        fetch_metric_points,
        fetch_teleop_hours_in_range,
        trim_workflow_duration_tails,
    )
    PILOT_API_AVAILABLE = True
except Exception:  # pragma: no cover - optional for week-by-week-only deploys
    METRIC_BY_KEY = {}
    METRICS = []
    PILOT_API_AVAILABLE = False

    def _pilot_missing(*_args, **_kwargs):
        raise RuntimeError(
            "Pilot dashboard backend dependencies are unavailable. "
            "Add GraphGenerator modules to this deploy if you need /api/series."
        )

    aggregate_bucket_box_values = _pilot_missing
    aggregate_bucket_box_values_panel_span = _pilot_missing
    aggregate_buckets = _pilot_missing
    aggregate_buckets_panel_span = _pilot_missing
    ensure_utc = _pilot_missing
    fetch_metric_points = _pilot_missing
    fetch_teleop_hours_in_range = _pilot_missing
    trim_workflow_duration_tails = _pilot_missing

from schedule_api import (  # noqa: E402
    ScheduleDocument,
    TemplateDetail,
    TemplateInfo,
    default_document,
    get_schedule,
    get_template_by_id,
    list_templates,
    put_schedule,
    slot_key,
)
from roster_api import (  # noqa: E402
    OperatorCreate,
    OperatorUpdate,
    add_operator,
    delete_operator,
    ensure_roster_table,
    list_operators,
    update_operator,
)
from weekbyweek_api import (  # noqa: E402
    WeekByWeekState,
    WeekByWeekStateEnvelope,
    get_state as get_weekbyweek_state,
    put_state as put_weekbyweek_state,
)


class Settings(BaseSettings):
    database_url: str
    schedule_database_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SCHEDULE_DATABASE_URL", "schedule_database_url"),
    )

    model_config = SettingsConfigDict(
        env_file=_BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


def parse_iso_utc(s: str) -> datetime:
    t = s.strip()
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    dt = datetime.fromisoformat(t)
    return ensure_utc(dt)


MAX_OPERATORS = 12
STMT_TIMEOUT_MS = 60_000

app = FastAPI(title="Pilot Data Viewer API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "DATABASE_URL missing or invalid. Add it to "
                f"{_BACKEND_DIR / '.env'} (see .env.example), or export DATABASE_URL."
            ),
        ) from e


FRONTEND_DIST_DIR = _BACKEND_DIR.parent / "frontend" / "dist"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"


def _mount_frontend_assets_if_present() -> None:
    if FRONTEND_ASSETS_DIR.is_dir():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS_DIR)), name="assets")


_mount_frontend_assets_if_present()


def get_schedule_database_url() -> str:
    s = get_settings()
    if s.schedule_database_url and s.schedule_database_url.strip():
        return s.schedule_database_url.strip()
    raise HTTPException(
        status_code=503,
        detail=(
            "SCHEDULE_DATABASE_URL is not set in backend/.env. "
            "Add a writable Postgres URL for schedule storage (separate from read-only DATABASE_URL)."
        ),
    )


_schedule_pool: psycopg_pool.ConnectionPool | None = None
_metrics_pool: psycopg_pool.ConnectionPool | None = None


def _get_schedule_pool() -> psycopg_pool.ConnectionPool:
    global _schedule_pool
    if _schedule_pool is None:
        url = get_schedule_database_url()
        _schedule_pool = psycopg_pool.ConnectionPool(
            url, min_size=2, max_size=20, open=True,
        )
    return _schedule_pool


def _get_metrics_pool() -> psycopg_pool.ConnectionPool:
    global _metrics_pool
    if _metrics_pool is None:
        s = get_settings()
        _metrics_pool = psycopg_pool.ConnectionPool(
            s.database_url, min_size=1, max_size=10, open=True,
        )
    return _metrics_pool


@contextmanager
def schedule_conn():
    with _get_schedule_pool().connection() as conn:
        yield conn


@contextmanager
def metrics_conn():
    with _get_metrics_pool().connection() as conn:
        yield conn


@app.on_event("shutdown")
def _close_pools():
    global _schedule_pool, _metrics_pool
    if _schedule_pool:
        _schedule_pool.close()
        _schedule_pool = None
    if _metrics_pool:
        _metrics_pool.close()
        _metrics_pool = None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/schedule/templates")
def api_list_templates() -> list[dict]:
    try:
        with schedule_conn() as conn:
            return [t.model_dump() for t in list_templates(conn)]
    except psycopg.errors.UndefinedTable:
        return []
    except psycopg.Error as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e}") from e


@app.get("/api/schedule/templates/{template_id}")
def api_get_template(template_id: int) -> dict:
    try:
        with schedule_conn() as conn:
            tpl = get_template_by_id(conn, template_id)
    except psycopg.errors.UndefinedTable:
        raise HTTPException(status_code=404, detail="Template table not found. Run migration 002.")
    except psycopg.Error as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e}") from e
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl.model_dump()


@app.get("/api/schedule/{shift}/{day}")
def api_get_schedule(
    shift: int,
    day: Literal["today", "tomorrow"],
) -> dict:
    if shift not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="shift must be 1, 2, or 3")
    sk = slot_key(shift, day)
    try:
        with schedule_conn() as conn:
            doc = get_schedule(conn, sk)
    except psycopg.errors.UndefinedTable:
        doc = default_document(sk)
    except psycopg.Error as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database error: {e}",
        ) from e
    out = doc.model_copy(update={"slot_key": sk})
    return out.model_dump(mode="json")


@app.get("/api/weekbyweek", response_model=WeekByWeekStateEnvelope)
def api_get_weekbyweek() -> WeekByWeekStateEnvelope:
    try:
        with schedule_conn() as conn:
            state, updated_at = get_weekbyweek_state(conn)
    except psycopg.Error as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database error: {e}",
        ) from e
    return WeekByWeekStateEnvelope(state=state, updated_at=updated_at)


@app.put("/api/weekbyweek", response_model=WeekByWeekStateEnvelope)
def api_put_weekbyweek(body: WeekByWeekState) -> WeekByWeekStateEnvelope:
    try:
        with schedule_conn() as conn:
            updated_at = put_weekbyweek_state(conn, body)
    except psycopg.errors.ReadOnlySqlTransaction as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Database is read-only for week-by-week writes. "
                "Use a writable SCHEDULE_DATABASE_URL."
            ),
        ) from e
    except psycopg.Error as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database error: {e}",
        ) from e
    return WeekByWeekStateEnvelope(state=body, updated_at=updated_at)


# ---------------------------------------------------------------------------
# Operator roster
# ---------------------------------------------------------------------------

@app.get("/api/roster")
def api_list_roster(shift: int | None = Query(default=None, ge=1, le=3)) -> list[dict]:
    try:
        with schedule_conn() as conn:
            ensure_roster_table(conn)
            return [op.model_dump() for op in list_operators(conn, shift)]
    except psycopg.Error as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e}") from e


@app.post("/api/roster")
def api_add_roster(body: OperatorCreate) -> dict:
    try:
        with schedule_conn() as conn:
            ensure_roster_table(conn)
            op = add_operator(conn, body)
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail=f"'{body.name}' already exists in shift {body.shift}")
    except psycopg.Error as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e}") from e
    return op.model_dump()


@app.patch("/api/roster/{op_id}")
def api_update_roster(op_id: int, body: OperatorUpdate) -> dict:
    try:
        with schedule_conn() as conn:
            ensure_roster_table(conn)
            op = update_operator(conn, op_id, body)
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Duplicate name+shift combination")
    except psycopg.Error as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e}") from e
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")
    return op.model_dump()


@app.delete("/api/roster/{op_id}")
def api_delete_roster(op_id: int) -> dict[str, str]:
    try:
        with schedule_conn() as conn:
            ensure_roster_table(conn)
            ok = delete_operator(conn, op_id)
    except psycopg.Error as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e}") from e
    if not ok:
        raise HTTPException(status_code=404, detail="Operator not found")
    return {"ok": "true"}


@app.put("/api/schedule/{shift}/{day}")
def api_put_schedule(
    shift: int,
    day: Literal["today", "tomorrow"],
    body: ScheduleDocument,
) -> dict[str, str]:
    if shift not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="shift must be 1, 2, or 3")
    sk = slot_key(shift, day)
    doc = body.model_copy(update={"slot_key": sk})
    try:
        with schedule_conn() as conn:
            put_schedule(conn, doc)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except psycopg.errors.UndefinedTable as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "schedule_slots table not found. Run migration "
                "`backend/migrations/001_schedule_slots.sql` against SCHEDULE_DATABASE_URL."
            ),
        ) from e
    except psycopg.errors.ReadOnlySqlTransaction as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Database is read-only for schedule writes. "
                "Use a writable SCHEDULE_DATABASE_URL or a DB role that can INSERT/UPDATE."
            ),
        ) from e
    except psycopg.Error as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database error: {e}",
        ) from e
    return {"ok": "true", "slot_key": sk}


@app.get("/api/operators")
def search_operators(
    q: str = Query("", max_length=200),
    limit: int = Query(50, ge=1, le=100),
) -> list[dict[str, int | str]]:
    qstrip = q.strip()
    like = f"%{qstrip}%"
    id_prefix = qstrip
    id_exact: int | None = None
    if qstrip.isdigit():
        try:
            id_exact = int(qstrip)
        except ValueError:
            id_exact = None
    if id_exact is not None:
        sql = """
        SELECT id, COALESCE(name, '')::text AS name
        FROM users
        WHERE id IS NOT NULL
          AND (
            (%s = '' OR COALESCE(name, '') ILIKE %s OR CAST(id AS text) LIKE %s OR id = %s)
          )
        ORDER BY COALESCE(name, '') ASC NULLS LAST, id ASC
        LIMIT %s
        """
        params = (
            qstrip,
            like,
            f"{id_prefix}%" if id_prefix else "%",
            id_exact,
            limit,
        )
    else:
        sql = """
        SELECT id, COALESCE(name, '')::text AS name
        FROM users
        WHERE id IS NOT NULL
          AND (
            (%s = '' OR COALESCE(name, '') ILIKE %s OR CAST(id AS text) LIKE %s)
          )
        ORDER BY COALESCE(name, '') ASC NULLS LAST, id ASC
        LIMIT %s
        """
        params = (
            qstrip,
            like,
            f"{id_prefix}%" if id_prefix else "%",
            limit,
        )
    try:
        with metrics_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SET statement_timeout = {int(STMT_TIMEOUT_MS)}"
                )
                cur.execute(sql, params)
                rows = cur.fetchall()
    except psycopg.Error as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database error (check DATABASE_URL and network): {e}",
        ) from e
    return [{"id": int(r[0]), "name": (r[1] or "").strip() or f"id {int(r[0])}"} for r in rows]


class SeriesRequest(BaseModel):
    workflow_key: str
    teleoperator_ids: list[int] = Field(..., min_length=1, max_length=MAX_OPERATORS)
    start_iso: str
    end_iso: str
    bucket_mode: Literal["fixed", "utc_day", "panel_span"] = "fixed"
    bucket_seconds: int | None = Field(None, ge=60, le=86400)
    trim_longest_pct: float = Field(0.0, ge=0.0, lt=100.0)
    trim_shortest_pct: float = Field(0.0, ge=0.0, lt=100.0)
    aggregate: Literal["raw", "bucket"]
    outcome: Literal["all", "success_only", "failed_only"] = "all"
    bucket_stat: Literal["mean_median", "box"] = "mean_median"


class SeriesPointRaw(BaseModel):
    t: str
    duration_s: float
    item_count: int | None = None


class SeriesPointBucket(BaseModel):
    bucket_start: str
    mean_s: float
    median_s: float


class SeriesPointBucketBox(BaseModel):
    bucket_start: str
    values_s: list[float]


class OperatorSeriesOut(BaseModel):
    teleoperator_id: int
    name: str
    teleop_hours_h: float = 0.0
    points: (
        list[SeriesPointRaw]
        | list[SeriesPointBucket]
        | list[SeriesPointBucketBox]
    )


class SeriesResponse(BaseModel):
    workflow_key: str
    title: str
    goal_seconds: float | None
    aggregate: str
    outcome: str
    bucket_stat: str | None = None
    bucket_mode: str | None = None
    operators: list[OperatorSeriesOut]


def _names_for_ids(conn: psycopg.Connection, ids: list[int]) -> dict[int, str]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, COALESCE(name, '')::text FROM users WHERE id = ANY(%s)",
            (ids,),
        )
        return {int(r[0]): ((r[1] or "").strip() or f"id {int(r[0])}") for r in cur.fetchall()}


@app.post("/api/series", response_model=SeriesResponse)
def post_series(body: SeriesRequest) -> SeriesResponse:
    if not PILOT_API_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail=(
                "Pilot dashboard endpoints are unavailable in this deploy. "
                "Deploy with GraphGenerator modules to enable /api/series."
            ),
        )
    if body.workflow_key not in METRIC_BY_KEY:
        raise HTTPException(
            400,
            detail=f"Unknown workflow_key. Valid: {[m.key for m in METRICS]}",
        )
    if body.aggregate == "bucket":
        if body.bucket_mode == "fixed" and body.bucket_seconds is None:
            raise HTTPException(
                400,
                detail="bucket_seconds required when aggregate is bucket and bucket_mode is fixed",
            )

    metric = METRIC_BY_KEY[body.workflow_key]
    t0 = parse_iso_utc(body.start_iso)
    t1 = parse_iso_utc(body.end_iso)
    if t1 < t0:
        raise HTTPException(400, detail="end_iso must be >= start_iso")

    ids = list(dict.fromkeys(body.teleoperator_ids))

    try:
        with metrics_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SET statement_timeout = {int(STMT_TIMEOUT_MS)}"
                )
            raw = fetch_metric_points(
                conn,
                metric,
                ids,
                start_utc=t0,
                end_utc=t1,
                outcome=body.outcome,
            )
            raw = trim_workflow_duration_tails(
                raw,
                body.trim_longest_pct,
                body.trim_shortest_pct,
            )
            name_by_id = _names_for_ids(conn, ids)
            teleop_h = fetch_teleop_hours_in_range(conn, ids, t0, t1)
    except psycopg.Error as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database error (check DATABASE_URL and network): {e}",
        ) from e

    operators_out: list[OperatorSeriesOut] = []
    bucket_stat_out: str | None = None
    bucket_mode_out: str | None = None
    if body.aggregate == "raw":
        for tid in ids:
            rows = raw.get(tid, [])
            operators_out.append(
                OperatorSeriesOut(
                    teleoperator_id=tid,
                    name=name_by_id.get(tid, str(tid)),
                    teleop_hours_h=float(teleop_h.get(tid, 0.0)),
                    points=[
                        SeriesPointRaw(
                            t=ensure_utc(st).isoformat().replace("+00:00", "Z"),
                            duration_s=float(sec),
                            item_count=ic,
                        )
                        for st, _en, sec, ic in rows
                    ],
                )
            )
    else:
        bucket_stat_out = body.bucket_stat
        bucket_mode_out = body.bucket_mode
        mode = body.bucket_mode
        if mode == "fixed":
            assert body.bucket_seconds is not None
            eff_sec = body.bucket_seconds
        elif mode == "utc_day":
            eff_sec = 86400
        else:
            eff_sec = None

        if mode == "panel_span":
            if body.bucket_stat == "mean_median":
                b = aggregate_buckets_panel_span(raw, t0)
            else:
                b = aggregate_bucket_box_values_panel_span(raw, t0)
            for tid in ids:
                rows = b.get(tid, [])
                operators_out.append(
                    OperatorSeriesOut(
                        teleoperator_id=tid,
                        name=name_by_id.get(tid, str(tid)),
                        teleop_hours_h=float(teleop_h.get(tid, 0.0)),
                        points=[
                            SeriesPointBucket(
                                bucket_start=ensure_utc(t).isoformat().replace("+00:00", "Z"),
                                mean_s=float(mn),
                                median_s=float(md),
                            )
                            for t, mn, md in rows
                        ]
                        if body.bucket_stat == "mean_median"
                        else [
                            SeriesPointBucketBox(
                                bucket_start=ensure_utc(t).isoformat().replace("+00:00", "Z"),
                                values_s=list(vals),
                            )
                            for t, vals in rows
                        ],
                    )
                )
        else:
            assert eff_sec is not None
            if body.bucket_stat == "mean_median":
                b = aggregate_buckets(raw, eff_sec)
                for tid in ids:
                    rows = b.get(tid, [])
                    operators_out.append(
                        OperatorSeriesOut(
                            teleoperator_id=tid,
                            name=name_by_id.get(tid, str(tid)),
                            teleop_hours_h=float(teleop_h.get(tid, 0.0)),
                            points=[
                                SeriesPointBucket(
                                    bucket_start=ensure_utc(t).isoformat().replace("+00:00", "Z"),
                                    mean_s=float(mn),
                                    median_s=float(md),
                                )
                                for t, mn, md in rows
                            ],
                        )
                    )
            else:
                bx = aggregate_bucket_box_values(raw, eff_sec)
                for tid in ids:
                    rows = bx.get(tid, [])
                    operators_out.append(
                        OperatorSeriesOut(
                            teleoperator_id=tid,
                            name=name_by_id.get(tid, str(tid)),
                            teleop_hours_h=float(teleop_h.get(tid, 0.0)),
                            points=[
                                SeriesPointBucketBox(
                                    bucket_start=ensure_utc(t).isoformat().replace("+00:00", "Z"),
                                    values_s=list(vals),
                                )
                                for t, vals in rows
                            ],
                        )
                    )

    return SeriesResponse(
        workflow_key=metric.key,
        title=metric.title,
        goal_seconds=metric.goal_seconds,
        aggregate=body.aggregate,
        outcome=body.outcome,
        bucket_stat=bucket_stat_out,
        bucket_mode=bucket_mode_out,
        operators=operators_out,
    )


@app.get("/")
def frontend_root() -> FileResponse:
    index = FRONTEND_DIST_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                "Frontend build not found at frontend/dist/index.html. "
                "Build frontend before running production server."
            ),
        )
    return FileResponse(str(index))


@app.get("/{full_path:path}")
def frontend_routes(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    index = FRONTEND_DIST_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                "Frontend build not found at frontend/dist/index.html. "
                "Build frontend before running production server."
            ),
        )
    return FileResponse(str(index))


def main() -> None:
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("RAILWAY_ENVIRONMENT") is None,
    )


if __name__ == "__main__":
    main()
