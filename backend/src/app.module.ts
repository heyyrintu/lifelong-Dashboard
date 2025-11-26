import { Module } from '@nestjs/common';
import { OutboundModule } from './outbound/outbound.module';
import { InboundModuleMock } from './inbound/inbound.module.mock';
import { InventoryModule } from './inventory/inventory.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, OutboundModule, InboundModuleMock, InventoryModule],
})
export class AppModule {}
