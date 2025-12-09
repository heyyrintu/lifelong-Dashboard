import { Controller, Get, Head, HttpException, HttpStatus } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
@SkipThrottle() // Don't rate limit health checks
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async healthCheck() {
    const dbHealthy = await this.prisma.isHealthy();
    
    if (!dbHealthy) {
      throw new HttpException(
        {
          status: 'error',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          database: 'disconnected',
          message: 'Database connection failed',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      environment: process.env.NODE_ENV,
    };
  }

  @Public()
  @Head()
  async healthCheckHead() {
    // HEAD request for health checks (used by Docker/Coolify)
    const dbHealthy = await this.prisma.isHealthy();
    if (!dbHealthy) {
      throw new HttpException('Service Unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return;
  }
}
