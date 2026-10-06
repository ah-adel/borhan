#!/bin/sh
set -eu

mkdir -p /app/data /app/logs
chown -R app:app /app/data /app/logs

exec su app -s /bin/sh -c 'exec uvicorn app.main:app --host "$HOST" --port "$PORT" --workers "$WORKERS"'
