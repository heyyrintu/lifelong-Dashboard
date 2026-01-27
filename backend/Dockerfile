# ============================================
# Lifelong Dashboard - Backend Dockerfile
# Multi-stage build for NestJS + Prisma
# ============================================

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL and build tools for Prisma
RUN apt-get update -y && \
    apt-get install -y openssl libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package*.json ./

# Copy prisma schema for client generation
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY src ./src/
COPY tsconfig.json nest-cli.json ./

# Build the application
RUN npm run build

# ============================================
# Production stage
# ============================================
FROM node:20-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update -y && \
    apt-get install -y openssl wget curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nestjs

# Copy package files
COPY package*.json ./

# Copy prisma schema for runtime
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client for production (with correct binary targets)
RUN npx prisma generate

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy Item Master file (if exists - use conditional copy)
COPY ["Item master.xlsx", "./Item master.xlsx"]

# Create uploads directory with proper permissions
RUN mkdir -p uploads && chown -R nestjs:nodejs uploads

# Set correct ownership
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV TZ=Asia/Kolkata
ENV UPLOAD_DIR=./uploads

# Expose port
EXPOSE 3001

# Health check with longer start period for database connections
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
