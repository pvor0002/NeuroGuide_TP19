"""
Shared task productivity feature engineering (training + inference alignment).

Used by offline training scripts and ``job_task_success_infer`` so column order,
scaling targets, and categorical expansion stay identical.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

TASK_NUM_COLS: List[str] = [
    "estimated_duration",
    "interruptions",
    "energy_level",
    "time_since_last_break",
    "fatigue",
]

COMPLEXITY_MAP_STR = {"low": 1, "medium": 2, "high": 3}
COMPLEXITY_MAP_NUM = {1: 1, 2: 1, 3: 2, 4: 3, 5: 3}


def map_task_complexity(series: pd.Series) -> pd.Series:
    if series.dtype == object or pd.api.types.is_string_dtype(series):
        s = series.astype(str).str.strip().str.lower()
        return s.map(lambda x: COMPLEXITY_MAP_STR.get(x, pd.NA))
    return series.astype(float).round().astype(int).map(COMPLEXITY_MAP_NUM)


def clean_task_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    required = [
        "task_type",
        "task_complexity",
        "estimated_duration",
        "start_hour",
        "time_since_last_break",
        "previous_task_type",
        "interruptions",
        "energy_level",
        "completed",
    ]
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing columns: {missing_cols}")

    df = df.dropna(subset=required)
    df["estimated_duration"] = pd.to_numeric(df["estimated_duration"], errors="coerce")
    df["interruptions"] = pd.to_numeric(df["interruptions"], errors="coerce")
    df["energy_level"] = pd.to_numeric(df["energy_level"], errors="coerce")
    df["time_since_last_break"] = pd.to_numeric(df["time_since_last_break"], errors="coerce")
    df = df.dropna(subset=["estimated_duration", "interruptions", "energy_level", "time_since_last_break"])
    df["energy_level"] = df["energy_level"].clip(lower=0.5, upper=10.0)

    if df.duplicated().any():
        df = df.drop_duplicates()

    return df.reset_index(drop=True)


def wrangle_tasks_unscaled(
    df: pd.DataFrame,
    profiles: Dict[str, Any],
    rng: np.random.Generator,
) -> Tuple[pd.DataFrame, float, float]:
    """
    Clean → encode → engineer → synthetic ADHD injection. Does **not** scale TASK_NUM_COLS.

    Returns (dataframe, duration_median, interruptions_median) used for long_task / high_interruptions.
    """
    df = clean_task_frame(df)
    df = pd.get_dummies(df, columns=["task_type"], drop_first=True)
    df["task_complexity"] = map_task_complexity(df["task_complexity"])
    df = df.dropna(subset=["task_complexity"])
    df["task_complexity"] = df["task_complexity"].astype(int)

    dur_med = float(df["estimated_duration"].median())
    int_med = float(df["interruptions"].median())
    df["long_task"] = df["estimated_duration"] > dur_med
    df["high_interruptions"] = df["interruptions"] > int_med
    df["fatigue"] = df["time_since_last_break"] * (1 - df["energy_level"])

    ref_key = "1"
    if ref_key not in profiles:
        raise KeyError(f'profiles must contain "{ref_key}"')
    template_cols = list(profiles[ref_key].keys())
    df["synthetic_adhd_type"] = rng.choice([1, 2, 3], size=len(df))
    for col in template_cols:
        df[col] = df["synthetic_adhd_type"].apply(lambda x: float(profiles[str(int(x))][col]))

    return df, dur_med, int_med


def finalize_feature_matrix(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Drop ids/target, one-hot remaining categoricals, bool→int. Aligns with training/inference.
    """
    y = df["completed"].astype(int)
    X = df.drop(columns=["completed", "user_id", "task_id"], errors="ignore")

    obj_cols = X.select_dtypes(include=["object", "string"]).columns.tolist()
    if obj_cols:
        X = pd.get_dummies(X, columns=obj_cols, drop_first=False)

    for col in X.columns:
        if X[col].dtype == bool or str(X[col].dtype) == "boolean":
            X[col] = X[col].astype(int)

    return X, y


def load_profile_templates(path: Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)
