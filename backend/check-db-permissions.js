const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkPermissions() {
  try {
    // Check current user
    const currentUser = await prisma.$queryRaw`SELECT current_user, current_database();`;
    console.log('Current User & Database:');
    console.table(currentUser);
    
    // Check schema privileges
    const schemaPrivs = await prisma.$queryRaw`
      SELECT 
        nspname as schema_name,
        has_schema_privilege(current_user, nspname, 'CREATE') as can_create,
        has_schema_privilege(current_user, nspname, 'USAGE') as can_use
      FROM pg_namespace
      WHERE nspname = 'public';
    `;
    console.log('\nSchema Privileges:');
    console.table(schemaPrivs);
    
    // Check existing tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log('\nExisting Tables:');
    console.table(tables);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkPermissions();
