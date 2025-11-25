import { Module } from '@nestjs/common';
import { OutboundModule } from './outbound/outbound.module';

@Module({
  imports: [OutboundModule],
})
export class AppModule {}
