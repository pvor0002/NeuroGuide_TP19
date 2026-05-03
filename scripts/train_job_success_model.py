#!/usr/bin/env python3
"""
Train RandomForestClassifier on raw task CSV + synthetic ADHD profiles.

Refits StandardScaler **only on X_train** numeric task columns (no reuse of
wrangling scaler). Persists feature order for inference alignment.

Usage (from repository root):
    PYTHONPATH=backend python scripts/train_job_success_model.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT / "backend"))

from app.services.task_feature_pipeline import (  # noqa: E402
    TASK_NUM_COLS,
    finalize_feature_matrix,
    load_profile_templates,
    wrangle_tasks_unscaled,
)

_DEFAULT_RAW = _REPO_ROOT / "data" / "adhd_task_productivity.csv"
_DEFAULT_TEMPLATES = _REPO_ROOT / "data" / "adhd_profile_templates.json"
_DEFAULT_MODEL = _REPO_ROOT / "backend" / "app" / "models" / "ml" / "job_success_model.pkl"
_DEFAULT_SCALER = _REPO_ROOT / "backend" / "app" / "models" / "ml" / "scaler.pkl"
_DEFAULT_FEATURES = _REPO_ROOT / "backend" / "app" / "models" / "ml" / "job_success_feature_names.json"
_DEFAULT_META = _REPO_ROOT / "backend" / "app" / "models" / "ml" / "job_success_train_meta.json"


def _rel_to_repo(path: Path) -> str:
    try:
        return str(path.relative_to(_REPO_ROOT))
    except ValueError:
        return str(path)


def _json_safe(o):
    if isinstance(o, dict):
        return {str(k): _json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_json_safe(v) for v in o]
    if hasattr(o, "item"):
        try:
            return o.item()
        except Exception:
            pass
    if isinstance(o, (float, int, str)) or o is None:
        return o
    return float(o) if isinstance(o, (np.floating, np.integer)) else str(o)


def main() -> None:
    raw_path = Path(os.environ.get("JOB_SUCCESS_RAW_CSV", str(_DEFAULT_RAW)))
    tpl_path = Path(os.environ.get("ADHD_PROFILE_TEMPLATES", str(_DEFAULT_TEMPLATES)))
    model_path = Path(os.environ.get("JOB_SUCCESS_MODEL_OUT", str(_DEFAULT_MODEL)))
    scaler_out = Path(os.environ.get("JOB_SUCCESS_SCALER_OUT", str(_DEFAULT_SCALER)))
    feat_out = Path(os.environ.get("JOB_SUCCESS_FEATURE_NAMES_OUT", str(_DEFAULT_FEATURES)))
    meta_out = Path(os.environ.get("JOB_SUCCESS_TRAIN_META", str(_DEFAULT_META)))
    test_size = float(os.environ.get("TRAIN_TEST_SIZE", "0.2"))
    seed = int(os.environ.get("TRAIN_RANDOM_STATE", "42"))

    if not raw_path.is_file():
        raise SystemExit(f"Raw task CSV not found: {raw_path}")
    if not tpl_path.is_file():
        raise SystemExit(f"Templates not found: {tpl_path}\nRun scripts/build_adhd_profile_templates.py")

    profiles = load_profile_templates(tpl_path)
    rng = np.random.default_rng(seed)

    df_raw = pd.read_csv(raw_path)
    df_wr, dur_med, int_med = wrangle_tasks_unscaled(df_raw, profiles, rng)
    X, y = finalize_feature_matrix(df_wr)

    feature_names = list(X.columns)
    X = X[feature_names]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=seed, stratify=y
    )

    scaler = StandardScaler()
    X_train = X_train.copy()
    X_test = X_test.copy()
    X_train[TASK_NUM_COLS] = scaler.fit_transform(X_train[TASK_NUM_COLS])
    X_test[TASK_NUM_COLS] = scaler.transform(X_test[TASK_NUM_COLS])

    X_train = X_train[feature_names]
    X_test = X_test[feature_names]

    vc = y_train.value_counts()
    imbalanced = len(vc) >= 2 and (vc.min() / vc.max() < 0.5)
    clf_kw = dict(n_estimators=100, random_state=seed)
    if imbalanced:
        clf_kw["class_weight"] = "balanced"

    model = RandomForestClassifier(**clf_kw)
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    acc = float(accuracy_score(y_test, preds))
    print(f"Accuracy: {acc:.4f}")
    print(classification_report(y_test, preds, digits=4))

    roc = None
    try:
        proba = model.predict_proba(X_test)
        if proba.shape[1] >= 2:
            roc = float(roc_auc_score(y_test, proba[:, 1]))
            print(f"ROC-AUC: {roc:.4f}")
    except Exception as ex:
        print(f"ROC-AUC skipped: {ex}")

    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_out)

    with open(feat_out, "w", encoding="utf-8") as f:
        json.dump(feature_names, f, indent=2)

    train_meta = {
        "accuracy_holdout": acc,
        "roc_auc_holdout": roc,
        "classification_report": _json_safe(
            classification_report(y_test, preds, digits=4, output_dict=True)
        ),
        "class_weight_balanced": bool(imbalanced),
        "class_balance_train": {str(k): int(v) for k, v in vc.items()},
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "n_features": len(feature_names),
        "feature_names_path": _rel_to_repo(feat_out),
        "scaling_columns": TASK_NUM_COLS,
        "duration_median_fit": dur_med,
        "interruptions_median_fit": int_med,
        "test_size": test_size,
        "random_state": seed,
        "model_path": _rel_to_repo(model_path),
        "scaler_path": _rel_to_repo(scaler_out),
        "data_path_raw": _rel_to_repo(raw_path),
    }
    with open(meta_out, "w", encoding="utf-8") as f:
        json.dump(train_meta, f, indent=2)

    print(f"Saved model -> {model_path}")
    print(f"Saved scaler -> {scaler_out}")
    print(f"Saved feature list -> {feat_out}")
    print(f"Saved meta -> {meta_out}")


if __name__ == "__main__":
    main()
