# Pilot data viewer (WebApp)

Local Grafana-style dashboard for workflow duration metrics (same Neon queries as `GraphGenerator/`), plus an interactive **Week-by-week flow** planner in the **same** frontend and dev server.

## Routes (same app)

| Path | App |
|------|-----|
| `/pilot` | Pilot data — workflow duration panels (uses `/api` when the backend is running) |
| `/weekly` | Week-by-week flow — editable in/out/end grid, Ultra Tasks text, `.xlsx` load (browser-only; no API) |
| `/schedule` | Schedule builder — home with six shift/day entries |
| `/schedule/shift/:shift/:day` | `shift` = `1` \| `2` \| `3`, `day` = `today` \| `tomorrow` — robot view (editable, autosave) + read-only pilot view |
| `/` | Redirects to `/pilot` |

The top nav switches between tools. Vite dev server handles client-side routing; use these paths in the address bar or links.

## Layout

- `backend/` — FastAPI + `psycopg`; imports metric definitions and query helpers from `../GraphGenerator/`.
- `frontend/` — React + Vite + TypeScript + Plotly + React Router + SheetJS (`xlsx`) for the weekly grid.

## Environment

Create `backend/.env` (do not commit secrets). Copy from `backend/.env.example` and fill in real values:

```env
# Pilot metrics + operator search (read-only connection is OK).
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require

# Schedule JSON + future week-by-week persistence — must be writable (INSERT/UPDATE; run migrations).
SCHEDULE_DATABASE_URL=postgresql://USER:PASSWORD@ep-yyyy.region.aws.neon.tech/neondb?sslmode=require
```

Use the **full URI from Neon** (Dashboard → your project → **Connection string**). The hostname looks like `ep-something.aws.neon.tech` — not the literal word `host`. If you see `failed to resolve host 'host'`, you still have a placeholder hostname in the URL.

`DATABASE_URL` matches the `GraphGenerator` scripts for metrics. `SCHEDULE_DATABASE_URL` can point at the same Neon project with a **read-write** role, or a separate database — it is only used for `/api/schedule/...` and later app-owned tables.

Optional: `PORT` (default `8000`).

Frontend optional override:

```env
# frontend/.env — only if not using the Vite dev proxy
VITE_API_BASE=http://127.0.0.1:8000
```

With the default Vite config, leave `VITE_API_BASE` unset and use the proxy so requests go to `/api` on the dev server.

## Ports and CORS

| Service   | Port | Notes                                      |
|----------|------|--------------------------------------------|
| API      | 8000 | `CORSMiddleware` allows `localhost:5173`   |
| Vite dev | 5173 | Proxies `/api` → `http://127.0.0.1:8000`   |

## Run (development)

**Backend** (from repo root or this folder; Python 3.12+):

```bash
cd backend
# uv (recommended):
uv sync
uv run uvicorn main:app --reload --port 8000
```

If `uv` is not available:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --reload --port 8000
```

**Homebrew Python (macOS):** do **not** run `python3 -m pip install` against the system/Homebrew interpreter — you will get **`externally-managed-environment`** (PEP 668). Always create **`backend/.venv`** (as above) and install into that venv only.

On **macOS**, `python` is often missing; use **`python3`** or the venv’s interpreter **`.venv/bin/python`** (no `activate` needed). Install deps and run the API:

```bash
cd backend
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --reload --port 8000
```

If `uvicorn` is not found after `activate`, use **`.venv/bin/python -m uvicorn`** as above, or install packages first with **`.venv/bin/python -m pip install -r requirements.txt`**.


`main.py` prepends `../../GraphGenerator` (from `WebApp/backend/`, i.e. `PilotDataViewer/GraphGenerator`) to `sys.path` so `metrics_config` and `pilot_data_queries` resolve; only Python dependencies need to be installed in the backend environment.

After changing metrics or `GraphGenerator/` code, **restart the API** (or rely on `--reload` watching `main.py` only — **`metrics_config.py` changes may not reload** unless you touch `main.py` or restart). If you see `Unknown workflow_key` with an old list of keys (e.g. `'mailer'` but not `'mailer_seal_mailer'`), the server is still running old code: stop and start `uvicorn` again.

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/pilot`, `http://localhost:5173/weekly`, or `http://localhost:5173/schedule`. The pilot dashboard stores panel layout and settings in `localStorage` under `pilotDashboard.v1`.

