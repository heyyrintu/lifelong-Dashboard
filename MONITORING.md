# API Health Check Endpoints

## Frontend Health Check

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-08T10:00:00.000Z",
  "uptime": 12345,
  "environment": "production"
}
```

## Backend Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-08T10:00:00.000Z",
  "database": "connected",
  "uptime": 12345
}
```

## Database Health Check

**Endpoint:** `GET /health/database`

**Response:**
```json
{
  "status": "ok",
  "connected": true,
  "responseTime": 45
}
```

## Monitoring Setup

### 1. Using Uptime Robot
- Add health check URL: `https://yourdomain.com/health`
- Set check interval: 5 minutes
- Configure alerts for downtime

### 2. Using PM2
```bash
pm2 install pm2-server-monit
```

### 3. Custom Monitoring Script
```bash
#!/bin/bash
# monitor.sh

FRONTEND_URL="http://localhost:3000/api/health"
BACKEND_URL="http://localhost:3001/health"

# Check Frontend
frontend_status=$(curl -s -o /dev/null -w "%{http_code}" $FRONTEND_URL)
if [ $frontend_status -eq 200 ]; then
    echo "Frontend: OK"
else
    echo "Frontend: ERROR (Status: $frontend_status)"
fi

# Check Backend
backend_status=$(curl -s -o /dev/null -w "%{http_code}" $BACKEND_URL)
if [ $backend_status -eq 200 ]; then
    echo "Backend: OK"
else
    echo "Backend: ERROR (Status: $backend_status)"
fi
```

## Performance Metrics

### Key Metrics to Monitor

1. **Response Time**
   - Frontend: < 200ms
   - Backend API: < 500ms
   - Database queries: < 100ms

2. **Memory Usage**
   - Frontend: < 1GB
   - Backend: < 512MB
   - Database: Monitor based on data size

3. **CPU Usage**
   - Should stay below 70% under normal load
   - Spike to 90% during builds is normal

4. **Error Rate**
   - Should be < 1% of total requests
   - Monitor 4xx and 5xx errors separately

## Logging

### Production Logging Best Practices

1. **Log Levels**
   - ERROR: Critical issues requiring immediate attention
   - WARN: Potential issues or degraded performance
   - INFO: Important application events (disabled in production)
   - DEBUG: Development only (disabled in production)

2. **Log Rotation**
```bash
# Using PM2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

3. **Centralized Logging**
   - Consider using: Datadog, LogRocket, or Papertrail
   - Store logs for at least 30 days
   - Set up alerts for error patterns

## Alerts Setup

### Critical Alerts
- Application down
- Database connection lost
- Disk space > 90%
- Memory usage > 90%
- Error rate spike

### Warning Alerts
- Response time > 1s
- CPU usage > 80%
- Memory usage > 70%
- Failed login attempts spike

## Troubleshooting Common Issues

### High Memory Usage
```bash
# Check Node.js memory
pm2 show lifelong-dashboard-frontend
pm2 show lifelong-dashboard-backend

# Restart if needed
pm2 restart all
```

### Database Connection Issues
```bash
# Check database status
pg_isready -h localhost -p 5432

# Check active connections
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

### Slow Response Times
1. Check database query performance
2. Review API endpoint logs
3. Check network latency
4. Verify CDN is working
5. Check for memory leaks
