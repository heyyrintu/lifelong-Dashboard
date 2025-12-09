# Health Check System Documentation

## Overview

The Lifelong Dashboard includes comprehensive health monitoring for both frontend and backend services, along with database connectivity checks.

---

## Health Check Endpoints

### Frontend Health Check
- **URL**: `http://localhost:3000/api/health`
- **Methods**: `GET`, `HEAD`
- **Purpose**: Verify frontend application is running

**Response Example:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-10T12:00:00.000Z",
  "service": "frontend",
  "environment": "production",
  "version": "1.0.0"
}
```

### Backend Health Check
- **URL**: `http://localhost:3001/health`
- **Methods**: `GET`, `HEAD`
- **Purpose**: Verify backend API and database connectivity

**Healthy Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2025-12-10T12:00:00.000Z",
  "uptime": 3600.123,
  "database": "connected",
  "environment": "production"
}
```

**Unhealthy Response (503 Service Unavailable):**
```json
{
  "status": "error",
  "timestamp": "2025-12-10T12:00:00.000Z",
  "uptime": 3600.123,
  "database": "disconnected",
  "message": "Database connection failed"
}
```

---

## Health Check UI

### Full Health Dashboard
Visit `http://localhost:3000/health` for a comprehensive health monitoring dashboard.

**Features:**
- ✅ Real-time status of all services
- ✅ Frontend, Backend, and Database status
- ✅ Service uptime tracking
- ✅ Auto-refresh every 30 seconds
- ✅ Manual refresh button
- ✅ Detailed error messages
- ✅ Troubleshooting guidance
- ✅ Configuration information

### Health Indicator Widget
A compact health indicator is displayed in the dashboard header.

**Features:**
- ✅ At-a-glance system status
- ✅ Expandable dropdown with details
- ✅ Auto-checks every 60 seconds
- ✅ Click to view full health dashboard
- ✅ Color-coded status:
  - 🟢 Green: All systems operational
  - 🔴 Red: Critical issues
  - 🟡 Yellow: Warnings

---

## Docker Health Checks

### Frontend Container
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
```

### Backend Container
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1
```

### Database Container
```dockerfile
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres"]
  interval: 10s
  timeout: 5s
  retries: 5
```

---

## Testing Health Checks

### Test Frontend Health
```bash
# GET request
curl http://localhost:3000/api/health

# HEAD request
curl -I http://localhost:3000/api/health
```

### Test Backend Health
```bash
# GET request
curl http://localhost:3001/health

# HEAD request
curl -I http://localhost:3001/health

# With JSON formatting
curl http://localhost:3001/health | jq
```

### Check Docker Container Health
```bash
# View all container health status
docker ps

# Check specific container
docker inspect --format='{{.State.Health.Status}}' lifelong-postgres
docker inspect --format='{{.State.Health.Status}}' lifelong-backend
docker inspect --format='{{.State.Health.Status}}' lifelong-frontend

# View detailed health check logs
docker inspect lifelong-backend | jq '.[0].State.Health'
```

---

## Monitoring Setup

### Continuous Monitoring Script
```bash
# Watch health status (Linux/Mac)
watch -n 5 'curl -s http://localhost:3001/health | jq'

# PowerShell (Windows)
while($true) {
  curl http://localhost:3001/health | ConvertFrom-Json | ConvertTo-Json
  Start-Sleep -Seconds 5
  Clear-Host
}
```

### Log Health Checks
```bash
# Log to file
while true; do
  echo "$(date): $(curl -s http://localhost:3001/health)" >> health.log
  sleep 60
done
```

---

## Integration with Monitoring Tools

### Prometheus
```yaml
scrape_configs:
  - job_name: 'lifelong-frontend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/health'
    
  - job_name: 'lifelong-backend'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/health'
```

### Uptime Kuma
1. Add new HTTP(s) monitor
2. URL: `https://your-domain.com/health`
3. Interval: 60 seconds
4. Expected Status Code: 200

### Coolify
Health checks are automatically configured when using the Dockerfiles.

---

## Troubleshooting

### Frontend Health Check Fails

**Check if frontend is running:**
```bash
docker logs lifelong-frontend
curl http://localhost:3000
```

