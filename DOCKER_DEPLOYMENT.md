# Docker Deployment Guide

## Quick Start

### 1. Setup Environment Variables

```bash
# Copy the Docker environment template
cp .env.docker .env

# Edit with your actual values
# Update DATABASE_URL, APPWRITE keys, Auth0 settings, etc.
```

### 2. Build and Run

**Windows (PowerShell):**
```powershell
# Build images
.\docker-build.ps1 build

# Start all services
.\docker-build.ps1 up

# Run database migrations
.\docker-build.ps1 migrate
```

**Linux/Mac:**
```bash
chmod +x docker-build.sh

# Build images
./docker-build.sh build

# Start all services
./docker-build.sh up

# Run database migrations
./docker-build.sh migrate
```

### 3. Access Services

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:3000  |
| Backend  | http://localhost:3001  |
| Postgres | localhost:5432         |

## Commands Reference

| Command           | Description                              |
|-------------------|------------------------------------------|
| `build`           | Build Docker images                      |
| `up`              | Start all services in background         |
| `down`            | Stop all services                        |
| `restart`         | Restart all services                     |
| `logs`            | View live logs                           |
| `status`          | Show service status                      |
| `clean`           | Remove containers, volumes, and images   |
| `migrate`         | Run Prisma database migrations           |
| `prisma-studio`   | Open Prisma Studio                       |

## Manual Docker Commands

```bash
# Build all images
docker-compose build

# Build with no cache
docker-compose build --no-cache

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Clean everything including volumes
docker-compose down -v --rmi all
```

## Production Deployment

### Build Individual Images

```bash
# Build frontend only
docker build -t lifelong-frontend:latest .

# Build backend only
docker build -t lifelong-backend:latest ./backend
```

### Build with Arguments

```bash
# Build frontend with API URL
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1 \
  --build-arg NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id \
  -t lifelong-frontend:latest .
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs backend
docker-compose logs frontend

# Check health
docker-compose ps
```

### Database connection issues

```bash
# Ensure postgres is healthy
docker-compose exec postgres pg_isready -U postgres

# Check database exists
docker-compose exec postgres psql -U postgres -l
```

### Reset everything

```bash
# Stop and remove everything
docker-compose down -v --rmi local

# Rebuild from scratch
docker-compose build --no-cache
docker-compose up -d
```

## Environment Variables

### Required for Backend

| Variable                         | Description                          |
|----------------------------------|--------------------------------------|
| `DATABASE_URL`                   | PostgreSQL connection string         |
| `APPWRITE_API_KEY`               | Appwrite server API key              |
| `NEXT_PUBLIC_APPWRITE_PROJECT_ID`| Appwrite project ID                  |

### Required for Frontend

| Variable                          | Description                         |
|-----------------------------------|-------------------------------------|
| `NEXT_PUBLIC_API_BASE_URL`        | Backend API URL                     |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT`   | Appwrite endpoint                   |
| `NEXT_PUBLIC_APPWRITE_PROJECT_ID` | Appwrite project ID                 |
| `AUTH0_DOMAIN`                    | Auth0 domain                        |
| `AUTH0_CLIENT_ID`                 | Auth0 client ID                     |
| `AUTH0_CLIENT_SECRET`             | Auth0 client secret                 |
| `AUTH0_SECRET`                    | Auth0 session secret (32+ chars)    |
