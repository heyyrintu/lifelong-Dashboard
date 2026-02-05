const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createItemMasterTable() {
  try {
    console.log('Creating item_master table...');
    
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "item_master" (
        "id" TEXT NOT NULL,
        "item_group" TEXT NOT NULL,
        "cbm_per_unit" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "item_master_pkey" PRIMARY KEY ("id")
      );
    `);
    
    console.log('✓ item_master table created successfully!');
    
    // Verify
    const result = await prisma.$queryRaw`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'item_master' 
      ORDER BY ordinal_position;
    `;
    
    console.log('Table structure:');
    console.table(result);
    
  } catch (error) {
    console.error('✗ Error creating table:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createItemMasterTable();
