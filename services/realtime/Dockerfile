# The realtime service's image.
#
# The smallest of the four, and the contents say why the extraction was worth
# doing first: no mongoose, no kafkajs, no multer, no AWS SDK, no pdf-parse.
# It carries socket.io - the *server* this time, where the notifications
# service carries only the Redis emitter - and nothing else of weight.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY service-kit/package.json ./service-kit/
COPY server/package.json ./server/
COPY services/auth/package.json ./services/auth/
COPY services/notifications/package.json ./services/notifications/
COPY services/realtime/package.json ./services/realtime/
COPY services/email/package.json ./services/email/
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
COPY services/realtime/package.json ./services/realtime/
COPY services/realtime/src ./services/realtime/src

USER node

EXPOSE 5004
CMD ["node", "services/realtime/src/server.js"]
