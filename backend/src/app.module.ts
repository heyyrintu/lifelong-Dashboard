import { Module } from '@nestjs/common';
import { OutboundModule } from './outbound/outbound.module';
import { InboundModule } from './inbound/inbound.module';
import { InventoryModule } from './inventory/inventory.module';
import { BillingModule } from './billing/billing.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, OutboundModule, InboundModule, InventoryModule, BillingModule],
})
export class AppModule {}
