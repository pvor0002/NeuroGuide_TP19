#!/usr/bin/env python3
"""
ADHD dataset wrangling — profiling layer.

Loads ``data/ADHD dataset 4 classes u2.csv``, cleans, builds behavioural features,
normalizes numeric columns, aggregates templates per Diagnosis_Class, writes JSON.

Usage (from repository root):
    python scripts/build_adhd_profile_templates.py

Optional:
    ADHD_DATASET_CSV=/path/to/file.csv python scripts/build_adhd_profile_templates.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import pandas as pd
from sklearn.preprocessing import StandardScaler

_REPO_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_INPUT = _REPO_ROOT / "data" / "ADHD dataset 4 classes u2.csv"
_DEFAULT_OUTPUT = _REPO_ROOT / "data" / "adhd_profile_templates.json"


def main() -> None:
    csv_path = Path(os.environ.get("ADHD_DATASET_CSV", str(_DEFAULT_INPUT)))
    out_path = Path(os.environ.get("ADHD_PROFILE_TEMPLATES_OUT", str(_DEFAULT_OUTPUT)))

    if not csv_path.is_file():
        raise SystemExit(f"Input CSV not found: {csv_path}")

    # --- Step 1: Load & clean ---
    df = pd.read_csv(csv_path)

    before = len(df)
    n_cols = len(df.columns)
    thresh = max(1, int(math.ceil(n_cols * 0.7)))
    df = df.dropna(thresh=thresh)
    dropped_sparse = before - len(df)

    num_for_median = df.select_dtypes(include=["number"]).columns
    df[num_for_median] = df[num_for_median].fillna(df[num_for_median].median())

    # Remaining NaNs in non-numeric columns: drop or mode — dataset is mostly numeric
    df = df.dropna()

    # --- Step 2: Core behavioural features ---
    q1_cols = [f"Q1_{i}" for i in range(1, 10)]
    q2_cols = [f"Q2_{i}" for i in range(1, 10)]
    df["inattention_score"] = df[q1_cols].mean(axis=1)
    df["hyperactivity_score"] = df[q2_cols].mean(axis=1)

    # --- Step 3: Select useful columns ---
    features = [
        "inattention_score",
        "hyperactivity_score",
        "Sleep_Hours",
        "Daily_Activity_Hours",
        "Focus_Score_Video",
        "Difficulty_Organizing_Tasks",
        "Anxiety_Depression_Levels",
        "Diagnosis_Class",
    ]
    missing = [c for c in features if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing expected columns: {missing}")

    df = df[features].copy()

    # --- Step 4: Normalize (exclude label) ---
    num_cols = features[:-1]
    scaler = StandardScaler()
    df[num_cols] = scaler.fit_transform(df[num_cols])

    # --- Step 5: ADHD type templates (per Diagnosis_Class, normalized space) ---
    profiles_df = df.groupby("Diagnosis_Class", observed=True).mean()
    adhd_profiles: dict[str, dict[str, float]] = {}
    for cls, row in profiles_df.iterrows():
        key = str(int(cls)) if float(cls).is_integer() else str(cls)
        adhd_profiles[key] = {k: float(row[k]) for k in num_cols}

    # --- Step 6: Save ---
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(adhd_profiles, f, indent=2, sort_keys=True)

    print(f"Wrote {out_path}")
    print(f"  Rows after cleaning: {len(df)} (dropped {dropped_sparse} sparse-null rows before feature build)")
    print(f"  Classes: {sorted(adhd_profiles.keys(), key=lambda x: int(x))}")


if __name__ == "__main__":
    main()
