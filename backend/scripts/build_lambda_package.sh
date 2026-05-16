#!/usr/bin/env bash
# Legacy zip builder (local experiments only).
# Production deploy uses backend/Dockerfile — see .github/workflows/deploy-backend.yml
#
# AWS limits TOTAL unzipped size of function + all layers to 250MB, so the ML stack
# cannot fit as zip + multiple layers. Use container deploy instead.
set -euo pipefail

echo "ERROR: Zip/layer deploy was removed — ML deps exceed Lambda's 250MB combined limit." >&2
echo "Use: docker build -t neuroguide-api backend && deploy via ECR (see deploy-backend.yml)" >&2
exit 1
