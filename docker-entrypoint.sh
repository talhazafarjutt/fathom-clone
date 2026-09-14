#!/bin/sh
set -e

# Apply pending migrations before booting. Set RUN_MIGRATIONS=false when a
# platform runs them as a separate release step instead.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> applying database migrations"
  # NODE_PATH lets prisma7.config.ts resolve dotenv from the migrator tree
  NODE_PATH=/app/migrator/node_modules \
    node /app/migrator/node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
