FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY web/package.json ./web/package.json
RUN npm ci --omit=dev --workspace api --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node api/src ./api/src
COPY --chown=node:node db ./db
USER node
EXPOSE 4000
CMD ["sh", "-c", "node api/src/migrate.mjs && exec node api/src/server.mjs"]
