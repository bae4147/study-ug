#!/usr/bin/env bash
# Pulls every customised piece participants made -- media plus record.json --
# into exports/custom/<uid>/<sessionId>/<modality>-<timestamp>/ for review.
#
#   gcloud auth login            # once, if not already signed in
#   bash scripts/export-custom.sh
#
# Nothing is deleted from storage by this or by anything else in the project:
# the bucket has no lifecycle rule, so what a participant saw stays retrievable.
set -euo pipefail
BUCKET="gs://study-ug-osu.firebasestorage.app/custom"
OUT="$(cd "$(dirname "$0")/.." && pwd)/exports"
mkdir -p "$OUT"
gcloud storage cp -r "$BUCKET" "$OUT/"
echo "records: $(find "$OUT/custom" -name record.json | wc -l | tr -d ' ')  →  $OUT/custom"
