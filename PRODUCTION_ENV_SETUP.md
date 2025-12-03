# 🚀 Production Environment Setup

## Frontend Environment Variables ( Coolify - Frontend App )

For `lifelong.dronalogitech.cloud` ( Next.js app ):

```bash
# Basic Next.js runtime
NODE_ENV=production
PORT=3000

# Backend API URL ( your NestJS service )
NEXT_PUBLIC_API_BASE_URL=https://lifelongbackend.dronalogitech.cloud

# Appwrite ( public - safe to expose to browser )
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=692932d700154b91c6cb
NEXT_PUBLIC_APPWRITE_PROJECT_NAME=lifelong-dashboard
```

## Backend Environment Variables ( Coolify - Backend App )

For `lifelongbackend.dronalogitech.cloud` ( NestJS service ):

```bash
# Database ( your PostgreSQL service )
DATABASE_URL=postgresql://postgres:your-password@your-postgres-host:5432/lifelong_dashboard

# Server
PORT=3001
NODE_ENV=production

# CORS - allow your frontend domain
CORS_ORIGINS=https://lifelong.dronalogitech.cloud

# File upload
MAX_FILE_SIZE_MB=25
UPLOAD_DIR=./uploads

# JWT Authentication ( optional - uncomment when needed )
# JWT_SECRET=your-super-secret-key-change-in-production-min-32-chars
# JWT_EXPIRES_IN=24h
```

## Database Environment Variables ( Coolify - PostgreSQL Service )

```bash
POSTGRES_DB=lifelong_dashboard
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-secure-password
```

## Coolify Configuration Summary

### Frontend App
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Port**: 3000
- **Domain**: `lifelong.dronalogitech.cloud`
- **Dockerfile**: Included in repo

### Backend App  
- **Build Command**: `npm run build`
- **Start Command**: `npm run start:prod`
- **Port**: 3001
- **Domain**: `lifelongbackend.dronalogitech.cloud`
- **Health Check**: `/health`

### PostgreSQL Service
- **Version**: PostgreSQL 15+
- **Port**: 5432
- **Database**: `lifelong_dashboard`

## Deployment Checklist

Before deploying to production:

- [ ] Set all environment variables above
- [ ] Update `POSTGRES_PASSWORD` to a secure value
- [ ] Run database migrations: `npm run prisma:migrate`
- [ ] Test CORS between frontend and backend
- [ ] Verify Appwrite authentication works
- [ ] Check file upload functionality
- [ ] Test all API endpoints
- [ ] Enable SSL certificates
- [ ] Set up monitoring and logs

## Security Notes

1. **Database**: Use strong password and SSL connection
2. **CORS**: Only allow your frontend domain
3. **Environment**: Never commit `.env` files
4. **Images**: Appwrite domain is whitelisted in Next.js config
5. **File Upload**: Size limit set to 25MB
6. **Error Messages**: Sanitized in production mode

## Post-Deployment Verification

1. **Frontend**: Visit `https://lifelong.dronalogitech.cloud`
2. **Backend**: Check `https://lifelongbackend.dronalogitech.cloud/health`
3. **Database**: Connect and verify tables exist
4. **Authentication**: Test login with Appwrite
5. **API**: Test file upload and data retrieval
