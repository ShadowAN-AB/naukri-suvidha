# The auth service's image.
#
# Separate from the API's, and that is the point of step 5 rather than an
# inconvenience: the two deploy independently, roll independently, and scale
# independently. It is also a good deal smaller - no multer, no AWS SDK, no
# kafkajs, no pdf-parse, no socket.io.
#
# `npm ci` still needs every workspace's package.json present to resolve the
# lockfile, including ones this image has no use for. That is the cost of a
# single lockfile, and a single lockfile is what keeps the two services on the
# same version of express and the same version of mongoose.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY service-kit/package.json ./service-kit/
COPY server/package.json ./server/
COPY services/auth/package.json ./services/auth/
COPY client/package.json ./client/
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
COPY services/auth/package.json ./services/auth/
COPY services/auth/src ./services/auth/src

USER node

EXPOSE 5002
CMD ["node", "services/auth/src/server.js"]
