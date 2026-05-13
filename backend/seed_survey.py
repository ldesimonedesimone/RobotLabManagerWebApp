#!/usr/bin/env python3
"""Populate pilot_survey_responses with plausible demo data.

Usage:
    python3 seed_survey.py            # insert ~45 fake responses spread over last 60 days
    python3 seed_survey.py --clear    # delete ALL rows before seeding
"""

from __future__ import annotations

import argparse
import json
import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from survey_api import MIGRATE_SQL

BACKEND_DIR = Path(__file__).resolve().parent

# (id, scale_kind)
QUESTIONS: list[tuple[str, str, bool]] = [
    ("job_satisfaction", "satisfaction", False),
    ("teleop_experience", "satisfaction", True),
    ("ultra_app", "satisfaction", True),
    ("shift_schedule_breaks", "satisfaction", True),
    ("leaderboard_badges", "satisfaction", True),
    ("office_equipment", "satisfaction", True),
    ("training_program", "satisfaction", True),
    ("physical_demand", "manageable", True),
    ("ultra_growth_support", "well", True),
    ("remotics_growth_support", "well", True),
    ("anything_else", "text", True),
]

SCALES = {
    "satisfaction": ["Very satisfied", "Satisfied", "Neutral", "Unsatisfied", "Very unsatisfied"],
    "manageable": ["Very manageable", "Manageable", "Neutral", "Unmanageable", "Very unmanageable"],
    "well": ["Very well", "Well", "Neutral", "Poorly", "Very poorly"],
}

# Slight positive lean across most questions; physical_demand and remotics_growth_support skew negative.
DISTRIBUTIONS: dict[str, list[float]] = {
    "job_satisfaction":        [0.25, 0.42, 0.20, 0.10, 0.03],
    "teleop_experience":       [0.20, 0.45, 0.22, 0.10, 0.03],
    "ultra_app":               [0.15, 0.40, 0.30, 0.12, 0.03],
    "shift_schedule_breaks":   [0.10, 0.30, 0.35, 0.18, 0.07],
    "leaderboard_badges":      [0.08, 0.22, 0.45, 0.18, 0.07],
    "office_equipment":        [0.18, 0.42, 0.25, 0.12, 0.03],
    "training_program":        [0.20, 0.40, 0.25, 0.12, 0.03],
    "physical_demand":         [0.08, 0.28, 0.34, 0.22, 0.08],
    "ultra_growth_support":    [0.15, 0.38, 0.30, 0.13, 0.04],
    "remotics_growth_support": [0.05, 0.18, 0.32, 0.28, 0.17],
}

PILOTS = [
    "Sebastian Barreto Mato", "Gabriel Castillo Murillo", "Fernando Rodea",
    "Patricio Garcia", "Armando Rufino", "Sean Lublinsky",
    "Jesus Fabian Osorio Nieto", "Miguel Angel Leyva Garcia",
    "Felipe Enrique Huerta Sanchez", "Alonso Gordillo",
    "Roberto Ibarra", "Ivan Paniagua", "Yamil Andre Alvarado Nava",
    "Joshua Martinez",
]

