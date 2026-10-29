# The notifications service's image.
#
# Smaller than the API's again, and for the same kind of reason the auth
# service's is: no multer, no AWS SDK, no pdf-parse, no socket.io server. It
# does carry kafkajs, because consuming is its entire job, and the Socket.IO
# *emitter* - which is a Redis publisher, not a server.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY service-kit/package.json ./service-kit/
COPY server/package.json ./server/
COPY services/auth/package.json ./services/auth/
COPY services/notifications/package.json ./services/notifications/
COPY services/realtime/package.json ./services/realtime/
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
COPY services/notifications/package.json ./services/notifications/
COPY services/notifications/src ./services/notifications/src

USER node

EXPOSE 5003
CMD ["node", "services/notifications/src/server.js"]
