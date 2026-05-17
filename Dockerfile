FROM node:24-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  python3 \
  python3-pip \
  bash \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY pnpm-lock.yaml ./

# Copy source packages
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY scripts/ ./scripts/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build API server
WORKDIR /app/artifacts/api-server
RUN pnpm run build

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
