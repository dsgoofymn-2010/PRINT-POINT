# ---- Build stage ----
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
RUN npm ci --ignore-scripts && npm rebuild prisma @prisma/client @prisma/engines esbuild
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
RUN npm ci --omit=dev --workspace backend --ignore-scripts \
  && npm install --no-save prisma@5.22.0 --ignore-scripts \
  && npm rebuild prisma @prisma/client @prisma/engines \
  && npx --workspace backend prisma generate
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist
RUN mkdir -p backend/uploads && chown -R node:node backend/uploads
USER node
WORKDIR /app/backend
EXPOSE 4000
# Apply pending migrations, then start the API (which also serves the built frontend).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
