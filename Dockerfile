FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ARG forces this and every subsequent layer to bust BuildKit's registry cache
# on every commit — without it, prisma generate's output blob gets reused from
# a prior build even when schema.prisma content changed.
ARG CACHEBUST=unset
RUN echo "CACHEBUST=$CACHEBUST" && rm -rf node_modules/.prisma && npx prisma generate
# `next build` collects page data by importing every route module, which
# instantiates the Prisma client (lib/db.ts throws if DATABASE_URL is unset).
# No DB connection is made during the build — all DB routes are dynamic — so a
# throwaway URL just satisfies the module-load guard. The real DATABASE_URL is
# injected at runtime via docker-compose env; this value is confined to the
# builder stage and never reaches the runner image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Full node_modules + .next (not standalone) so the Prisma CLI and tsx are
# available at runtime for `prisma db push` and `prisma db seed`.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
CMD ["./entrypoint.sh"]
