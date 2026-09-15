#!/bin/sh
set -e

# Fail with a readable message on a misconfigured environment, before the
# process gets far enough to produce a provider error code instead.
node /app/scripts/check-env.mjs --phase=deploy

# Apply pending migrations before booting. Set RUN_MIGRATIONS=false when a
# platform runs them as a separate release step instead.

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> applying database migrations"
  node /app/scripts/migrate.mjs
fi

exec "$@"
