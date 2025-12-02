import { Throttle, SkipThrottle } from '@nestjs/throttler';

/**
 * Apply strict rate limiting for upload endpoints
 * Limits to 5 uploads per minute to prevent abuse
 */
export const UploadThrottle = () => Throttle({ default: { limit: 5, ttl: 60000 } });

/**
 * Apply stricter rate limiting for sensitive operations
 * Limits to 10 requests per minute
 */
export const SensitiveThrottle = () => Throttle({ default: { limit: 10, ttl: 60000 } });

/**
 * Skip rate limiting for specific endpoints (e.g., health checks)
 */
export const NoThrottle = () => SkipThrottle();
