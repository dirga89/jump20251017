// Database setup script
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🗄️  Setting up database...\n');

try {
  // Check if .env.local exists
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.log('❌ .env.local file not found');
    console.log('📝 Please create .env.local file first');
    process.exit(1);
  }

  // Load environment variables
  require('dotenv').config({ path: envPath });

  if (!process.env.DATABASE_URL) {
    console.log('❌ DATABASE_URL not found in .env.local');
    process.exit(1);
  }

  console.log('✅ Environment variables loaded');

  // Generate Prisma client
  console.log('🔧 Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma client generated');

  // Run migrations
  console.log('🚀 Running database migrations...');
  execSync('npx prisma migrate dev --name init', { stdio: 'inherit' });
  console.log('✅ Database migrations completed');

  console.log('\n🎉 Database setup complete!');
  console.log('📊 You can now run: npx prisma studio to view your database');

} catch (error) {
  console.error('❌ Database setup failed:', error.message);
  process.exit(1);
}
