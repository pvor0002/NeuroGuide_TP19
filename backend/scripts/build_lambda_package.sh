#!/usr/bin/env bash
# Build Lambda deployment zip + optional ML layers (AWS 250MB unzipped limit per zip/layer).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PIP_PLATFORM=(--platform manylinux2014_x86_64 --python-version 3.11 --only-binary=:all:)
LAMBDA_LIMIT_BYTES=262144000
SAFE_LIMIT_BYTES=248000000

prune_tree() {
  local dir="$1"
  find "$dir" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
  find "$dir" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
  find "$dir" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
  find "$dir" -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true
  find "$dir" -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true
}

dir_bytes() {
  du -sb "$1" | awk '{print $1}'
}

check_size() {
  local label="$1"
  local dir="$2"
  local bytes
  bytes="$(dir_bytes "$dir")"
  echo "$label unzipped size: $(( bytes / 1024 / 1024 )) MB ($bytes bytes)"
  if [ "$bytes" -gt "$SAFE_LIMIT_BYTES" ]; then
    echo "ERROR: $label exceeds Lambda safe limit ($SAFE_LIMIT_BYTES bytes)." >&2
    exit 1
  fi
}

install_layer() {
  local req="$1"
  local out_zip="$2"
  local build_dir
  build_dir="$(mktemp -d)"
  pip install -r "$req" -t "$build_dir/python" "${PIP_PLATFORM[@]}" --upgrade
  prune_tree "$build_dir"
  check_size "$(basename "$out_zip" .zip)" "$build_dir"
  (cd "$build_dir" && zip -r "$ROOT/$out_zip" python -x "*.pyc" -q)
  rm -rf "$build_dir"
  echo "Wrote $out_zip"
}

echo "=== Building ML layer: scipy ==="
install_layer requirements-lambda-layer-scipy.txt lambda_layer_scipy.zip

echo "=== Building ML layer: numpy/pandas/sklearn (scipy comes from layer 1) ==="
build_ml_layer() {
  local out_zip="lambda_layer_ml.zip"
  local build_dir
  build_dir="$(mktemp -d)"
  pip install numpy pandas joblib threadpoolctl \
    -t "$build_dir/python" "${PIP_PLATFORM[@]}" --upgrade
  pip install scikit-learn --no-deps \
    -t "$build_dir/python" "${PIP_PLATFORM[@]}"
  prune_tree "$build_dir"
  check_size "lambda_layer_ml" "$build_dir"
  (cd "$build_dir" && zip -r "$ROOT/$out_zip" python -x "*.pyc" -q)
  rm -rf "$build_dir"
  echo "Wrote $out_zip"
}
build_ml_layer

echo "=== Building function package ==="
rm -rf ./package
pip install -r requirements-lambda.txt -t ./package "${PIP_PLATFORM[@]}" --upgrade
cp -r app ./package/
prune_tree ./package
check_size "function" ./package
(cd ./package && zip -r ../lambda_package.zip . -x "*.pyc" -q)
echo "Wrote lambda_package.zip"
