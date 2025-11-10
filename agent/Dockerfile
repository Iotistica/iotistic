# ---- Build stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native deps and SQLite3
RUN apt-get update && apt-get install -y python3 make g++ sqlite3 libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json tsconfig.build.json ./

# Install all deps (including dev)
RUN npm ci --legacy-peer-deps

COPY src ./src

# Build TypeScript using build-specific config (excludes CLI)
RUN npx tsc --project tsconfig.build.json && npm run copy:migrations

# ---- Production stage ------
FROM node:20-slim AS runtime

WORKDIR /app

COPY package*.json package-lock.json ./


# Install only production deps, then remove build tools in same layer
RUN apt-get update \
    && apt-get install -y python3 make g++ curl jq procps sqlite3 libsqlite3-dev \
    && apt-get install -y openvpn iproute2 iptables net-tools iputils-ping \
    && npm ci --omit=dev --legacy-peer-deps \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy built app
COPY --from=builder /app/dist ./dist

# Copy update scripts
COPY bin/update-agent-docker.sh /app/bin/update-agent-docker.sh
COPY bin/update-agent-systemd.sh /app/bin/update-agent-systemd.sh
RUN chmod +x /app/bin/update-agent-docker.sh /app/bin/update-agent-systemd.sh

# Data volume for persistent storage
RUN mkdir -p /app/data/vpn
VOLUME ["/app/data"]

# Set capabilities for OpenVPN (if running with appropriate Docker/K8s setup)
# Note: These capabilities must be granted at runtime by Docker/Kubernetes
# RUN setcap cap_net_admin+ep /usr/sbin/openvpn (requires privileged container)

EXPOSE 3002

CMD ["npm", "run", "start:device"]
