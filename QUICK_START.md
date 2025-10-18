# 🚀 Quick Start Guide

## Prerequisites
- Node.js 18+ installed
- A PostgreSQL database (local, Supabase, or Neon)

## Step 1: Create Environment File

Create `.env.local` in your project root:

```env
# Database (replace with your actual database URL)
DATABASE_URL="postgresql://username:password@localhost:5432/financial_advisor_ai"

# NextAuth (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET="your-generated-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# HubSpot (get from HubSpot Developer Portal)
HUBSPOT_CLIENT_ID="your-hubspot-client-id"
HUBSPOT_CLIENT_SECRET="your-hubspot-client-secret"
HUBSPOT_REDIRECT_URI="http://localhost:3000/api/auth/callback/hubspot"

# OpenAI (get from OpenAI Platform)
OPENAI_API_KEY="your-openai-api-key"

NODE_ENV="development"
```

## Step 2: Quick Setup Commands

```bash
# Check if environment is set up correctly
npm run setup:check

# Set up database (if environment is ready)
npm run setup:db

# Start development server
npm run dev
```

## Step 3: Test the Application

1. Open http://localhost:3000
2. Click "Sign in with Google"
3. You should see the chat interface

## 🎯 Minimal Testing (Without Full Integrations)

If you want to test the basic functionality without setting up all integrations:

1. **Set only these required variables:**
   ```env
   DATABASE_URL="your-database-url"
   NEXTAUTH_SECRET="your-secret"
   NEXTAUTH_URL="http://localhost:3000"
   OPENAI_API_KEY="your-openai-key"
   ```

2. **Run the setup:**
   ```bash
   npm run setup:db
   npm run dev
   ```

3. **Test basic chat functionality** (without Gmail/Calendar/HubSpot)

## 🔧 Database Options

### Option 1: Supabase (Recommended - Free)
1. Go to https://supabase.com
2. Create new project
3. Go to Settings > Database
4. Copy connection string
5. Add `?pgbouncer=true&connection_limit=1` to the end

### Option 2: Neon (Free PostgreSQL with pgvector)
1. Go to https://neon.tech
2. Create new project
3. Copy connection string
4. pgvector is automatically enabled

### Option 3: Local PostgreSQL
```bash
# Install PostgreSQL
# Create database
createdb financial_advisor_ai

# Connect and enable pgvector
psql financial_advisor_ai
CREATE EXTENSION vector;
```

## 🚨 Common Issues & Solutions

### "Module not found" errors
```bash
npm install
```

### Database connection errors
- Check your DATABASE_URL format
- Ensure pgvector extension is installed
- Verify database credentials

### OAuth errors
- Make sure redirect URIs match exactly
- Check if APIs are enabled in Google Cloud Console
- Verify client ID and secret

### OpenAI API errors
- Check if API key is valid
- Ensure you have credits in your OpenAI account

## 📱 Testing Checklist

- [ ] Environment variables set
- [ ] Database connected
- [ ] Development server running
- [ ] Can access http://localhost:3000
- [ ] Google OAuth working
- [ ] Chat interface loads
- [ ] Can send messages to AI

## 🎉 Next Steps

Once local testing works:
1. Set up Google Cloud Console project
2. Set up HubSpot developer app
3. Test full integrations
4. Deploy to production

## 📞 Need Help?

1. Check the detailed `SETUP_GUIDE.md`
2. Look at browser console for errors
3. Check terminal output for server errors
4. Verify all environment variables are set correctly
