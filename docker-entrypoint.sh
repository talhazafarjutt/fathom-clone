#!/bin/sh
set -e

# Apply pending migrations before booting. Set RUN_MIGRATIONS=false when a
# platform runs them as a separate release step instead.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> applying database migrations"
  node /app/scripts/migrate.mjs
fi

exec "$@"
