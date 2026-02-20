# Stage 1: Build
FROM node:20-bookworm AS builder

WORKDIR /app

# Install native build tools required by @discordjs/opus
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY tsconfig.json vite.config.ts postcss.config.js tailwind.config.ts drizzle.config.ts ./
COPY script/ ./script/
COPY server/ ./server/
COPY client/ ./client/
COPY shared/ ./shared/

RUN npm run build

# Stage 2: Production
FROM node:20-bookworm-slim

WORKDIR /app

# Install runtime dependencies for opus and music playback
RUN apt-get update && apt-get install -y \
    libopus0 \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy built output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Copy files needed at runtime
COPY package.json ./
COPY drizzle.config.ts ./
COPY shared/ ./shared/

# Expose the Express dashboard port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:5000/').then(r => { if (!r.ok) throw new Error(); process.exit(0); }).catch(() => process.exit(1))"

CMD ["node", "dist/index.cjs"]
