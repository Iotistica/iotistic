# Stage 1: Builder
FROM node:20 AS builder
WORKDIR /usr/src/app

# Copy package files and install deps (cache layer)
COPY package*.json ./
RUN npm install

# Copy TypeScript config and sourcedfgdf
COPY tsconfig*.json ./
COPY src ./src
COPY database ./database

# Build with incremental compilation
RUN npm run build

# Stage 2: Production image
FROM node:20
WORKDIR /usr/src/app

# Copy built files and production deps
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package*.json ./
RUN npm install --production

# Install system dependencies
RUN apt-get update && apt-get install -y libnotify-bin curl && rm -rf /var/lib/apt/lists/*

EXPOSE 3002
CMD ["node", "dist/index.js"]
