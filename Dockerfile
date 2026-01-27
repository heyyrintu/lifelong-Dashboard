# ============================================
# Lifelong Dashboard - Frontend Dockerfile
# Multi-stage build for production
# ============================================

FROM node:20-alpine AS base

# ============================================
# Stage 1: Dependencies
# ============================================
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (need devDeps for build)
RUN npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY . .

# Set build-time environment variables
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_APPWRITE_ENDPOINT
ARG NEXT_PUBLIC_APPWRITE_PROJECT_ID
ARG NEXT_PUBLIC_APPWRITE_PROJECT_NAME

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_APPWRITE_ENDPOINT=$NEXT_PUBLIC_APPWRITE_ENDPOINT
ENV NEXT_PUBLIC_APPWRITE_PROJECT_ID=$NEXT_PUBLIC_APPWRITE_PROJECT_ID
ENV NEXT_PUBLIC_APPWRITE_PROJECT_NAME=$NEXT_PUBLIC_APPWRITE_PROJECT_NAME
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# ============================================
# Stage 3: Production Runner
# ============================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install wget for health checks
RUN apk add --no-cache wget curl

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the public folder
COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir -p .next && chown nextjs:nodejs .next

# Copy the standalone output (requires output: 'standalone' in next.config.ts)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Runtime environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=Asia/Kolkata

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
