#!/usr/bin/env python3
"""
Task productivity dataset wrangling — training layer.

Uses ``app.services.task_feature_pipeline`` for parity with ``train_job_success_model.py``.
Writes CSV + legacy ``task_training_scaler.joblib`` (full-data scale — optional export only).

Usage (from repository root):
    PYTHONPATH=backend python scripts/build_adhd_task_training_layer.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT / "backend"))

from app.services.task_feature_pipeline import (  # noqa: E402
    TASK_NUM_COLS,
    load_profile_templates,
    wrangle_tasks_unscaled,
)

_DEFAULT_INPUT = _REPO_ROOT / "data" / "adhd_task_productivity.csv"
_DEFAULT_OUTPUT_CSV = _REPO_ROOT / "data" / "adhd_task_training_wrangled.csv"
_DEFAULT_OUTPUT_META = _REPO_ROOT / "data" / "adhd_task_training_meta.json"
_DEFAULT_SCALER_PATH = _REPO_ROOT / "backend" / "app" / "models" / "ml" / "task_training_scaler.joblib"
_DEFAULT_PROFILE_TEMPLATES = _REPO_ROOT / "data" / "adhd_profile_templates.json"


def main() -> None:
    src = Path(os.environ.get("ADHD_TASK_CSV", str(_DEFAULT_INPUT)))
    out_csv = Path(os.environ.get("ADHD_TASK_WRANGLED_CSV", str(_DEFAULT_OUTPUT_CSV)))
    out_meta = Path(os.environ.get("ADHD_TASK_WRANGLED_META", str(_DEFAULT_OUTPUT_META)))
    scaler_path = Path(os.environ.get("ADHD_TASK_SCALER_PATH", str(_DEFAULT_SCALER_PATH)))
    tpl_path = Path(os.environ.get("ADHD_PROFILE_TEMPLATES", str(_DEFAULT_PROFILE_TEMPLATES)))

    if not src.is_file():
        raise SystemExit(f"Input not found: {src}")
    if not tpl_path.is_file():
        raise SystemExit(f"Profile templates not found: {tpl_path}")

    profiles = load_profile_templates(tpl_path)
    seed = int(os.environ.get("SYNTHETIC_ADHD_SEED", "42"))
    rng = np.random.default_rng(seed)

    df_raw = pd.read_csv(src)
    rows_before = len(df_raw)
    df, dur_med, int_med = wrangle_tasks_unscaled(df_raw, profiles, rng)

    scaler = StandardScaler()
    df[TASK_NUM_COLS] = scaler.fit_transform(df[TASK_NUM_COLS])

    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_csv, index=False)

    scaler_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(scaler, scaler_path)

    try:
        rel_csv = str(out_csv.relative_to(_REPO_ROOT))
    except ValueError:
        rel_csv = str(out_csv)
    try:
        rel_scaler = str(scaler_path.relative_to(_REPO_ROOT))
    except ValueError:
        rel_scaler = str(scaler_path)
    try:
        rel_tpl = str(tpl_path.relative_to(_REPO_ROOT))
    except ValueError:
        rel_tpl = str(tpl_path)

    template_cols = list(profiles["1"].keys())
    meta = {
        "source_rows": rows_before,
        "rows_after_clean": len(df),
        "rows_dropped_clean": rows_before - len(df),
        "duration_median_used": float(dur_med),
        "interruptions_median_used": float(int_med),
        "normalized_columns": TASK_NUM_COLS,
        "task_type_dummy_columns": [c for c in df.columns if c.startswith("task_type_")],
        "complexity_encoding": "numeric_1_5_to_low_med_high_1_3",
        "output_csv": rel_csv,
        "scaler_path": rel_scaler,
        "note": "Export CSV uses full-fit scaler (not train/test split). Prefer train_job_success_model.py for production scaler.",
        "synthetic_adhd_injection": {
            "enabled": True,
            "templates_path": rel_tpl,
            "synthetic_types_sampled": [1, 2, 3],
            "random_seed": seed,
            "behavioural_feature_columns": template_cols,
        },
    }
    with open(out_meta, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote {out_csv} ({len(df)} rows)")
    print(f"Wrote legacy export scaler {scaler_path}")
    print(f"Wrote meta {out_meta}")


if __name__ == "__main__":
    main()
