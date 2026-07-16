#!/usr/bin/env bash
# Manages the dedicated Postgres container for integration tests.
set -euo pipefail

CONTAINER=vortex-test-db
PORT="${TEST_DB_PORT:-54329}"

case "${1:-start}" in
  start)
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
      docker start "$CONTAINER" >/dev/null
    else
      docker run -d --name "$CONTAINER" \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=vortex_test \
        -p "${PORT}:5432" \
        postgres:16-alpine >/dev/null
    fi
    for _ in $(seq 1 30); do
      if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
        echo "test db ready on port ${PORT}"
        exit 0
      fi
      sleep 1
    done
    echo "test db failed to become ready" >&2
    exit 1
    ;;
  stop)
    docker rm -f "$CONTAINER" >/dev/null
    echo "test db removed"
    ;;
  *)
    echo "usage: $0 [start|stop]" >&2
    exit 1
    ;;
esac
