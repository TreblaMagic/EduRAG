# =============================================================================
# EduRAG — optional Dockerfile.
#
# Builds a single-stage Node 20 image that runs `next start` against a
# SQLite database mounted at /app/prisma/dev.db.
#
# Docker is OPTIONAL. The local-first workflow (`npm run setup && npm run dev`)
# is the recommended path. Use this when you want a fully isolated runtime
# (interview screenshots, hosted demos, CI smoke tests).
#
# Build:   docker compose build
# Run:     docker compose up
# Visit:   http://localhost:3000
# =============================================================================

FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install Python + build tooling. Python is optional at runtime but lets
# the synthetic-data generator and (optionally) the advanced causal /
# prediction engines work inside the container without a host install.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       python3-pip \
       openssl \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install JS dependencies first to leverage layer cache.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy the rest of the source tree.
COPY . .

# Generate the Prisma client + build the Next.js production bundle.
RUN npx prisma generate \
    && npm run build

EXPOSE 3000

# Use a permissive script that runs migrations + (optionally) bootstraps
# data on first start; safe to re-run because every step is idempotent.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run setup && npm start"]
