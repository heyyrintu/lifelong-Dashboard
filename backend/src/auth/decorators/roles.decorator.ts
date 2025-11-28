import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../strategies/jwt.strategy';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route
 * Use in combination with RolesGuard
 * 
 * @example
 * @Roles(UserRole.ADMIN, UserRole.OPS)
 * @Post('upload')
 * uploadFile() { ... }
 * 
 * @example
 * @Roles(UserRole.ADMIN)
 * @Delete(':id')
 * deleteRecord() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
