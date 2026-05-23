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

# (id, scale_kind, has_comment_field)
QUESTIONS: list[tuple[str, str, bool]] = [
    ("pilot_role", "pilot_role", False),
    ("job_satisfaction", "satisfaction", True),
    ("teleop_experience", "satisfaction", True),
    ("headset_app", "headset_app", True),
    ("latency_wow", "latency_wow", True),
    ("shift_schedule", "scheduling", True),
    ("leaderboard_badges", "satisfaction", True),
    ("comfort_overall", "comfort", True),
    ("training_program", "training", True),
    ("physical_demand", "manageable", True),
    ("growth_support", "extent", True),
    ("anything_else", "text", True),
]

# Legacy ids - only emitted for a fraction of rows so the "Legacy questions"
# section on the dashboard has something to render until they age out.
LEGACY_QUESTIONS: list[tuple[str, str, bool]] = [
    ("ultra_app", "satisfaction", True),
    ("shift_schedule_breaks", "satisfaction", True),
    ("office_equipment", "satisfaction", True),
    ("ultra_growth_support", "well", True),
    ("remotics_growth_support", "well", True),
]

SCALES = {
    "pilot_role": ["Trainee Pilot", "Data Collection Pilot", "Customer Pilot"],
    "satisfaction": ["Very satisfied", "Satisfied", "Neutral", "Unsatisfied", "Very unsatisfied"],
    "manageable": ["Very manageable", "Manageable", "Neutral", "Unmanageable", "Very unmanageable"],
    "well": ["Very well", "Well", "Neutral", "Poorly", "Very poorly"],
    "extent": ["Definitely", "Mostly", "Neutral", "Not really", "Not at all"],
    "headset_app": ["Worked great", "Worked well", "Some issues", "Lots of issues", "Couldn't use it"],
    "latency_wow": ["Better than last week", "Same as last week", "Worse than last week"],
    "scheduling": ["Worked great", "Worked well", "Neutral", "Clunky", "Broken"],
    "comfort": ["Very comfortable", "Comfortable", "Neutral", "Uncomfortable", "Very uncomfortable"],
    "training": ["Very well", "Well", "Neutral", "Poorly", "Very poorly", "Doesn't apply to me"],
}

