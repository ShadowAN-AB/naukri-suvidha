# The client is a static bundle. It is built here and served by nginx, which
# is also the load balancer and the reverse proxy - one edge, like the CDN and
# gateway pair it stands in for.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY service-kit/package.json ./service-kit/
COPY server/package.json ./server/
COPY services/auth/package.json ./services/auth/
COPY client/package.json ./client/
RUN npm ci --ignore-scripts
COPY shared ./shared
COPY client ./client
RUN npm run build --workspace=client

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/client/dist /usr/share/nginx/html

# A template rather than a conf, because the edge authenticates now and the
# shared secret it presents to the API must not be baked into an image.
#
# The nginx entrypoint runs envsubst over /etc/nginx/templates/*.template and
# writes the result into conf.d before starting. NGINX_ENVSUBST_FILTER - set
# in both stacks - restricts it to AUTH_GATEWAY_SECRET, so nginx's own $host,
# $remote_addr and $request_id survive untouched. Without that filter envsubst
# would replace every $name it recognised from the environment, which is a
# silently broken config rather than a failed start.
COPY infra/nginx/default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
