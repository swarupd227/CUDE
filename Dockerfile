# ─────────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/src ./src
COPY frontend/index.html ./
COPY frontend/vite.config.js ./
COPY frontend/tailwind.config.js ./
COPY frontend/postcss.config.js ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 2: Production Node.js server
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache python3 make g++ ffmpeg

WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install

COPY backend/ ./

WORKDIR /app
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

WORKDIR /app/backend
CMD ["node", "server.js"]
