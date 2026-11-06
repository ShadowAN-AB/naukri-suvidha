#!/usr/bin/env bash
# Bring up the Docker containers npm run dev needs: Kafka + Redis.
#
# Runs automatically as `predev` before `npm run dev`. Idempotent — safe to
# call when Docker and the containers are already up. Also starts Docker
# Desktop itself on macOS if it isn't running.
set -euo pipefail

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$1"; }
fail() { printf '\033[1;31mXX %s\033[0m\n' "$1"; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

# 1. Make sure Docker is reachable. On macOS, start Docker Desktop if the
#    daemon is not already answering.
if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    step "Docker daemon not reachable — starting Docker Desktop"
    open -a Docker || fail "Could not launch Docker Desktop (install from https://www.docker.com/products/docker-desktop/)"

    printf "   waiting for Docker"
    for i in $(seq 1 90); do
      if docker info >/dev/null 2>&1; then
        printf " ready\n"
        break
      fi
      printf "."
      sleep 2
    done
    docker info >/dev/null 2>&1 || fail "Docker did not become ready within 3 minutes. Start it manually and retry."
  else
    fail "Docker daemon is not reachable. Start Docker and retry."
  fi
else
  step "Docker daemon is reachable"
fi

# 2. Start just the two containers npm run dev needs. The compose file knows
#    many more (api, auth, edge, mongo, …) — we deliberately start only the
#    infrastructure, because the application services are run by `npm run dev`
#    itself as Node processes.
step "Starting kafka + redis containers (idempotent)"
docker compose up -d kafka redis

# 3. Wait for the ports to answer. kafka's healthcheck inside the compose file
#    also runs, but from the host's perspective, listening on 9094 is what the
#    Node services actually need. The services' own ensureTopics logic covers
#    the race where the port is open but topics aren't created yet, so this is
#    enough.
step "Waiting for localhost:9094 (kafka) and localhost:6380 (redis)"
printf "   kafka"
for i in $(seq 1 60); do
  if nc -z localhost 9094 2>/dev/null; then
    printf " ready\n"
    break
  fi
  printf "."
  sleep 1
done
nc -z localhost 9094 2>/dev/null || fail "kafka did not open :9094 in 60 seconds. Try: docker compose logs kafka"

printf "   redis"
for i in $(seq 1 30); do
  if nc -z localhost 6380 2>/dev/null; then
    printf " ready\n"
    break
  fi
  printf "."
  sleep 1
done
nc -z localhost 6380 2>/dev/null || fail "redis did not open :6380 in 30 seconds. Try: docker compose logs redis"

step "Infrastructure up. Starting node services next…"
