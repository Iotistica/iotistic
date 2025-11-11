FROM node:20-alpine

# Install WireGuard tools
RUN apk add --no-cache wireguard-tools iptables

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

# Expose API port
EXPOSE 8080

# Run the server
CMD ["node", "dist/server.js"]
