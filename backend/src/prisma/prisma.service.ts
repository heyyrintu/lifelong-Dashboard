import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      this.logger.log('Attempting to connect to database...');
      this.logger.log(`DATABASE_URL configured: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);
      
      if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL environment variable is not set');
      }

      await this.$connect();
      this.logger.log('✅ Successfully connected to database');
      
      // Test the connection
      await this.$queryRaw`SELECT 1`;
      this.logger.log('✅ Database query test successful');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error);
      this.logger.error('Database connection details:');
      this.logger.error(`- DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
      if (process.env.DATABASE_URL) {
        // Log sanitized connection string (hide password)
        const sanitized = process.env.DATABASE_URL.replace(/:([^@]+)@/, ':****@');
        this.logger.error(`- Connection string (sanitized): ${sanitized}`);
      }
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Disconnected from database');
    } catch (error) {
      this.logger.error('Error disconnecting from database:', error);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }
}