**Common causes:**
- Port 3000 not exposed
- Container not started
- Build failure

### Backend Health Check Fails

**Check backend logs:**
```bash
docker logs lifelong-backend
```

**Common causes:**
- Database connection failed (see detailed logs)
- Port 3001 not exposed
- Environment variables missing
- Prisma client not generated

**See detailed troubleshooting:**
- Refer to `DB_TROUBLESHOOTING.md` for database issues
- Check backend logs for specific error messages

### Database Health Check Fails

**Check database status:**
```bash
docker logs lifelong-postgres
docker exec lifelong-postgres pg_isready -U postgres
```

**Common causes:**
- PostgreSQL not started
- Incorrect credentials
- Port 5432 not available

---

## Health Check Response Codes

| Code | Meaning | Action Required |
|------|---------|-----------------|
| 200 | Healthy | None - system operational |
| 503 | Service Unavailable | Check logs, database connection |
| 500 | Internal Error | Check application logs |
| Timeout | No Response | Service down or network issue |

---

## Auto-Refresh Configuration

### Frontend Dashboard
- **Full Health Page**: Auto-refreshes every 30 seconds
- **Header Widget**: Auto-refreshes every 60 seconds

To modify intervals, update the values in:
- `app/health/page.tsx` - Line 67
- `components/common/HealthIndicator.tsx` - Line 36

---

## Production Deployment

### Environment Variables Required

**Frontend:**
```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend-url.com
NODE_ENV=production
```

**Backend:**
```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
NODE_ENV=production
PORT=3001
CORS_ORIGINS=https://your-frontend-url.com
```

### Health Check URLs in Production

Update monitoring tools to use production URLs:
- Frontend: `https://your-frontend-url.com/api/health`
- Backend: `https://your-backend-url.com/health`

---

## Custom Health Checks

### Adding Custom Service Checks

To add more health checks, extend the backend health controller:

```typescript
// backend/src/health/health.controller.ts
@Get()
async healthCheck() {
  const dbHealthy = await this.prisma.isHealthy();
  const redisHealthy = await this.checkRedis(); // Your custom check
  
  return {
    status: dbHealthy && redisHealthy ? 'ok' : 'error',
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
    }
  };
}
```

---

## API Documentation

### Frontend Health API

```typescript
GET /api/health
Response: {
  status: string;        // "ok"
  timestamp: string;     // ISO 8601 timestamp
  service: string;       // "frontend"
  environment: string;   // "production" | "development"
  version: string;       // "1.0.0"
}
```

### Backend Health API

```typescript
GET /health
Response: {
  status: string;        // "ok" | "error"
  timestamp: string;     // ISO 8601 timestamp
  uptime: number;        // Process uptime in seconds
  database: string;      // "connected" | "disconnected"
  environment: string;   // "production" | "development"
  message?: string;      // Error message if status is "error"
}
```

---

## Maintenance Mode

To enable maintenance mode (returns 503):

**Backend:**
```typescript
// Add to health.controller.ts
const maintenanceMode = process.env.MAINTENANCE_MODE === 'true';
if (maintenanceMode) {
  throw new HttpException('Service under maintenance', 503);
}
```

**Frontend:**
Create a custom error page for 503 responses.

---

## Best Practices

1. ✅ **Monitor health checks in production** - Set up alerts
2. ✅ **Log health check failures** - Track patterns
3. ✅ **Test health checks regularly** - Include in CI/CD
4. ✅ **Set appropriate timeouts** - Avoid false positives
5. ✅ **Use HEAD requests for frequent checks** - Reduce load
6. ✅ **Include database in backend health** - Catch connection issues early
7. ✅ **Display health status to users** - Transparency builds trust

---

## Support

For issues with health checks:
1. Check container logs: `docker logs <container-name>`
2. Verify environment variables
3. Test endpoints manually with curl
4. See `DB_TROUBLESHOOTING.md` for database issues
5. Check firewall and network settings

---

## Summary

The health check system provides:
- ✅ Real-time monitoring of all services
- ✅ Automatic failure detection
- ✅ User-friendly health dashboard
- ✅ Docker container health checks
- ✅ Integration with monitoring tools
- ✅ Detailed diagnostics and logging
