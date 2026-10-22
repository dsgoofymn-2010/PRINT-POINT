# ---- Build stage ----
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY server/prisma server/prisma
RUN npm ci --ignore-scripts && npm rebuild prisma @prisma/client @prisma/engines esbuild
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY server/prisma server/prisma
RUN npm ci --omit=dev --workspace server --ignore-scripts \
  && npm install --no-save prisma@5.22.0 --ignore-scripts \
  && npm rebuild prisma @prisma/client @prisma/engines \
  && npx --workspace server prisma generate
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
RUN mkdir -p server/uploads && chown -R node:node server/uploads
USER node
WORKDIR /app/server
EXPOSE 4000
# Apply pending migrations, then start the API (which also serves the built frontend).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
