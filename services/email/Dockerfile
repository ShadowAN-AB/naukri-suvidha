# The email service's image.
#
# Smaller than the API's and roughly the shape of notifications': no socket.io,
# no multer, no pdf-parse, no AWS SDK. It carries kafkajs (consuming is its
# whole job) and nodemailer (sending is the other half). No HTTP routes behind
# authentication, so no helmet rules beyond the default, no cors beyond echoing
# the client origin for the health route.
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
COPY services/email/package.json ./services/email/
COPY services/email/src ./services/email/src

USER node

EXPOSE 5005
CMD ["node", "services/email/src/server.js"]
