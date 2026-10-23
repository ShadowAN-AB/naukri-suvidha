# The client is a static bundle. It is built here and served by nginx, which
# is also the load balancer and the reverse proxy - one edge, like the CDN and
# gateway pair it stands in for.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --ignore-scripts
COPY shared ./shared
COPY client ./client
RUN npm run build --workspace=client

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
