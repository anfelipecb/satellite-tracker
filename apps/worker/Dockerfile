# From monorepo root: docker build -f apps/worker/Dockerfile .
FROM node:20-bookworm-slim
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install
RUN pnpm --filter @satellite-tracker/shared build
RUN pnpm --filter worker build
WORKDIR /repo/apps/worker
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
