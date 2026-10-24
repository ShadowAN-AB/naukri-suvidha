#!/usr/bin/env bash
# Seed the clustered database. One shot, then the Job is left in place for
# `kubectl logs job/seed` to be worth running.
set -euo pipefail
NS=naukri-suvidha
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# A completed Job is immutable, so re-applying it changes nothing and looks
# exactly like a seed that quietly did not run. Delete first.
kubectl -n "$NS" delete job seed --ignore-not-found
kubectl apply -f "$HERE/seed-job.yaml"
kubectl -n "$NS" wait --for=condition=complete job/seed --timeout=300s
kubectl -n "$NS" logs job/seed --tail=30
