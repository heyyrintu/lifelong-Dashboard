# Database Connection Troubleshooting Guide

## Issue: Database Not Showing After Deployment

This guide helps diagnose and fix database connectivity issues in production.

---

## 🔍 Common Causes

### 1. **Missing DATABASE_URL Environment Variable**
The most common issue is that `DATABASE_URL` is not set or incorrect in your deployment environment.

### 2. **Incorrect Connection String Format**
PostgreSQL connection strings must follow this format:
```
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME
```

### 3. **Prisma Client Not Generated**
Prisma client must be generated during the build process.

### 4. **Network/Firewall Issues**
The backend container cannot reach the database server.

### 5. **Database Server Not Running**
The PostgreSQL server is not running or crashed.

---

## ✅ Step-by-Step Diagnosis

### Step 1: Check Backend Logs

Look for these key log messages when the backend starts:

**✅ Successful Connection:**
```
[PrismaService] Attempting to connect to database...
[PrismaService] DATABASE_URL configured: Yes
[PrismaService] ✅ Successfully connected to database
[PrismaService] ✅ Database query test successful
```

**❌ Failed Connection:**
```
[PrismaService] ❌ Failed to connect to database: Error: ...
[PrismaService] Database connection details:
[PrismaService] - DATABASE_URL present: false
```

### Step 2: Test Health Endpoint

Visit your backend health endpoint:
```bash
curl https://your-backend-url/health
```

**Healthy Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-10T...",
  "uptime": 123.456,
  "database": "connected",
  "environment": "production"
}
```

**Unhealthy Response (503 Service Unavailable):**
```json
{
  "status": "error",
  "timestamp": "2025-12-10T...",
  "uptime": 123.456,
  "database": "disconnected",
  "message": "Database connection failed"
}
```

### Step 3: Verify Environment Variables

#### For Coolify Deployment:
1. Go to your application in Coolify dashboard
2. Navigate to **Environment Variables** section
3. Verify `DATABASE_URL` is set correctly

#### For Docker Compose:
Check your `docker-compose.yml` or `.env` file:
```bash
# In the backend directory
cat .env | grep DATABASE_URL
```

#### For Direct Deployment:
```bash
echo $DATABASE_URL
```

### Step 4: Validate Database Connection String

Your `DATABASE_URL` should look like:
```
postgresql://postgres:yourpassword@localhost:5432/lifelong_dashboard
```

**Components:**
- `postgres` - database username
- `yourpassword` - database password
- `localhost` or IP/hostname - database host
- `5432` - PostgreSQL port (default)
- `lifelong_dashboard` - database name

**Common Mistakes:**
- ❌ `postgresql://localhost:5432/lifelong_dashboard` (missing credentials)
- ❌ `postgres://...` (should be `postgresql://`)
- ❌ Special characters in password not URL-encoded

**URL Encoding Special Characters:**
If your password contains special characters, encode them:
- `@` → `%40`
- `#` → `%23`
- `$` → `%24`
- `%` → `%25`
- `&` → `%26`

Example:
```
# Password: MyP@ss#123
postgresql://postgres:MyP%40ss%23123@localhost:5432/lifelong_dashboard
```

### Step 5: Test Database Connectivity

#### From Backend Container:
```bash
# Enter the container
docker exec -it your-backend-container sh

# Test connection (if psql is available)
apt-get update && apt-get install -y postgresql-client
psql "$DATABASE_URL" -c "SELECT 1"
```

#### From Host Machine:
```bash
psql "postgresql://postgres:password@host:5432/lifelong_dashboard" -c "SELECT 1"
```

### Step 6: Check Database Server Status

#### For Docker Compose Setup:
```bash
docker-compose ps postgres
docker-compose logs postgres
```

