#!/usr/bin/env python3
"""
EduRAG — Synthetic LMS dataset generator.

Generates a deterministic, fully synthetic LMS activity log for EduRAG's
prototype and writes a CSV to data/raw/sample_lms_data.csv.

No real student data is ever read or written. The dataset is engineered to
exhibit the behavioural patterns the causal model expects to find
(see docs/causal-methodology.md), so the downstream RDI engine, causal graph,
and what-if simulator have meaningful signal to surface.

Behaviour groups
----------------
  1. high_engagement_high_performance  — broad resource use, strong outcomes
  2. high_login_low_diversity          — many events but concentrated on video
  3. low_engagement_at_risk            — sparse activity, poor outcomes
  4. improving_over_time               — engagement ramps up across the term
  5. inconsistent_engagement           — high week-to-week variance

Uses only the Python standard library (no numpy / pandas) so the project
takes on zero new dependencies in Phase 1.

Usage
-----
    python scripts/generate_synthetic_dataset.py
    python scripts/generate_synthetic_dataset.py --students 300 --weeks 14 --seed 7
"""

from __future__ import annotations

import argparse
import csv
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

# --- Defaults & constants ---------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "raw" / "sample_lms_data.csv"

# Phase 12B: shrunk from 250×14 → 200×12 so the generated CSV stays under
# Vercel Hobby's 4.5 MB server-action body limit (the /upload endpoint
# round-trips the same CSV format). Local dev can still override via
# `npm run data:generate -- --students N --weeks W`.
DEFAULT_STUDENTS = 200
DEFAULT_WEEKS = 12
DEFAULT_SEED = 42

COHORT = "2026-spring"
COURSE_ID = "CS-201"
COURSE_TITLE = "Introduction to Data Structures"
COURSE_START = datetime(2026, 1, 12, 9, 0, 0, tzinfo=timezone.utc)  # Monday 09:00 UTC

RESOURCE_TYPES = ("VIDEO", "READING", "QUIZ", "FORUM", "LAB")
# Activities valid per resource type
ACTIVITY_BY_RESOURCE: dict[str, tuple[str, ...]] = {
    "VIDEO":   ("VIEW", "DOWNLOAD"),
    "READING": ("VIEW", "DOWNLOAD"),
    "QUIZ":    ("VIEW", "SUBMIT"),
    "FORUM":   ("VIEW", "POST", "COMMENT"),
    "LAB":     ("VIEW", "SUBMIT", "DOWNLOAD"),
}

# Behaviour group → proportion of the cohort
GROUP_WEIGHTS: dict[str, float] = {
    "high_engagement_high_performance": 0.20,
    "high_login_low_diversity":         0.15,
    "low_engagement_at_risk":           0.20,
    "improving_over_time":              0.20,
    "inconsistent_engagement":          0.25,
}

CSV_FIELDS = (
    "student_id",
    "course_id",
    "week_number",
    "resource_id",
    "resource_type",
    "activity_type",
    "timestamp",
    "duration_seconds",
    "quiz_score",
    "forum_posts",
    "prior_gpa",
    "final_grade",
)


# --- Data classes -----------------------------------------------------------

@dataclass(frozen=True)
class Resource:
    id: str
    type: str
    title: str


@dataclass
class BehaviourProfile:
    """A bundle of distributions describing how a group behaves week-to-week."""
    name: str
    # Per-week event count. Either a constant range or a callable (week -> range).
    weekly_events: tuple[int, int]
    # Distribution of events across resource types (must sum to 1.0).
    resource_mix: dict[str, float]
    # Quiz score distribution (mean, stdev). Clamped to [0, 100].
    quiz_score: tuple[float, float]
    # Per-event duration ranges (seconds) by resource type.
    duration_ranges: dict[str, tuple[int, int]]
    # Prior GPA distribution.
    prior_gpa: tuple[float, float]
    # Final grade is a function of (prior_gpa, average engagement, noise) —
    # see compute_final_grade(). These coefficients shape the relationship.
    base_grade: float                # intercept on a 0-100 scale
    gpa_coef: float                  # per-GPA-point
    engagement_coef: float           # per unit of normalised engagement
    grade_noise: float               # stdev of residual
    # Optional per-week multiplier on event count (e.g. improving cohort ramps).
    week_multiplier: callable = field(default=lambda w, total_weeks: 1.0)


@dataclass
class Student:
    id: str
    group: str
    prior_gpa: float
    # Computed after all weekly events are generated.
    final_grade: float = 0.0


