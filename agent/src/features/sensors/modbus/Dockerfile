FROM node:18-alpine

LABEL maintainer="Iotistic Team"
LABEL description="Modbus sensor adapter for Unix socket output"

# Install dependencies for serial communication
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    udev

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY dist/ ./dist/
COPY config/ ./config/

# Create socket directory
RUN mkdir -p /tmp/sensors

# Set permissions
RUN chown -R node:node /app /tmp/sensors

# Switch to non-root user
USER node

# Expose default Modbus TCP port (if needed)
EXPOSE 502

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const fs = require('fs'); process.exit(fs.existsSync('/tmp/sensors/modbus.sock') ? 0 : 1);"

# Default command
CMD ["node", "dist/index.js", "--config", "config/example.json"]