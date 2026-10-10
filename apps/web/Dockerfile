# Build context: repository root (web imports workspace libs and the root lockfile).
#   docker build -f apps/web/Dockerfile --secret id=github_token,env=GITHUB_TOKEN -t snapdone-web .
# GITHUB_TOKEN reads @berrypjh packages from GitHub Packages (.npmrc); it is not kept in the image.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
ENV HUSKY=0 NX_DAEMON=false NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=github_token,env=GITHUB_TOKEN \
    pnpm install --frozen-lockfile --filter @snapdone/source --filter "@snapdone/web..."
# Public values inlined into the bundles at build time (deploy.sh passes them).
ARG NEXT_PUBLIC_SENTRY_DSN NEXT_PUBLIC_APP_RELEASE
RUN cd apps/web && pnpm exec next build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8080 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