# --- Behaviour profiles -----------------------------------------------------

def build_profiles() -> dict[str, BehaviourProfile]:
    """Return the canonical profile for each behaviour group."""

    def even_mix() -> dict[str, float]:
        # Balanced distribution across all 5 resource types.
        return {t: 0.20 for t in RESOURCE_TYPES}

    def video_heavy() -> dict[str, float]:
        return {"VIDEO": 0.80, "READING": 0.10, "QUIZ": 0.05, "FORUM": 0.02, "LAB": 0.03}

    def sparse_mix() -> dict[str, float]:
        return {"VIDEO": 0.40, "READING": 0.30, "QUIZ": 0.20, "FORUM": 0.05, "LAB": 0.05}

    standard_durations: dict[str, tuple[int, int]] = {
        "VIDEO":   (180, 1500),   # 3-25 min
        "READING": (120, 1800),   # 2-30 min
        "QUIZ":    (240, 1200),   # 4-20 min
        "FORUM":   (60, 600),     # 1-10 min
        "LAB":     (600, 3600),   # 10-60 min
    }

    def ramp_multiplier(week: int, total_weeks: int) -> float:
        # Linear ramp from 0.3 in week 1 to 1.5 in the final week.
        if total_weeks <= 1:
            return 1.0
        ratio = (week - 1) / (total_weeks - 1)
        return 0.3 + ratio * 1.2

    return {
        "high_engagement_high_performance": BehaviourProfile(
            name="high_engagement_high_performance",
            weekly_events=(18, 32),
            resource_mix=even_mix(),
            quiz_score=(85.0, 6.0),
            duration_ranges=standard_durations,
            prior_gpa=(3.0, 4.0),
            base_grade=55.0,
            gpa_coef=6.5,
            engagement_coef=12.0,
            grade_noise=3.0,
        ),
        "high_login_low_diversity": BehaviourProfile(
            name="high_login_low_diversity",
            weekly_events=(16, 28),
            resource_mix=video_heavy(),
            quiz_score=(62.0, 9.0),
            duration_ranges=standard_durations,
            prior_gpa=(2.5, 3.5),
            base_grade=50.0,
            gpa_coef=5.0,
            engagement_coef=6.0,         # high events but lower payoff (low RDI)
            grade_noise=4.0,
        ),
        "low_engagement_at_risk": BehaviourProfile(
            name="low_engagement_at_risk",
            weekly_events=(0, 5),
            resource_mix=sparse_mix(),
            quiz_score=(45.0, 12.0),
            duration_ranges=standard_durations,
            prior_gpa=(1.5, 2.8),
            base_grade=30.0,
            gpa_coef=5.5,
            engagement_coef=10.0,
            grade_noise=5.0,
        ),
        "improving_over_time": BehaviourProfile(
            name="improving_over_time",
            weekly_events=(2, 22),        # combined with ramp multiplier
            resource_mix=even_mix(),
            quiz_score=(68.0, 8.0),       # quiz_score also trends up via week scaling
            duration_ranges=standard_durations,
            prior_gpa=(2.0, 3.0),
            base_grade=45.0,
            gpa_coef=5.0,
            engagement_coef=11.0,
            grade_noise=4.0,
            week_multiplier=ramp_multiplier,
        ),
        "inconsistent_engagement": BehaviourProfile(
            name="inconsistent_engagement",
            weekly_events=(0, 22),
            resource_mix=sparse_mix(),
            quiz_score=(60.0, 14.0),
            duration_ranges=standard_durations,
            prior_gpa=(2.2, 3.4),
            base_grade=42.0,
            gpa_coef=5.5,
            engagement_coef=8.0,
            grade_noise=6.0,
        ),
    }


# --- Helpers ----------------------------------------------------------------

def weighted_choice(rng: random.Random, weights: dict[str, float]) -> str:
    keys = list(weights.keys())
    values = list(weights.values())
    return rng.choices(keys, weights=values, k=1)[0]


def assign_groups(rng: random.Random, n_students: int) -> list[str]:
    """Assign each student to a behaviour group, weighted by GROUP_WEIGHTS."""
    groups = list(GROUP_WEIGHTS.keys())
    weights = list(GROUP_WEIGHTS.values())
    return rng.choices(groups, weights=weights, k=n_students)


