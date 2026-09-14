# syntax=docker/dockerfile:1

# ---- dependencies ----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma's postinstall needs the schema, so copy it before installing.
COPY package.json package-lock.json prisma7.config.ts ./
COPY prisma ./prisma

RUN npm ci --ignore-scripts && npx prisma generate

# ---- migrator --------------------------------------------------------------
# The Prisma CLI has a dependency closure that cannot be cherry-picked out of
# the app's node_modules, so install it standalone. Version follows the app's
# package.json automatically. dotenv comes along because prisma7.config.ts
# imports it.
FROM node:22-alpine AS migrator
WORKDIR /mig
COPY package.json ./app-package.json
RUN VERSION=$(node -p "const p=require('./app-package.json');(p.dependencies?.prisma||p.devDependencies?.prisma||'latest').replace(/^[^0-9]*/,'')") \
 && npm init -y > /dev/null \
 && npm i --no-fund --no-audit --omit=optional "prisma@${VERSION}" dotenv \
 && rm -f app-package.json

# ---- build -----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# next build imports server code; a placeholder URL keeps the Prisma client
# constructible at build time. The real value is injected at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/lib/generated ./lib/generated
COPY . .

RUN npx next build

# ---- runtime ---------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ffmpeg extracts an audio track from video uploads and from containers the
# transcription provider does not accept.
RUN apk add --no-cache ffmpeg \
 && addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Next's standalone output: server + only the dependencies it actually traced.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma CLI and migrations, so the container can migrate itself on boot.
COPY --from=migrator --chown=nextjs:nodejs /mig/node_modules ./migrator/node_modules
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs prisma7.config.ts ./prisma7.config.ts
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh

# Local-disk storage driver writes here; mount a volume to keep it.
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
