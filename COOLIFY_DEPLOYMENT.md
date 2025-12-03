# 🚀 Coolify Deployment Guide - Lifelong Dashboard

This guide provides step-by-step instructions for deploying the Lifelong Dashboard on Coolify, a self-hosting platform for web applications and databases.

## 📋 Prerequisites

- **Coolify Instance**: Access to a Coolify server (self-hosted or cloud)
- **Git Repository**: Your project pushed to GitHub/GitLab/Bitbucket
- **Domain**: Optional custom domain for your application
- **Database**: PostgreSQL database (Coolify managed or external)

## 🏗 Architecture Overview

The Lifelong Dashboard consists of:
- **Frontend**: Next.js 15 application (Port 3000)
- **Backend**: NestJS API server (Port 3001) 
- **Database**: PostgreSQL (Port 5432)

## 📦 Deployment Strategy

### Option 1: Single Application with Built-in Database
Deploy both frontend and backend as one application with Coolify-managed PostgreSQL.

### Option 2: Separate Services
Deploy frontend and backend as separate applications for better scalability.

---

## 🎯 Option 1: Single Application Deployment (Recommended)

### Step 1: Prepare Your Repository

Ensure your repository has the following structure and files:

```bash
Lifelong Dashboard/
├── package.json              # Frontend dependencies
├── backend/
│   ├── package.json         # Backend dependencies
│   ├── .env.example         # Environment template
│   └── prisma/
│       └── schema.prisma    # Database schema
├── docker-compose.yml       # Local development only
├── Dockerfile               # Production container
└── coolify.yaml            # Coolify configuration
```

### Step 2: Create Production Dockerfile

Create a `Dockerfile` in your project root:

```dockerfile
# Multi-stage build for production
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install frontend dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Install backend dependencies
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --only=production

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

COPY . .

# Build backend
WORKDIR /app/backend
RUN npm run build

# Build frontend
WORKDIR /app
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built applications
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/backend/dist ./backend/dist
COPY --from=builder --chown=nextjs:nodejs /app/backend/node_modules ./backend/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/backend/prisma ./backend/prisma
COPY --from=builder --chown=nextjs:nodejs /app/backend/package.json ./backend/

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### Step 3: Update Next.js Configuration

Modify `next.config.ts` for standalone output:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client']
  }
};

export default nextConfig;
```

### Step 4: Create Production Server

Create `server.js` in the project root:

```javascript
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { execSync } = require('child_process');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;

// Start backend server
console.log('Starting backend server...');
execSync('cd backend && npm run start:prod', { stdio: 'inherit' });

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
```

### Step 5: Configure Coolify

1. **Login to Coolify Dashboard**
2. **Create New Application**
3. **Select Git Repository**
4. **Choose Application Type**: Docker
5. **Configure Build Settings**:

```yaml
# coolify.yaml
name: lifelong-dashboard
services:
  - name: web
    source:
      type: git
      repository: your-username/lifelong-dashboard
      branch: main
    build:
      dockerfile: Dockerfile
      context: .
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=${DATABASE_URL}
      - CORS_ORIGINS=${CORS_ORIGINS}
    resources:
      memory: 1Gi
      cpu: 500m
    ports:
      - port: 3000
        protocol: http
```

### Step 6: Set Up Database

1. **In Coolify, go to Resources → Add Resource**
2. **Select PostgreSQL**
3. **Configure Database**:
   - Name: `lifelong-dashboard-db`
   - Version: PostgreSQL 15+
   - Initial Database: `lifelong_dashboard`

4. **Get Connection String** from Coolify database settings

### Step 7: Configure Environment Variables

In your Coolify application settings, add these environment variables:

```bash
# Frontend
NODE_ENV=production
PORT=3000

# Backend
DATABASE_URL=postgresql://username:password@host:5432/lifelong_dashboard
BACKEND_URL=http://localhost:3001
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Appwrite (if using)
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-appwrite-project-id
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1

# File Upload
MAX_FILE_SIZE_MB=25
```

### Step 8: Deploy

1. **Commit and push** your changes to Git
2. **Trigger deployment** in Coolify
3. **Monitor build logs** for any issues
4. **Run database migrations**:

```bash
# Access your application container in Coolify
# Run this command to apply database migrations
cd backend && npx prisma migrate deploy
```

---

## 🎯 Option 2: Separate Services Deployment

### Frontend Application

1. **Create static Next.js build**:
```bash
npm run build
```

2. **Configure as Static Site** in Coolify:
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Node Version: 18

### Backend Application

1. **Create backend Dockerfile**:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "start:prod"]
```

2. **Deploy as API Service** in Coolify with PostgreSQL database

---

## 🔧 Configuration Files

### Docker Compose for Production (Optional)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - postgres

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: lifelong_dashboard
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

### Health Check Configuration

Add to your Dockerfile:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
```

---

## 🔒 Security Considerations

1. **Environment Variables**: Never commit `.env` files
2. **Database Security**: Use strong passwords and SSL
3. **CORS**: Restrict to your domain only
4. **HTTPS**: Enable SSL/TLS in Coolify
5. **Rate Limiting**: Implement API rate limiting in NestJS

---

## 📊 Monitoring and Logs

### Coolify Monitoring

1. **Application Logs**: Available in Coolify dashboard
2. **Resource Usage**: CPU, Memory, Disk monitoring
3. **Health Checks**: Automatic health monitoring

### Application Monitoring

Add monitoring to your NestJS backend:

```typescript
// main.ts
import { Logger } from '@nestjs/common';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Health check endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  await app.listen(process.env.PORT || 3001);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
```

---

## 🚀 Production Optimizations

### 1. Database Optimization

```sql
-- Create indexes for better performance
CREATE INDEX idx_outbound_rows_delivery_note_date ON outbound_rows(delivery_note_date);
CREATE INDEX idx_outbound_rows_upload_id ON outbound_rows(upload_id);
CREATE INDEX idx_outbound_rows_normalized_category ON outbound_rows(normalized_category);
```

### 2. Caching

Consider adding Redis for caching (Coolify supports Redis):

```bash
# Add to environment variables
REDIS_URL=redis://username:password@host:6379
```

### 3. CDN Configuration

Configure CDN in Coolify for static assets:
- Enable CDN for your application
- Set up custom domain
- Configure SSL certificates

---

## 🔍 Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check Dockerfile syntax
   - Verify all dependencies are in package.json
   - Check build logs in Coolify

2. **Database Connection Errors**:
   - Verify DATABASE_URL format
   - Check database is running and accessible
   - Ensure migrations are applied

3. **CORS Issues**:
   - Update CORS_ORIGINS environment variable
   - Include your production domain

4. **Memory Issues**:
   - Increase memory allocation in Coolify
   - Optimize Next.js build size

### Debug Commands

Access your application container and run:

```bash
# Check application status
curl http://localhost:3000/health

# Check backend API
curl http://localhost:3001/outbound/summary

# View logs
tail -f /var/log/app.log

# Database connection test
cd backend && npx prisma db pull
```

---

## 📈 Scaling Considerations

### Horizontal Scaling

1. **Load Balancer**: Enable in Coolify
2. **Multiple Instances**: Configure replica count
3. **Database Scaling**: Use managed PostgreSQL service
4. **Redis**: Add for session storage and caching

### Performance Monitoring

1. **Set up alerts** in Coolify for:
   - High CPU usage
   - Memory leaks
   - Database connection issues
   - Application downtime

---

## 🎉 Deployment Checklist

Before going live:

- [ ] Repository is properly structured
- [ ] Dockerfile is optimized for production
- [ ] Environment variables are configured
- [ ] Database is set up and migrations applied
- [ ] SSL certificate is installed
- [ ] Domain is configured
- [ ] Health checks are working
- [ ] Monitoring is set up
- [ ] Backup strategy is in place
- [ ] Security audit is completed

---

## 📞 Support

For deployment issues:
1. Check Coolify documentation: https://coolify.io/docs
2. Review application logs in Coolify dashboard
3. Test with a minimal reproduction case
4. Contact your hosting provider if needed

---

**Version:** 1.0  
**Last Updated:** December 2024  
**Compatible with:** Coolify v4.x, Next.js 15, NestJS 10, PostgreSQL 15+