#### For External PostgreSQL:
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if port is open
nc -zv localhost 5432
```

---

## 🔧 Solutions

### Solution 1: Set DATABASE_URL in Coolify

1. Login to Coolify Dashboard
2. Go to your backend application
3. Click **Environment Variables**
4. Add or update:
   ```
   DATABASE_URL=postgresql://postgres:password@host:5432/lifelong_dashboard
   ```
5. **Important:** Replace `host` with:
   - Coolify-managed database: use the service name (e.g., `postgres`)
   - External database: use the hostname or IP
6. Click **Save** and **Redeploy**

### Solution 2: Update Docker Compose

Edit `docker-compose.yml` or create `.env` in backend directory:

**backend/.env:**
```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/lifelong_dashboard
NODE_ENV=production
PORT=3001
CORS_ORIGINS=http://localhost:3000,https://your-frontend-url.com
TZ=Asia/Kolkata
```

**docker-compose.yml:**
```yaml
services:
  backend:
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/lifelong_dashboard
    depends_on:
      - postgres
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

### Solution 3: Ensure Prisma Client is Generated

Check `backend/Dockerfile` includes:
```dockerfile
# In builder stage
RUN npx prisma generate

# In production stage
RUN npx prisma generate
```

Rebuild the image:
```bash
docker-compose build --no-cache backend
docker-compose up -d
```

### Solution 4: Run Database Migrations

If the database exists but tables are missing:

```bash
# Enter backend container
docker exec -it lifelong-backend sh

# Run migrations
npx prisma migrate deploy

# Or reset database (CAUTION: Deletes all data)
npx prisma migrate reset --force
```

### Solution 5: Check Network Configuration

Ensure backend and database are on the same Docker network:

```bash
# List networks
docker network ls

# Inspect network
docker network inspect your_network_name

# Verify both containers are on the same network
```

---

## 🚀 Quick Fix Commands

### For Local Development:
```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

### For Docker Compose:
```bash
# Rebuild and restart everything
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d

# Check logs
docker-compose logs -f backend
docker-compose logs -f postgres
```

### For Coolify:
1. Check **Environment Variables** → Add `DATABASE_URL`
2. Check **Build Logs** → Look for Prisma errors
3. Check **Runtime Logs** → Look for connection errors
4. **Redeploy** after making changes

---

## 📊 Monitoring Database Health

### Continuous Monitoring:
```bash
# Check health endpoint every 5 seconds
watch -n 5 curl -s https://your-backend-url/health | jq
```

### Check Prisma Connection Pool:
Add to your monitoring:
```typescript
// In a controller or service
const metrics = await this.prisma.$metrics.json();
console.log('Database metrics:', metrics);
```

---

## 🆘 Still Having Issues?

If none of the above solutions work:

1. **Collect Information:**
   - Backend startup logs
   - Health endpoint response
   - Database server logs
   - `DATABASE_URL` format (sanitized - hide password)
   - Deployment platform (Coolify/Docker/etc.)

2. **Test Locally:**
   - Try running with `docker-compose` locally
   - Verify it works before deploying

3. **Check Firewall Rules:**
   - Ensure port 5432 is accessible
   - Check cloud provider security groups

4. **Verify PostgreSQL Version:**
   - Prisma supports PostgreSQL 9.6+
   - Check compatibility: `SELECT version();`

5. **Database Credentials:**
   - Verify username/password are correct
   - Check if database `lifelong_dashboard` exists

---

## 📝 Environment Variable Checklist

**Backend (.env):**
- [x] `DATABASE_URL` - PostgreSQL connection string
- [x] `PORT` - Backend port (default: 3001)
- [x] `NODE_ENV` - Set to `production`
- [x] `CORS_ORIGINS` - Frontend URL(s)
- [x] `TZ` - Timezone (Asia/Kolkata)

**Optional:**
- [ ] `MAX_FILE_SIZE_MB` - Upload limit
- [ ] `UPLOAD_DIR` - Upload directory

---

## 🔗 Related Documentation

- [Prisma Connection Documentation](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [PostgreSQL Connection Strings](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)
- [Docker Networking](https://docs.docker.com/network/)
- [Coolify Documentation](https://coolify.io/docs)

---

## ✅ Success Indicators

Your database is working correctly when:
- ✅ Backend logs show "Successfully connected to database"
- ✅ Health endpoint returns `"database": "connected"`
- ✅ Application can fetch/save data
- ✅ No connection errors in logs
- ✅ Migrations run successfully
