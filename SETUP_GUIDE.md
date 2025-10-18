# Local Development Setup Guide

## Step 1: Create Environment File

Create a `.env.local` file in your project root with the following content:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/financial_advisor_ai"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret-key-here-replace-with-random-string"

# Google OAuth - You need to create these in Google Cloud Console
GOOGLE_CLIENT_ID="your-google-client-id-from-google-cloud-console"
GOOGLE_CLIENT_SECRET="your-google-client-secret-from-google-cloud-console"

# HubSpot - You need to create these in HubSpot Developer Portal
HUBSPOT_CLIENT_ID="your-hubspot-client-id-from-hubspot-developer-portal"
HUBSPOT_CLIENT_SECRET="your-hubspot-client-secret-from-hubspot-developer-portal"
HUBSPOT_REDIRECT_URI="http://localhost:3000/api/auth/callback/hubspot"

# OpenAI - Get this from OpenAI platform
OPENAI_API_KEY="your-openai-api-key-from-openai-platform"

# Application
NODE_ENV="development"
```

## Step 2: Generate NextAuth Secret

Run this command to generate a secure secret:

```bash
openssl rand -base64 32
```

Or use this online generator: https://generate-secret.vercel.app/32

Replace `your-nextauth-secret-key-here-replace-with-random-string` with the generated value.

## Step 3: Set Up PostgreSQL Database

### Option A: Local PostgreSQL
1. Install PostgreSQL locally
2. Create a database:
   ```sql
   CREATE DATABASE financial_advisor_ai;
   CREATE EXTENSION vector;
   ```
3. Update DATABASE_URL with your local credentials

### Option B: Use Supabase (Recommended for testing)
1. Go to https://supabase.com
2. Create a new project
3. Go to Settings > Database
4. Copy the connection string
5. Replace DATABASE_URL with your Supabase connection string

### Option C: Use Neon (Free PostgreSQL with pgvector)
1. Go to https://neon.tech
2. Create a new project
3. Copy the connection string
4. Replace DATABASE_URL with your Neon connection string

## Step 4: Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable APIs:
   - Gmail API
   - Google Calendar API
   - Google+ API (for OAuth)
4. Go to "Credentials" > "Create Credentials" > "OAuth 2.0 Client IDs"
5. Configure OAuth consent screen:
   - Add your email as test user
   - Add `webshookeng@gmail.com` as test user
   - Scopes needed:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/calendar.events`
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
7. Copy Client ID and Client Secret to your .env.local

## Step 5: HubSpot Setup

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Create a new app
3. Go to "Auth" tab
4. Add redirect URI: `http://localhost:3000/api/auth/callback/hubspot`
5. Select scopes:
   - `contacts`
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.contacts.delete`
6. Copy Client ID and Client Secret to your .env.local

## Step 6: OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account or sign in
3. Go to API Keys section
4. Create a new API key
5. Copy the key to your .env.local

## Step 7: Database Migration

Run these commands to set up your database:

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# (Optional) View your database in Prisma Studio
npx prisma studio
```

## Step 8: Test the Application

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3000 in your browser

3. You should see the login page - click "Sign in with Google"

4. After authentication, you'll be redirected to the chat interface

5. Try asking: "Hello, can you help me?"

## Step 9: Test Integrations

### Test Gmail Integration:
1. Go to dashboard
2. Click "Sync Emails"
3. Check if emails are imported

### Test HubSpot Integration:
1. Go to dashboard
2. Click "Connect HubSpot"
3. Authorize the connection
4. Click "Sync Contacts"
5. Check if contacts are imported

### Test Calendar Integration:
1. Go to dashboard
2. Click "Sync Calendar"
3. Check if events are imported

## Troubleshooting

### Common Issues:

1. **Database connection error**: Check your DATABASE_URL format
2. **OAuth redirect error**: Ensure redirect URIs match exactly
3. **Permission denied**: Check if you've enabled the required APIs
4. **Vector extension error**: Make sure pgvector is installed in your database

### Check Logs:
- Browser console for frontend errors
- Terminal where you ran `npm run dev` for backend errors
- Database logs for connection issues

## Next Steps After Local Testing

Once everything works locally:
1. Commit your code to GitHub
2. Set up production database
3. Deploy to Render or Fly.io
4. Configure production environment variables
5. Test the deployed application

## Quick Test Commands

```bash
# Check if all dependencies are installed
npm list

# Check database connection
npx prisma db pull

# Generate and apply migrations
npx prisma migrate dev

# Start development server
npm run dev
```

## Environment Variables Reference

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | Your database provider |
| `NEXTAUTH_SECRET` | Random string for session encryption | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your app URL | `http://localhost:3000` for local |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Google Cloud Console |
| `HUBSPOT_CLIENT_ID` | HubSpot app client ID | HubSpot Developer Portal |
| `HUBSPOT_CLIENT_SECRET` | HubSpot app client secret | HubSpot Developer Portal |
| `HUBSPOT_REDIRECT_URI` | HubSpot OAuth redirect | `http://localhost:3000/api/auth/callback/hubspot` |
| `OPENAI_API_KEY` | OpenAI API key | OpenAI Platform |