The standalone Week-by-week app previously under `WeeklyGrowth/webapp/` is merged here; use this frontend for both tools.

### Troubleshooting

- **`Internal Server Error` on operator search** — Usually the API cannot read `DATABASE_URL`. The backend now loads **`backend/.env` next to `main.py`** regardless of your shell’s current directory, but the file must exist and contain a single line like `DATABASE_URL=postgresql://...` (no smart quotes). Restart Uvicorn after editing. You can also `export DATABASE_URL=...` in the terminal before starting the server.
- **`503` with a JSON `detail` message** — The UI now shows that text instead of a generic error; use it to distinguish missing config vs connection/auth vs SQL issues.
- **`failed to resolve host 'host'`** — The app was still using a placeholder hostname. Common causes: (1) a **stale `DATABASE_URL` in your shell** from an old `export` (run `unset DATABASE_URL` and restart Uvicorn); (2) the env file is misnamed — it must be exactly **`.env`** in `backend/`, not ` .env` (leading space). From `backend/`, run `python check_env.py` to print the hostname being used (and to list oddly named files).
- The backend calls **`load_dotenv(..., override=True)`** so values in `backend/.env` override a conflicting shell `DATABASE_URL`.

### Schedule builder (Postgres)

Run the migration once against **`SCHEDULE_DATABASE_URL`** (not the read-only metrics URL):

```bash
cd backend
psql "$SCHEDULE_DATABASE_URL" -f migrations/001_schedule_slots.sql
```

If the table is missing, `GET` still returns a default document; **`PUT` requires** the `schedule_slots` table and a writable role.

- `GET /api/schedule/{shift}/{day}` — `shift` ∈ `1..3`, `day` ∈ `today` \| `tomorrow`. Returns JSON schedule document (empty default if none).
- `PUT /api/schedule/{shift}/{day}` — body: schedule document (`groups`, `day_start` / `day_end`, etc.). Validates robot+task row counts vs pilots per group.

## API

- `GET /api/health` — liveness.
- `GET /api/operators?q=&limit=50` — search users by name or id prefix.
- `POST /api/series` — JSON body:
  - `workflow_key` — one of `bulk_shipping`, `tote`, `mailer_seal_mailer`, `mailer_apply_label`, `pick_scan_sort`, `tower_stack`.
  - `teleoperator_ids` (max 12), `start_iso`, `end_iso` (ISO UTC).
  - `trim_longest_pct` / `trim_shortest_pct` — per-panel trim on pooled duration values (0–100): drop longest / shortest tails before bucketing or plotting.
  - `aggregate` — `raw` | `bucket`.
  - `outcome` — `all` | `success_only` | `failed_only`. Single-step metrics filter on `wdl.exit_type`. Span metrics (pick scan & sort) filter on the root row joined by `run_key`.
  - When `aggregate` is `bucket`: `bucket_mode` — `fixed` (use `bucket_seconds`, 60–86400), `utc_day` (86400s UTC day buckets), or `panel_span` (one bucket for the whole **From–To** range). `bucket_stat` — `mean_median` or `box`.
  - Response: `bucket_mode` when bucketed; each operator includes `teleop_hours_h` — **HUMAN running** hours from `station_states` with `COALESCE(finished_at, inserted_at)` inside `[start_iso, end_iso]` (not filtered by workflow metric).
  - Raw `bulk_shipping` points may include `item_count` (from `items_to_pack`) for scatter color when present; no filter by item count.

Metrics: **mailer_seal_mailer** and **mailer_apply_label** use `MAILER_SEAL_AND_LABEL` with `wdl.type` `seal_mailer` and `apply_label` respectively. **pick_scan_sort** uses per-run wall-clock span over configured non-`cycle` step types (grouped by `parent_id` / root id). **tower_stack** uses workflow type **`TOWER_STACK_UNSTACK`** (UI label “Tower Stack Unstack”) and step **`stack_rings`** only. If a date range shows no points, widen the range — production data may start only after that workflow shipped. **Bulk** / **tote** use `order` step duration.
