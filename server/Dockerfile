FROM node:24.21.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src/model.js ./src/model.js
COPY server/ ./server/
RUN node --test server/server.test.js && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data SECURE_COOKIES=true TRUST_PROXY=true
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=4s --start-period=20s --retries=3 CMD node /app/server/health.js
CMD ["node", "server/index.js"]
