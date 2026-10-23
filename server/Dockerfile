# The API image. Multi-stage so the runtime layer carries no build tooling.
#
# This is a workspace monorepo, so every workspace's package.json has to be
# present before `npm ci` will resolve the lockfile - including the client's,
# which this image otherwise has no use for.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
# --omit=dev leaves out vitest and eslint; the API does not need them to run.
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# curl, because the compose healthcheck needs something to ask with.
RUN apk add --no-cache curl

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY server/package.json ./server/
COPY server/src ./server/src

# Never root. The uploads directory has to be writable by this user when the
# local storage provider is in use.
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads
USER node

EXPOSE 5001
CMD ["node", "server/src/server.js"]
