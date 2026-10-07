FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

FROM nginx:1.28.0-alpine
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY deploy/nginx-container.conf /etc/nginx/conf.d/default.conf
COPY deploy/publish-static.sh /docker-entrypoint.d/40-publish-matiane.sh
RUN chmod 755 /docker-entrypoint.d/40-publish-matiane.sh
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
