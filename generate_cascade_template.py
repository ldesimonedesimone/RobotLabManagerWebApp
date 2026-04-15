#!/usr/bin/env python3
"""Generate rotation schedule templates.

Two algorithms:
  **Cascade** (GCD(P, R) == 1): staggered handoff times so no two robots swap
  at once. Each robot's first shift is shortened by a cascade offset; all
  subsequent shifts are full-length (default 60 min).

  **Block rotation** (GCD(P, R) > 1): all robots swap simultaneously every
  `swap_min` minutes (default 45). After each full group cycle, robot
  assignments rotate left by 1 so every pilot touches every robot.

Usage:
    python generate_cascade_template.py 7 3 4                 # cascade
    python generate_cascade_template.py 6 3 3                 # block rotation
    python generate_cascade_template.py 6 3 3 --swap-min 45   # explicit swap
    python generate_cascade_template.py 7 3 4 --save          # upsert to DB
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

SLOT_MINUTES = 15
MAX_ROBOT_SHIFT_SLOTS = 60 // SLOT_MINUTES  # 1 hour max on a robot
MIN_PILOT_ROBOT_RATIO = 4 / 3


def _validate_inputs(n_pilots: int, n_robots: int, n_tasks: int) -> None:
    assert n_pilots == n_robots + n_tasks, (
        f"n_pilots ({n_pilots}) must equal n_robots ({n_robots}) + n_tasks ({n_tasks})"
    )
    assert n_robots >= 1 and n_tasks >= 1 and n_pilots >= 2
    assert n_pilots / n_robots >= MIN_PILOT_ROBOT_RATIO, (
        f"pilot/robot ratio {n_pilots/n_robots:.2f} is below minimum "
        f"{MIN_PILOT_ROBOT_RATIO:.4f} — operators would get insufficient rest"
    )


def generate_cascade_template(
    n_pilots: int,
    n_robots: int,
    n_tasks: int,
    shift_slots: int = 4,
    total_slots: int = 36,
) -> list[list[int | None]]:
    _validate_inputs(n_pilots, n_robots, n_tasks)
    assert shift_slots <= MAX_ROBOT_SHIFT_SLOTS, (
        f"shift_slots ({shift_slots} = {shift_slots * SLOT_MINUTES} min) exceeds "
        f"max robot shift ({MAX_ROBOT_SHIFT_SLOTS * SLOT_MINUTES} min)"
    )

    offsets = [math.ceil(shift_slots * (r + 1) / n_robots) for r in range(n_robots)]

    transitions: list[list[tuple[int, int]]] = [[] for _ in range(n_robots)]
    counter = 0
    robot_clock = [0] * n_robots

    while min(robot_clock) < total_slots:
        r = counter % n_robots
        p = counter % n_pilots
        duration = offsets[r] if len(transitions[r]) == 0 else shift_slots
        start = robot_clock[r]
        if start < total_slots:
            transitions[r].append((p, start))
        robot_clock[r] = start + duration
        counter += 1

    position: dict[int, tuple[str, int]] = {}
    for r in range(n_robots):
        position[transitions[r][0][0]] = ("robot", r)
    task_idx = 0
    for p in range(n_pilots):
        if p not in position:
            position[p] = ("task", task_idx)
            task_idx += 1

    all_swaps: list[tuple[int, int, int]] = []
    for r in range(n_robots):
        for p, t in transitions[r][1:]:
            all_swaps.append((t, r, p))
    all_swaps.sort()

    grid: list[list[int | None]] = []
    swap_idx = 0

    for t in range(total_slots):
        while swap_idx < len(all_swaps) and all_swaps[swap_idx][0] == t:
            _, r, new_p = all_swaps[swap_idx]
            old_p = next(p for p, pos in position.items() if pos == ("robot", r))
            vacated_task = position[new_p]
            assert vacated_task[0] == "task"
            position[new_p] = ("robot", r)
            position[old_p] = vacated_task
            swap_idx += 1

        slot: list[int | None] = [None] * (n_robots + n_tasks)
        for p, (kind, idx) in position.items():
            if kind == "robot":
                slot[idx] = p
            else:
                slot[n_robots + idx] = p
        grid.append(slot)

    return grid


def generate_block_rotation_template(
    n_pilots: int,
    n_robots: int,
    n_tasks: int,
    swap_slots: int = 3,
    total_slots: int = 36,
) -> list[list[int | None]]:
    """Block rotation for GCD(P, R) > 1 cases.

    All robots swap simultaneously every `swap_slots` slots. After each full
    group cycle (robot group → task group → back), robot assignments rotate
    left by 1 so every pilot visits every robot position.
    """
    _validate_inputs(n_pilots, n_robots, n_tasks)
    assert swap_slots <= MAX_ROBOT_SHIFT_SLOTS, (
        f"swap_slots ({swap_slots} = {swap_slots * SLOT_MINUTES} min) exceeds "
        f"max robot shift ({MAX_ROBOT_SHIFT_SLOTS * SLOT_MINUTES} min)"
    )

    n_groups = n_pilots // n_robots
    assert n_groups >= 2, (
        f"block rotation needs n_pilots >= 2 * n_robots "
        f"(got {n_pilots} pilots, {n_robots} robots)"
    )

    groups: list[list[int]] = []
    for g in range(n_groups):
        groups.append(list(range(g * n_robots, g * n_robots + n_robots)))

    grid: list[list[int | None]] = []
    phase = 0

    while len(grid) < total_slots:
        rotation = (phase // n_groups) % n_robots
        group_idx = phase % n_groups

        robot_pilots = groups[group_idx][:]
        rotated = robot_pilots[-rotation:] + robot_pilots[:-rotation] if rotation else robot_pilots[:]

        task_pilots: list[int] = []
        for g in range(n_groups):
            if g == group_idx:
                continue
            gp = groups[g][:]
            rp = gp[-rotation:] + gp[:-rotation] if rotation else gp[:]
            task_pilots.extend(rp)

        for _ in range(swap_slots):
            if len(grid) >= total_slots:
                break
            slot: list[int | None] = [None] * (n_robots + n_tasks)
            for i, p in enumerate(rotated):
                slot[i] = p
            for i, p in enumerate(task_pilots):
                slot[n_robots + i] = p
            grid.append(slot)

        phase += 1

    return grid


def format_grid(
    grid: list[list[int | None]], n_robots: int, n_tasks: int,
) -> str:
    n_pilots = n_robots + n_tasks
    headers = [f"R{i}" for i in range(n_robots)] + [f"T{i}" for i in range(n_tasks)]
    lines = ["  Time  " + "  ".join(f"{h:>3}" for h in headers)]
    lines.append("  " + "-" * (8 + 5 * len(headers)))
    for t, slot in enumerate(grid):
        mins = t * SLOT_MINUTES
        h, m = divmod(mins, 60)
        cells = []
        for v in slot:
            cells.append(f" P{v}" if v is not None else "  .")
        lines.append(f"  {h:02d}:{m:02d}  " + "  ".join(f"{c:>3}" for c in cells))
    return "\n".join(lines)


def verify_grid(grid: list[list[int | None]], n_pilots: int, n_robots: int, n_tasks: int) -> list[str]:
    errors = []
    for t, slot in enumerate(grid):
        assigned = [v for v in slot if v is not None]
        if len(assigned) != n_pilots:
            errors.append(f"t={t}: only {len(assigned)}/{n_pilots} pilots assigned")
        if len(set(assigned)) != len(assigned):
            errors.append(f"t={t}: duplicate pilot assignment {assigned}")
        for v in assigned:
            if v < 0 or v >= n_pilots:
                errors.append(f"t={t}: invalid pilot index {v}")
    return errors


PILOT_COLORS = [
    "#4285F4", "#EA4335", "#FBBC04", "#34A853", "#8E24AA",
    "#FF6D01", "#00897B", "#5E35B1", "#FFA726", "#3949AB",
    "#D81B60", "#1B5E20", "#546E7A", "#F06292", "#AED581",
    "#CE93D8", "#4DD0E1", "#A1887F", "#90A4AE", "#FFD54F",
]


def plot_grid(
    grid: list[list[int | None]],
    n_robots: int,
    n_tasks: int,
    title: str,
    out_path: str | None = None,
) -> None:
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.colors import to_rgba

    n_pilots = n_robots + n_tasks
    n_resources = n_robots + n_tasks
    total_slots = len(grid)
    labels = [f"Robot {i+1}" for i in range(n_robots)] + [f"Task {i+1}" for i in range(n_tasks)]

    fig, ax = plt.subplots(figsize=(max(14, total_slots * 0.45), n_resources * 0.7 + 1.5))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#161b22")

    for res in range(n_resources):
        t = 0
        while t < total_slots:
            p = grid[t][res]
            run_start = t
            while t < total_slots and grid[t][res] == p:
                t += 1
            if p is None:
                continue
            color = PILOT_COLORS[p % len(PILOT_COLORS)]
            x0 = run_start * SLOT_MINUTES
            w = (t - run_start) * SLOT_MINUTES
            y = n_resources - 1 - res
            alpha = 0.55 if res >= n_robots else 0.85
            ax.barh(y, w, left=x0, height=0.7, color=to_rgba(color, alpha),
                    edgecolor="#30363d", linewidth=0.5)
            cx = x0 + w / 2
            ax.text(cx, y, f"P{p+1}", ha="center", va="center",
                    fontsize=7, fontweight="bold", color="white")

    ax.set_yticks(range(n_resources))
    ax.set_yticklabels(list(reversed(labels)), fontsize=9, color="#c9d1d9")
    ax.set_xlabel("Minutes", fontsize=10, color="#c9d1d9")
    ax.set_title(title, fontsize=13, fontweight="bold", color="#e6edf3", pad=12)

    total_min = total_slots * SLOT_MINUTES
    tick_step = 60
    ax.set_xticks(range(0, total_min + 1, tick_step))
    ax.set_xticklabels(
        [f"{m // 60}:{m % 60:02d}" for m in range(0, total_min + 1, tick_step)],
        fontsize=8, color="#8b949e",
    )
    ax.set_xlim(0, total_min)
    ax.tick_params(axis="y", left=False)
    ax.tick_params(axis="x", colors="#30363d")
    for spine in ax.spines.values():
        spine.set_color("#30363d")

    ax.axhline(y=n_tasks - 0.5, color="#8b949e", linewidth=1, linestyle="--", alpha=0.5)

    legend_handles = [
        mpatches.Patch(facecolor=PILOT_COLORS[i % len(PILOT_COLORS)], edgecolor="#30363d",
                       label=f"Pilot {i+1}")
        for i in range(n_pilots)
    ]
    ax.legend(handles=legend_handles, loc="upper right", fontsize=7,
              facecolor="#161b22", edgecolor="#30363d", labelcolor="#c9d1d9",
              ncol=min(n_pilots, 7))

    plt.tight_layout()
    if out_path:
        fig.savefig(out_path, dpi=150, facecolor=fig.get_facecolor())
        print(f"Saved chart to {out_path}")
    else:
        plt.show()
    plt.close(fig)


def save_to_db(name: str, n_pilots: int, n_robots: int, n_tasks: int, grid: list[list[int | None]]) -> None:
    import psycopg
    from dotenv import dotenv_values

    backend_dir = Path(__file__).resolve().parent / "backend"
    env = dotenv_values(backend_dir / ".env")
    url = (env.get("SCHEDULE_DATABASE_URL") or "").strip()
    assert url, "SCHEDULE_DATABASE_URL not set in backend/.env"

    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO schedule_templates (name, n_pilots, n_robots, n_tasks, grid)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (name) DO UPDATE SET
                    n_pilots = EXCLUDED.n_pilots,
                    n_robots = EXCLUDED.n_robots,
                    n_tasks = EXCLUDED.n_tasks,
                    grid = EXCLUDED.grid
                """,
                (name, n_pilots, n_robots, n_tasks, json.dumps(grid)),
            )
        conn.commit()
    print(f"Upserted '{name}' to database.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate rotation schedule template")
    parser.add_argument("n_pilots", type=int)
    parser.add_argument("n_robots", type=int)
    parser.add_argument("n_tasks", type=int)
    parser.add_argument("--shift-min", type=int, default=60,
                        help="Robot shift duration for cascade mode (default 60)")
    parser.add_argument("--swap-min", type=int, default=45,
                        help="Robot swap duration for block rotation mode (default 45)")
    parser.add_argument("--total-hours", type=float, default=9,
                        help="Total schedule hours (default 9)")
    parser.add_argument("--name", type=str, default=None, help="Template name (default: auto)")
    parser.add_argument("--save", action="store_true", help="Upsert to database")
    parser.add_argument("--plot", nargs="?", const="auto", default=None,
                        help="Generate chart (optionally specify output path, e.g. --plot out.png)")
    args = parser.parse_args()

    total_slots = int(args.total_hours * 60 / SLOT_MINUTES)
    use_block = args.n_pilots % args.n_robots == 0

    if use_block:
        assert args.swap_min % SLOT_MINUTES == 0, (
            f"swap-min must be a multiple of {SLOT_MINUTES}"
        )
        swap_slots = args.swap_min // SLOT_MINUTES
        algo = "Block Rotation"
        name = args.name or f"{args.n_pilots}P-{args.n_robots}R-{args.n_tasks}T {algo}"

        print(f"Generating: {name}")
        print(f"  {args.n_pilots} pilots, {args.n_robots} robots, {args.n_tasks} tasks")
        print(f"  Algorithm: {algo} (GCD={math.gcd(args.n_pilots, args.n_robots)})")
        print(f"  Swap: {args.swap_min} min ({swap_slots} slots), "
              f"Total: {args.total_hours}h ({total_slots} slots)")
        print()

        grid = generate_block_rotation_template(
            args.n_pilots, args.n_robots, args.n_tasks, swap_slots, total_slots,
        )
    else:
        assert args.shift_min % SLOT_MINUTES == 0, (
            f"shift-min must be a multiple of {SLOT_MINUTES}"
        )
        shift_slots = args.shift_min // SLOT_MINUTES
        algo = "Cascade"
        name = args.name or f"{args.n_pilots}P-{args.n_robots}R-{args.n_tasks}T {algo}"

        print(f"Generating: {name}")
        print(f"  {args.n_pilots} pilots, {args.n_robots} robots, {args.n_tasks} tasks")
        print(f"  Algorithm: {algo} (P%R≠0, GCD={math.gcd(args.n_pilots, args.n_robots)})")
        print(f"  Shift: {args.shift_min} min ({shift_slots} slots), "
              f"Total: {args.total_hours}h ({total_slots} slots)")
        offsets = [math.ceil(shift_slots * (r + 1) / args.n_robots) for r in range(args.n_robots)]
        print(f"  Initial offsets: {[o * SLOT_MINUTES for o in offsets]} min")
        print()

        grid = generate_cascade_template(
            args.n_pilots, args.n_robots, args.n_tasks, shift_slots, total_slots,
        )

    errors = verify_grid(grid, args.n_pilots, args.n_robots, args.n_tasks)
    if errors:
        print("ERRORS:")
        for e in errors:
            print(f"  {e}")
        return

    print(format_grid(grid, args.n_robots, args.n_tasks))
    print(f"\n  Grid: {len(grid)} slots, all {args.n_pilots} pilots assigned every slot. ✓")

    if args.plot is not None:
        out = None if args.plot == "auto" else args.plot
        if out is None:
            suffix = "block" if use_block else "cascade"
            out = f"{args.n_pilots}P-{args.n_robots}R-{args.n_tasks}T_{suffix}.png"
        plot_grid(grid, args.n_robots, args.n_tasks, name, out_path=out)

    if args.save:
        print()
        save_to_db(name, args.n_pilots, args.n_robots, args.n_tasks, grid)


if __name__ == "__main__":
    main()
