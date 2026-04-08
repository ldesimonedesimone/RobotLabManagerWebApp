#!/usr/bin/env python3
"""Print which DATABASE_URL / SCHEDULE_DATABASE_URL the backend will use (hostname only). Run from backend/: python check_env.py"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse


def _hostname_from_dotenv(raw: str, key_prefix: str) -> str | None:
    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("#") or not s:
            continue
        if s.upper().startswith(key_prefix):
            _, _, rest = s.partition("=")
            url = rest.strip().strip('"').strip("'")
            u = urlparse(url)
            return str(u.hostname) if u.hostname else None
    return None


def main() -> None:
    backend = Path(__file__).resolve().parent
    print("backend dir:", backend)
    print("Files that look like env (repr = exact name):")
    for p in sorted(backend.iterdir()):
        if "env" in p.name.lower() or p.name.startswith("."):
            print(" ", repr(p.name), "is_file=", p.is_file())

    dot = backend / ".env"
    print()
    print("Expected file:", dot)
    print("Exists:", dot.is_file())

    if dot.is_file():
        raw = dot.read_text(encoding="utf-8")
        h_metrics = _hostname_from_dotenv(raw, "DATABASE_URL")
        h_schedule = _hostname_from_dotenv(raw, "SCHEDULE_DATABASE_URL")
        if h_metrics:
            print("From .env — DATABASE_URL hostname:", repr(h_metrics))
        else:
            print("No DATABASE_URL= line found in .env")
        if h_schedule:
            print("From .env — SCHEDULE_DATABASE_URL hostname:", repr(h_schedule))
        else:
            print("No SCHEDULE_DATABASE_URL= line in .env (schedule API returns 503 until set).")

    try:
        from main import get_settings

        s = get_settings()
        u = urlparse(s.database_url)
        print("From get_settings() — DATABASE_URL hostname:", repr(u.hostname))
        if s.schedule_database_url:
            us = urlparse(s.schedule_database_url)
            print("From get_settings() — SCHEDULE_DATABASE_URL hostname:", repr(us.hostname))
        else:
            print("From get_settings() — schedule_database_url: (not set)")
    except Exception as e:
        print("get_settings() failed:", e)


if __name__ == "__main__":
    main()
