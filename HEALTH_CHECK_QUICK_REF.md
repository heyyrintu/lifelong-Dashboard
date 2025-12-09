# 🏥 Health Check Quick Reference

## Access Points

### 🌐 Web Interface
- **Full Dashboard**: http://localhost:3000/health
- **Header Widget**: Click the status badge in dashboard header

### 🔌 API Endpoints
```bash
# Frontend
curl http://localhost:3000/api/health

# Backend  
curl http://localhost:3001/health
```

## Status Indicators

| Color | Status | Meaning |
|-------|--------|---------|
| 🟢 Green | Healthy | All systems operational |
| 🔴 Red | Error | Service down or database disconnected |
| 🟡 Yellow | Warning | Partial service degradation |
| ⚪ Gray | Loading | Checking status... |

## Quick Commands

```bash
# Check all container health
docker ps

# View backend health
curl http://localhost:3001/health | jq

# Watch health status (updates every 5s)
watch -n 5 curl -s http://localhost:3001/health

# Check Docker health status
docker inspect --format='{{.State.Health.Status}}' lifelong-backend
```

## Common Issues

### ❌ Backend Shows "Disconnected"
→ Check `DATABASE_URL` environment variable
→ See `DB_TROUBLESHOOTING.md`

### ❌ Health Page Won't Load
→ Ensure frontend is running on port 3000
→ Check browser console for errors

### ❌ Database Shows "Disconnected"  
→ Verify PostgreSQL is running
→ Check database credentials
→ Review backend logs: `docker logs lifelong-backend`

## Auto-Refresh
- **Health Dashboard**: Every 30 seconds
- **Header Widget**: Every 60 seconds
- **Manual Refresh**: Click "Refresh" button

## Documentation
- Full docs: `HEALTH_CHECK_SYSTEM.md`
- DB troubleshooting: `DB_TROUBLESHOOTING.md`