DISTRIBUTIONS: dict[str, list[float]] = {
    "pilot_role":              [0.30, 0.55, 0.15],
    "job_satisfaction":        [0.25, 0.42, 0.20, 0.10, 0.03],
    "teleop_experience":       [0.20, 0.45, 0.22, 0.10, 0.03],
    "headset_app":             [0.18, 0.40, 0.28, 0.10, 0.04],
    "latency_wow":             [0.32, 0.46, 0.22],
    "shift_schedule":          [0.18, 0.38, 0.25, 0.13, 0.06],
    "leaderboard_badges":      [0.08, 0.22, 0.45, 0.18, 0.07],
    "comfort_overall":         [0.18, 0.42, 0.25, 0.12, 0.03],
    "training_program":        [0.18, 0.35, 0.22, 0.10, 0.03, 0.12],
    "physical_demand":         [0.08, 0.28, 0.34, 0.22, 0.08],
    "growth_support":          [0.12, 0.34, 0.30, 0.16, 0.08],
    # Legacy distributions (only used when emitted)
    "ultra_app":               [0.15, 0.40, 0.30, 0.12, 0.03],
    "shift_schedule_breaks":   [0.10, 0.30, 0.35, 0.18, 0.07],
    "office_equipment":        [0.18, 0.42, 0.25, 0.12, 0.03],
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

COMMENTS_EN: dict[str, list[str]] = {
    "job_satisfaction": [
        "Good week overall, lab energy is solid.",
        "Mixed feelings — love the team, frustrated with comms.",
        "Best place I've worked, honestly.",
    ],
    "teleop_experience": [
        "Latency spikes on Lab 3 in the afternoon make pick-and-place painful.",
        "Wrist cam keeps cutting out during long shifts on gen2-104.",
        "Overall feels great when the robot is healthy.",
        "Right arm freezing too often this week.",
        "Headset tracking drift is annoying on day 2 of the week.",
    ],
    "headset_app": [
        "App froze twice this week, had to remove and reseat the headset.",
        "Buttery smooth, no complaints.",
        "Reconnects on its own most of the time which is nice.",
        "Lost workflow state once mid-shift.",
        "UI text feels small in low light.",
    ],
    "latency_wow": [
        "Definitely smoother today than last Thursday.",
        "About the same as last week, nothing dramatic.",
        "Worse - lots of warbling at the start of shift.",
        "Felt great until the afternoon dip.",
    ],
    "shift_schedule": [
        "Schedule shuffler is a huge upgrade. Nice work.",
        "Robots got reassigned mid-shift twice — felt chaotic.",
        "Worked fine, no surprises.",
        "Would love a 10-min break every hour instead of one 15-min mid-shift.",
    ],
    "leaderboard_badges": [
        "Don't really pay attention to badges, but the throughput chart is fun.",
        "Could the leaderboard show team-wide stats too?",
        "Honestly haven't seen this.",
        "Cool idea, but the metrics need to be more transparent.",
    ],
    "comfort_overall": [
        "Chair is good, headset still pinches after 90 min.",
        "Comfortable enough — would prefer a different controller grip.",
        "Stations near the window get hot in the afternoon.",
        "All good.",
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
    "growth_support": [
        "Lab manager checks in regularly, appreciated.",
        "Would like clearer path to senior pilot.",
        "Feedback on my throughput numbers would help me improve.",
        "Communication has been spotty from Remotics.",
        "Pay structure is opaque, but Ultra side is supportive.",
    ],
    "anything_else": [
        "Snacks in the breakroom please.",
        "Lab 11 robot has been a beast this week — kudos to the hardware team.",
        "Can we get a Slack channel for pilot-side improvements?",
        "Loving the team energy lately.",
        "More clarity on the long-term plan would be motivating.",
        "Honestly happy here. Just keep the pipeline of new bots flowing.",
        "",
    ],
    "ultra_app": [
        "The fault flow modal could be dismissable with Esc.",
        "Workflow reset button should be more obvious.",
    ],
    "shift_schedule_breaks": [
        "Mornings are great, afternoons drag.",
        "Breaks are well-timed for me.",
    ],
    "office_equipment": [
        "New chairs are a huge improvement.",
        "Right monitor at station 4 flickers.",
    ],
    "ultra_growth_support": [
        "Good mentorship from the team.",
        "Would like clearer path to senior pilot.",
    ],
    "remotics_growth_support": [
        "Haven't heard from Remotics in weeks — feels like we're an afterthought.",
        "Pay structure is opaque.",
    ],
}

# Spanish-flavoured comments, dropped into ~25% of responses to exercise the
# results-page Spanish detection + translate pill.
COMMENTS_ES: dict[str, list[str]] = {
    "teleop_experience": [
        "La latencia estuvo muy pesada en el turno de la tarde, casi no podía agarrar piezas.",
        "El brazo derecho se trababa mucho hoy, perdí varios intentos.",
        "Funcionó muy bien toda la semana, sin quejas.",
    ],
    "headset_app": [
        "El casco se desconectó dos veces esta semana, tuve que reiniciar.",
        "La app está más estable que la semana pasada, gracias.",
        "Perdí el flujo de trabajo a mitad del turno.",
    ],
    "latency_wow": [
        "Mucho mejor que la semana pasada, se siente más fluido.",
        "Igual que siempre, sin cambios notables.",
        "Peor — había mucha demora al inicio del turno.",
    ],
    "shift_schedule": [
        "El nuevo horario funciona bien para mí, pero los descansos podrían ser más frecuentes.",
        "Hubo demasiados cambios de robot en el mismo turno, fue confuso.",
        "Todo bien, sin sorpresas.",
    ],
    "comfort_overall": [
        "La silla está cómoda pero el casco aprieta después de una hora.",
        "Todo cómodo, sin problemas.",
        "Necesito ajustar mejor la altura del monitor.",
    ],
    "training_program": [
        "El entrenamiento fue completo pero faltó práctica con casos difíciles.",
        "Aprendí mucho con mi compañero asignado.",
        "Sería bueno tener sesiones de repaso cada dos meses.",
    ],
    "physical_demand": [
        "Vista cansada después de tres horas seguidas, ojalá más descansos.",
        "El cuello me duele al final del día por el peso del casco.",
        "En general manejable pero los descansos son cortos.",
    ],
    "growth_support": [
        "Ultra nos apoya bastante, pero de Remotics casi no sabemos nada.",
        "Me gustaría más retroalimentación sobre mi desempeño.",
        "La comunicación con Remotics ha sido escasa este mes.",
    ],
    "anything_else": [
        "Estaría bueno tener más botanas en la sala de descanso.",
        "Gracias al equipo de hardware, los robots están funcionando mejor.",
        "Me encanta la energía del equipo últimamente.",
    ],
}


def weighted_choice(options: list[str], weights: list[float]) -> str:
    return random.choices(options, weights=weights, k=1)[0]


def pick_comment(qid: str, prefer_es: bool) -> str | None:
    pools = []
    if prefer_es and qid in COMMENTS_ES:
        pools.append(COMMENTS_ES[qid])
    if qid in COMMENTS_EN:
        pools.append(COMMENTS_EN[qid])
    if not pools:
        return None
    pool = pools[0]
    choice = random.choice(pool)
    return choice or None


def generate_response(now_utc: datetime) -> tuple[datetime, str | None, dict]:
    age_days = random.uniform(0, 60)
    age_hours = random.uniform(0, 24)
    ts = now_utc - timedelta(days=age_days, hours=age_hours)

    is_anonymous = random.random() < 0.30
    pilot_name = None if is_anonymous else random.choice(PILOTS)
    prefer_es = random.random() < 0.25

    answers: dict[str, dict[str, str]] = {}

    # pilot_role is always present so the dashboard role filter works.
    role_options = SCALES["pilot_role"]
    role_weights = DISTRIBUTIONS["pilot_role"]
    answers["pilot_role"] = {"rating": weighted_choice(role_options, role_weights)}

    for qid, kind, has_comment in QUESTIONS:
        if qid == "pilot_role":
            continue
        # Skip ~10% of questions per response to simulate partial fills.
        if random.random() < 0.10:
            continue

        entry: dict[str, str] = {}
        if kind != "text":
            options = SCALES[kind]
            weights = DISTRIBUTIONS[qid]
            entry["rating"] = weighted_choice(options, weights)

        if has_comment:
            comment_prob = 0.55 if kind == "text" else 0.25
            if random.random() < comment_prob:
                c = pick_comment(qid, prefer_es)
                if c:
                    entry["comment"] = c

        if entry:
            answers[qid] = entry

    # Sprinkle legacy keys onto ~30% of rows so the legacy section has content.
    if random.random() < 0.30:
        for qid, kind, has_comment in LEGACY_QUESTIONS:
            if random.random() < 0.55:
                continue
            entry: dict[str, str] = {}
            if kind != "text":
                entry["rating"] = weighted_choice(SCALES[kind], DISTRIBUTIONS[qid])
            if has_comment and random.random() < 0.25:
                c = pick_comment(qid, prefer_es)
                if c:
                    entry["comment"] = c
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
                print("Cleared existing rows.")

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
