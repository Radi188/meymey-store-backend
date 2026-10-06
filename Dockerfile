# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Only copy production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy firebase service account if present (optional, only if used)
COPY --from=builder /app/*.json ./

# The app defaults to 3033 for local dev; in the container it must listen on
# the port Hostinger / docker-compose route to (and the healthcheck calls).
ENV PORT=3030
EXPOSE 3030

CMD ["node", "dist/main.js"]
