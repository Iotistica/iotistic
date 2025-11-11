FROM node:20-alpine

# Install WireGuard tools and dependencies
RUN apk add --no-cache wireguard-tools iptables iproute2

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src
COPY migrations ./migrations

# Build TypeScript
RUN npm run build

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose API port (8089) and WireGuard port (51820/udp)
EXPOSE 8089 51820/udp

# Run the entrypoint script (brings up wg0, then starts Node.js)
ENTRYPOINT ["/docker-entrypoint.sh"]
