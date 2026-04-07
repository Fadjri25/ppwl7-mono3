FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace manifests dulu (layer caching)
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

COPY apps/backend/prisma ./apps/backend/prisma

RUN bun install

# Copy source
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared

WORKDIR /app/apps/backend

# Generate Prisma client
RUN bunx prisma generate

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]