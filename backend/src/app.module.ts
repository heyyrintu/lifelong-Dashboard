import { Module } from '@nestjs/common';
import { OutboundModule } from './outbound/outbound.module';
import { InboundModule } from './inbound/inbound.module';
import { InventoryModule } from './inventory/inventory.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, OutboundModule, InboundModule, InventoryModule],
})
export class AppModule {}
