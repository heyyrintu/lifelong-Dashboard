# Production Deployment Checklist

## Pre-Deployment Steps

### 1. Environment Configuration
- [ ] Create `.env.local` from `.env.example` with production values
- [ ] Update `NEXT_PUBLIC_API_BASE_URL` to production backend URL
- [ ] Configure Appwrite project ID and endpoint
- [ ] Set `NODE_ENV=production` in backend `.env`
- [ ] Update database connection string for production

### 2. Security
- [ ] Remove all development/debug code
- [ ] Ensure all console.log statements are removed (✓ Done)
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure CORS origins properly
- [ ] Set strong JWT secrets (if using authentication)
- [ ] Review and restrict API rate limits

### 3. Performance Optimization
- [ ] Enable Next.js standalone output (✓ Done)
- [ ] Configure SWC minification (✓ Done)
- [ ] Optimize images and assets
- [ ] Enable CDN for static assets
- [ ] Configure caching strategies
- [ ] Database connection pooling

### 4. Testing
- [ ] Run full test suite: `npm run test`
- [ ] Type-check: `npm run type-check`
- [ ] Lint code: `npm run lint`
- [ ] Test production build locally: `npm run production:build && npm start`

### 5. Database
- [ ] Run database migrations: `npx prisma migrate deploy`
- [ ] Generate Prisma client: `npx prisma generate`
- [ ] Create database backups
- [ ] Set up automated backup schedule

## Build Commands

### Frontend
```bash
npm run production:build
npm start
```

### Backend
```bash
cd backend
npm run prisma:generate
npm run build
npm run start:prod
```

## Docker Deployment

### Build Images
```bash
# Frontend
docker build -t lifelong-dashboard-frontend .

# Backend
cd backend
docker build -t lifelong-dashboard-backend .
```

### Run with Docker Compose
```bash
docker-compose up -d
```

## Environment Variables Required

### Frontend (.env.local)
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_APPWRITE_ENDPOINT`
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- `NEXT_PUBLIC_APPWRITE_PROJECT_NAME`
- `NODE_ENV=production`

### Backend (.env)
- `DATABASE_URL`
- `PORT`
- `NODE_ENV=production`
- `CORS_ORIGINS`

## Post-Deployment

### 1. Health Checks
- [ ] Verify frontend is accessible
- [ ] Test backend API endpoints
- [ ] Check database connectivity
- [ ] Monitor application logs
- [ ] Test authentication flow

### 2. Monitoring
- [ ] Set up application monitoring
- [ ] Configure error tracking (Sentry, etc.)
- [ ] Set up performance monitoring
- [ ] Configure uptime monitoring

### 3. Backup & Recovery
- [ ] Verify database backups
- [ ] Test restore procedures
- [ ] Document recovery process

## Production Optimizations Applied

✅ **Removed unnecessary files:**
- Demo UI components (aurora-background-demo, border-trail-demo, etc.)
- Development test files (check-data.js, test-connection.js, etc.)
- AppwritePing development component

✅ **Code cleanup:**
- Removed all console.log statements (kept console.error for error handling)
- Configured automatic console removal in production builds

✅ **Next.js optimizations:**
- SWC minification enabled
- Image optimization configured
- Package import optimization for lucide-react, recharts, framer-motion
- Standalone output mode for smaller Docker images
- Compression enabled
- Removed powered-by header for security

✅ **Security improvements:**
- React strict mode enabled
- Helmet configured for backend
- CORS properly configured
- Environment variable examples provided

## Performance Tips

1. **Database:**
   - Use connection pooling
   - Add indexes for frequently queried fields
   - Monitor slow queries

2. **Frontend:**
   - Use React.lazy for code splitting
   - Optimize images (WebP/AVIF format)
   - Enable CDN for static assets

3. **Backend:**
   - Implement caching for expensive queries
   - Use rate limiting
   - Enable gzip compression

## Troubleshooting

**Build fails:**
- Check all environment variables are set
- Verify database connection
- Run `npm ci` to clean install dependencies

**Slow performance:**
- Check database query performance
- Enable caching
- Review bundle size: `npm run build` shows bundle analysis

**Database errors:**
- Verify migrations are up to date
- Check connection string format
- Ensure database is accessible from production server

## Rollback Plan

If deployment fails:
1. Revert to previous Docker image/commit
2. Restore database from last backup
3. Update DNS/load balancer to previous version
4. Monitor error logs
