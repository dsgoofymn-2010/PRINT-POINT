# Backend API image (Render builds this with Root Directory = backend).
# ---- Build stage ----
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma prisma
RUN npm ci --ignore-scripts && npx prisma generate
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma prisma
RUN npm ci --omit=dev --ignore-scripts \
  && npm install --no-save prisma@5.22.0 --ignore-scripts \
  && npx prisma generate
COPY --from=build /app/dist dist
RUN mkdir -p uploads && chown -R node:node uploads
USER node
EXPOSE 4000
# Apply pending migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