def build_resources(rng: random.Random, weeks: int) -> list[Resource]:
    """Build a stable catalogue of resources for the course."""
    catalogue: list[Resource] = []
    # 2 of each type per "block" of ~3 weeks, giving ~10 per type for a 14-week course.
    blocks = max(1, weeks // 3)
    counters: dict[str, int] = {t: 0 for t in RESOURCE_TYPES}
    for _ in range(blocks):
        for rtype in RESOURCE_TYPES:
            for _ in range(2):
                counters[rtype] += 1
                idx = counters[rtype]
                rid = f"{COURSE_ID}-{rtype[:3]}-{idx:03d}"
                title = f"{rtype.title()} {idx}"
                catalogue.append(Resource(id=rid, type=rtype, title=title))
    return catalogue


def pick_timestamp(rng: random.Random, week: int) -> datetime:
    """Random timestamp within the given course week."""
    week_start = COURSE_START + timedelta(weeks=week - 1)
    offset_seconds = rng.randint(0, 7 * 24 * 3600 - 1)
    return week_start + timedelta(seconds=offset_seconds)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def sampled_quiz_score(rng: random.Random, profile: BehaviourProfile,
                       week: int, total_weeks: int) -> float:
    """Quiz score sample, with an upward trend for the improving group."""
    mean, sd = profile.quiz_score
    if profile.name == "improving_over_time" and total_weeks > 1:
        # Shift mean by up to +20 from start to end of term.
        ratio = (week - 1) / (total_weeks - 1)
        mean = mean + ratio * 20.0
    return clamp(rng.gauss(mean, sd), 0.0, 100.0)


def sampled_duration(rng: random.Random, profile: BehaviourProfile, rtype: str) -> int:
    low, high = profile.duration_ranges[rtype]
    return rng.randint(low, high)


def events_for_week(rng: random.Random, profile: BehaviourProfile,
                    week: int, total_weeks: int) -> int:
    low, high = profile.weekly_events
    base = rng.randint(low, high)
    multiplier = profile.week_multiplier(week, total_weeks)
    return max(0, int(round(base * multiplier)))


# --- Grade computation ------------------------------------------------------

def compute_final_grade(rng: random.Random, profile: BehaviourProfile,
                        prior_gpa: float, mean_weekly_events: float,
                        mean_quiz_score: float) -> float:
    """
    Final grade is a noisy linear function of:
      - prior_gpa  (centred at 3.0 to keep effects symmetric)
      - normalised engagement (events per week, capped at 25)
      - mean quiz score (small bonus / penalty against a 60 baseline)
    Clamped to [0, 100].
    """
    gpa_term = profile.gpa_coef * (prior_gpa - 3.0)
    engagement_norm = min(mean_weekly_events / 25.0, 1.0)
    engagement_term = profile.engagement_coef * engagement_norm
    quiz_term = 0.15 * (mean_quiz_score - 60.0)
    noise = rng.gauss(0.0, profile.grade_noise)
    raw = profile.base_grade + gpa_term + engagement_term + quiz_term + noise
    return round(clamp(raw, 0.0, 100.0), 2)


# --- Generation -------------------------------------------------------------

def generate_dataset(n_students: int, weeks: int, seed: int) -> tuple[list[dict], dict]:
    """
    Generate the full event list plus a summary of how the cohort was built.
    Returns (rows, summary).
    """
    rng = random.Random(seed)
    profiles = build_profiles()
    resources = build_resources(rng, weeks)
    resources_by_type: dict[str, list[Resource]] = {t: [] for t in RESOURCE_TYPES}
    for r in resources:
        resources_by_type[r.type].append(r)

    groups = assign_groups(rng, n_students)
    students: list[Student] = []
    for idx, group in enumerate(groups, start=1):
        profile = profiles[group]
        prior_gpa = round(clamp(rng.uniform(*profile.prior_gpa), 0.0, 4.0), 2)
        students.append(Student(
            id=f"STU-{idx:04d}",
            group=group,
            prior_gpa=prior_gpa,
        ))

    # First pass: generate events per student, accumulate stats for grade calc.
    student_events: dict[str, list[dict]] = {s.id: [] for s in students}
    student_event_counts: dict[str, int] = {s.id: 0 for s in students}
    student_quiz_scores: dict[str, list[float]] = {s.id: [] for s in students}

    for student in students:
        profile = profiles[student.group]
        for week in range(1, weeks + 1):
            n_events = events_for_week(rng, profile, week, weeks)
            student_event_counts[student.id] += n_events
            for _ in range(n_events):
                rtype = weighted_choice(rng, profile.resource_mix)
                resource = rng.choice(resources_by_type[rtype])
                activity = rng.choice(ACTIVITY_BY_RESOURCE[rtype])
                ts = pick_timestamp(rng, week)
                duration = sampled_duration(rng, profile, rtype)

                quiz_score: float | None = None
                if rtype == "QUIZ" and activity == "SUBMIT":
                    quiz_score = sampled_quiz_score(rng, profile, week, weeks)
                    student_quiz_scores[student.id].append(quiz_score)

                forum_posts = 1 if (rtype == "FORUM" and activity == "POST") else 0

                student_events[student.id].append({
                    "student_id": student.id,
                    "course_id": COURSE_ID,
                    "week_number": week,
                    "resource_id": resource.id,
                    "resource_type": rtype,
                    "activity_type": activity,
                    "timestamp": ts.isoformat(),
                    "duration_seconds": duration,
                    "quiz_score": round(quiz_score, 2) if quiz_score is not None else "",
                    "forum_posts": forum_posts,
                    "prior_gpa": student.prior_gpa,
                    # final_grade is filled in a second pass once known.
                    "final_grade": None,
                })

    # Second pass: compute each student's final grade, then backfill it onto
    # every event row for that student (denormalised by design — matches the
    # CSV column spec in the Phase 1 task list).
    for student in students:
        profile = profiles[student.group]
        n_events = student_event_counts[student.id]
        mean_events = n_events / weeks
        quiz_scores = student_quiz_scores[student.id]
        mean_quiz = sum(quiz_scores) / len(quiz_scores) if quiz_scores else 60.0
        student.final_grade = compute_final_grade(
            rng, profile, student.prior_gpa, mean_events, mean_quiz
        )
        for row in student_events[student.id]:
            row["final_grade"] = student.final_grade

    # Flatten and sort for deterministic, human-friendly output.
    all_rows: list[dict] = []
    for s in students:
        all_rows.extend(student_events[s.id])
    all_rows.sort(key=lambda r: (r["student_id"], r["week_number"], r["timestamp"]))

    # Build summary stats for the log.
    group_counts: dict[str, int] = {g: 0 for g in GROUP_WEIGHTS}
    grade_by_group: dict[str, list[float]] = {g: [] for g in GROUP_WEIGHTS}
    for s in students:
        group_counts[s.group] += 1
        grade_by_group[s.group].append(s.final_grade)

    summary = {
        "n_students": n_students,
        "n_weeks": weeks,
        "n_resources": len(resources),
        "n_events": len(all_rows),
        "group_counts": group_counts,
        "mean_grade_by_group": {
            g: round(sum(v) / len(v), 2) if v else None
            for g, v in grade_by_group.items()
        },
    }
    return all_rows, summary


# --- IO & CLI ---------------------------------------------------------------

def write_csv(rows: Iterable[dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a synthetic LMS dataset for EduRAG (Phase 1)."
    )
    parser.add_argument("--students", type=int, default=DEFAULT_STUDENTS,
                        help=f"number of students (default: {DEFAULT_STUDENTS})")
    parser.add_argument("--weeks", type=int, default=DEFAULT_WEEKS,
                        help=f"number of course weeks (default: {DEFAULT_WEEKS})")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED,
                        help=f"RNG seed for reproducibility (default: {DEFAULT_SEED})")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH,
                        help=f"output CSV path (default: {DEFAULT_OUTPUT_PATH})")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not (100 <= args.students <= 500):
        print(f"warning: students={args.students} is outside the recommended 100-500 range")
    if not (12 <= args.weeks <= 15):
        print(f"warning: weeks={args.weeks} is outside the recommended 12-15 range")

    print(f"Generating synthetic LMS dataset: "
          f"{args.students} students × {args.weeks} weeks "
          f"(seed={args.seed})")

    rows, summary = generate_dataset(args.students, args.weeks, args.seed)
    write_csv(rows, args.output)

    print(f"Wrote {summary['n_events']:,} events to {args.output}")
    print(f"Resources: {summary['n_resources']}  |  Course: {COURSE_ID}")
    print("Behaviour group breakdown (count, mean final grade):")
    for group, count in summary["group_counts"].items():
        mean_grade = summary["mean_grade_by_group"][group]
        print(f"  {group:<38} n={count:<4} mean_grade={mean_grade}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
