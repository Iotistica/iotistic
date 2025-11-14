# Stage 1: Dependencies (production only)
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only with cleanup
RUN npm ci --only=production && \
    npm cache clean --force && \
    # Remove unnecessary files from node_modules
    find node_modules -type f -name '*.md' -delete && \
    find node_modules -type f -name 'LICENSE*' -delete && \
    find node_modules -type f -name 'CHANGELOG*' -delete && \
    find node_modules -type d -name 'test' -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name 'tests' -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name 'docs' -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name 'examples' -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name '.github' -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type f -name '*.map' -delete && \
    find node_modules -type f -name '*.ts' ! -name '*.d.ts' -delete

# Stage 2: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and tsconfig
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies and tini
RUN apk add --no-cache \
    curl \
    tini && \
    rm -rf /var/cache/apk/*

# Create non-root user and group
RUN addgroup -S postofficegroup && \
    adduser -S postofficeuser -G postofficegroup && \
    mkdir -p /app/logs && \
    chown -R postofficeuser:postofficegroup /app

# Copy package files
COPY --chown=postofficeuser:postofficegroup package*.json ./

# Copy production dependencies from deps stage
COPY --from=deps --chown=postofficeuser:postofficegroup /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder --chown=postofficeuser:postofficegroup /app/dist ./dist

# Switch to non-root user
USER postofficeuser

# Expose port
EXPOSE 3300

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3300/health || exit 1

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]

# Start service
CMD ["node", "dist/server.js"]
