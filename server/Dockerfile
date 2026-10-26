# The API image. Multi-stage so the runtime layer carries no build tooling.
#
# This is a workspace monorepo, so every workspace's package.json has to be
# present before `npm ci` will resolve the lockfile - including the client's,
# which this image otherwise has no use for.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY service-kit/package.json ./service-kit/
COPY server/package.json ./server/
COPY services/auth/package.json ./services/auth/
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
COPY service-kit ./service-kit
COPY server/package.json ./server/
COPY server/src ./server/src
# The seed script imports the auth service's schemas: it is the one thing that
# writes both databases, because a student profile has to name a user that
# exists. schemas.js and not model.js - model.js registers the models, and
# registering one here would create its collections in the API's database.
COPY services/auth/package.json ./services/auth/
COPY services/auth/src/schemas.js ./services/auth/src/schemas.js
# The operational scripts ship too: seeding the stack is part of running it,
# and `docker compose run seed` has nowhere else to get them from.
COPY server/scripts ./server/scripts

# Never root. The uploads directory has to be writable by this user when the
# local storage provider is in use.
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads
USER node

EXPOSE 5001
CMD ["node", "server/src/server.js"]
