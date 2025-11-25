import { Module } from '@nestjs/common';
import { OutboundModule } from './outbound/outbound.module';
import { InboundModuleMock } from './inbound/inbound.module.mock';

@Module({
  imports: [OutboundModule, InboundModuleMock],
})
export class AppModule {}
