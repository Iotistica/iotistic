# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native deps (Alpine uses apk)
RUN apk add --no-cache make g++ sqlite-dev

COPY package*.json tsconfig.json tsconfig.build.json ./

# Install all deps (including dev)
RUN npm ci --legacy-peer-deps

COPY src ./src

# Build TypeScript using build-specific config (excludes CLI)
RUN npx tsc --project tsconfig.build.json && npm run copy:migrations

# ---- Production stage ------
FROM node:20-alpine AS runtime

WORKDIR /app

# Install runtime dependencies in single layer
RUN apk add --no-cache \
    sqlite-libs \
    iptables \
    curl \
    jq \
    procps

COPY package*.json package-lock.json ./

# Install production deps only, then aggressively clean
RUN npm ci --omit=dev --legacy-peer-deps \
    && npm cache clean --force \
    # Remove entire unnecessary packages
    && rm -rf node_modules/prettier \
    && rm -rf node_modules/node-opcua-generator \
    && rm -rf node_modules/node-gyp \
    # Remove unnecessary files from node_modules
    && find node_modules -type f -name '*.md' -delete \
    && find node_modules -type f -name '*.txt' -delete \
    && find node_modules -type f -name 'LICENSE*' -delete \
    && find node_modules -type f -name 'CHANGELOG*' -delete \
    && find node_modules -type d -name 'test' -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name 'tests' -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name 'docs' -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name 'examples' -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name 'coverage' -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name '.github' -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name 'source' -exec rm -rf {} + 2>/dev/null || true \
    # Remove source maps and TypeScript source files (keep .d.ts for types)
    && find node_modules -type f -name '*.map' -delete \
    && find node_modules -type f -name '*.ts' ! -name '*.d.ts' -delete

# Copy built app
COPY --from=builder /app/dist ./dist

# Copy update scripts
COPY bin/update-agent-docker.sh /app/bin/update-agent-docker.sh
COPY bin/update-agent-systemd.sh /app/bin/update-agent-systemd.sh
RUN chmod +x /app/bin/update-agent-docker.sh /app/bin/update-agent-systemd.sh

# Data volume for persistent storage
RUN mkdir -p /app/data/vpn
VOLUME ["/app/data"]

EXPOSE 3002

# Use node directly instead of npm run to avoid npm overhead
CMD ["node", "dist/app.js"]