# Reusable canned comments keyed by question id, used probabilistically.
COMMENTS: dict[str, list[str]] = {
    "teleop_experience": [
        "Latency spikes on Lab 3 in the afternoon make pick-and-place painful.",
        "Wrist cam keeps cutting out during long shifts on gen2-104.",
        "Overall feels great when the robot is healthy.",
        "Right arm freezing too often this week.",
        "Headset tracking drift is annoying on day 2 of the week.",
    ],
    "ultra_app": [
        "The fault flow modal could be dismissable with Esc.",
        "Workflow reset button should be more obvious.",
        "Love the new schedule view, much cleaner.",
        "Auto-refresh sometimes loses my place in the queue.",
        "Search in the operator picker is slow.",
    ],
    "shift_schedule_breaks": [
        "Would love a 10-min break every hour instead of one 15-min mid-shift.",
        "Schedule changes day-of are hard to plan around.",
        "Mornings are great, afternoons drag.",
        "Breaks are well-timed for me.",
    ],
    "leaderboard_badges": [
        "Don't really pay attention to badges, but the throughput chart is fun.",
        "Could the leaderboard show team-wide stats too?",
        "Honestly haven't seen this.",
        "Cool idea, but the metrics need to be more transparent.",
    ],
    "office_equipment": [
        "New chairs are a huge improvement.",
        "Headsets get hot after 90 min, swap pads more often please.",
        "Right monitor at station 4 flickers.",
        "Trackball would be great for resetting workflow.",
    ],
    "training_program": [
        "Onboarding was thorough — appreciated the buddy system.",
        "More practice on edge-case workflows would help.",
        "Felt thrown in the deep end, but I learned fast.",
        "Need a refresher session every 2 months.",
    ],
    "physical_demand": [
        "Eye strain is real after 4 hours straight. Scheduled eye breaks would help.",
        "Headset weight + cable tension on the neck.",
        "Mostly fine but the chair lumbar support could be better.",
        "Wrist soreness from gripper triggers — different controllers?",
    ],
    "ultra_growth_support": [
        "Lab manager checks in regularly, appreciated.",
        "Would like clearer path to senior pilot.",
        "Feedback on my throughput numbers would help me improve.",
        "Good mentorship from the team.",
    ],
    "remotics_growth_support": [
        "Haven't heard from Remotics in weeks — feels like we're an afterthought.",
        "Pay structure is opaque.",
        "Communication has been spotty.",
        "When Remotics does talk to us it's professional, just rare.",
        "Bonus structure for high performers would help.",
    ],
    "anything_else": [
        "Snacks in the breakroom please 🙏",
        "Lab 11 robot has been a beast this week — kudos to the hardware team.",
        "Can we get a Slack channel for pilot-side improvements?",
        "Loving the team energy lately.",
        "More clarity on the long-term plan would be motivating.",
        "Honestly happy here. Just keep the pipeline of new bots flowing.",
        "",  # sometimes left blank
    ],
}


def weighted_choice(options: list[str], weights: list[float]) -> str:
    return random.choices(options, weights=weights, k=1)[0]


def generate_response(now_utc: datetime) -> tuple[datetime, str | None, dict]:
    age_days = random.uniform(0, 60)
    age_hours = random.uniform(0, 24)
    ts = now_utc - timedelta(days=age_days, hours=age_hours)

    is_anonymous = random.random() < 0.30
    pilot_name = None if is_anonymous else random.choice(PILOTS)

    answers: dict[str, dict[str, str]] = {}
    for qid, kind, has_comment in QUESTIONS:
        # Skip ~10% of questions per response to simulate partial fills.
        if random.random() < 0.10:
            continue

        entry: dict[str, str] = {}
        if kind != "text":
            options = SCALES[kind]
            weights = DISTRIBUTIONS[qid]
            entry["rating"] = weighted_choice(options, weights)

        if has_comment:
            pool = COMMENTS.get(qid, [])
            comment_prob = 0.55 if kind == "text" else 0.25
            if pool and random.random() < comment_prob:
                comment = random.choice(pool)
                if comment:
                    entry["comment"] = comment

        if entry:
            answers[qid] = entry

    return ts, pilot_name, answers


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clear", action="store_true", help="Delete all existing rows first")
    parser.add_argument("--count", type=int, default=45, help="Number of fake responses to insert")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducibility")
    args = parser.parse_args()

    random.seed(args.seed)

    load_dotenv(BACKEND_DIR / ".env")
    url = os.environ.get("SCHEDULE_DATABASE_URL") or os.environ["DATABASE_URL"]
    assert url, "Need SCHEDULE_DATABASE_URL (writable) in backend/.env"

    now = datetime.now(timezone.utc)
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(MIGRATE_SQL)
            if args.clear:
                cur.execute("DELETE FROM pilot_survey_responses")
                print(f"Cleared existing rows.")

            inserted = 0
            for _ in range(args.count):
                ts, pilot_name, answers = generate_response(now)
                if not answers:
                    continue
                cur.execute(
                    """
                    INSERT INTO pilot_survey_responses (inserted_at, pilot_name, answers)
                    VALUES (%s, %s, %s::jsonb)
                    """,
                    (ts, pilot_name, json.dumps(answers)),
                )
                inserted += 1
        conn.commit()
    print(f"Inserted {inserted} fake survey responses spread over the last 60 days.")


if __name__ == "__main__":
    main()
