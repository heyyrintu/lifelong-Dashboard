import { Controller, Get, Head } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
@SkipThrottle() // Don't rate limit health checks
export class HealthController {
  @Public()
  @Get()
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Public()
  @Head()
  healthCheckHead() {
    // HEAD request for health checks (used by Docker/Coolify)
    return;
  }
}
