// Simple test script to verify environment setup
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking setup...\n');

// Check if .env.local exists
const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.log('❌ .env.local file not found');
  console.log('📝 Please create .env.local file with the contents from SETUP_GUIDE.md\n');
  process.exit(1);
}

console.log('✅ .env.local file exists');

// Load environment variables
require('dotenv').config({ path: envPath });

// Check required environment variables
const requiredVars = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'HUBSPOT_CLIENT_ID',
  'HUBSPOT_CLIENT_SECRET',
  'OPENAI_API_KEY'
];

let allSet = true;

console.log('\n📋 Environment Variables Check:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value && !value.includes('your-') && !value.includes('replace-with')) {
    console.log(`✅ ${varName}: Set`);
  } else {
    console.log(`❌ ${varName}: Not set or using placeholder`);
    allSet = false;
  }
});

if (!allSet) {
  console.log('\n⚠️  Some environment variables are not set properly.');
  console.log('📖 Please follow the SETUP_GUIDE.md to configure them.\n');
  process.exit(1);
}

console.log('\n🎉 All environment variables are configured!');
console.log('\n🚀 Next steps:');
console.log('1. Set up your database (PostgreSQL with pgvector)');
console.log('2. Run: npx prisma generate');
console.log('3. Run: npx prisma migrate dev');
console.log('4. Run: npm run dev');
console.log('5. Open http://localhost:3000');
