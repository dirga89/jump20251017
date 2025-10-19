# Deployment Guide for Render

## 📋 Prerequisites

Before deploying, make sure you have:
- ✅ GitHub account with your code pushed to a repository
- ✅ Render account (sign up at https://render.com)
- ✅ Supabase PostgreSQL database (or any PostgreSQL database)
- ✅ All API keys ready:
  - Google OAuth credentials
  - HubSpot OAuth credentials
  - OpenAI API key

## 🚀 Step-by-Step Deployment

### 1. **Prepare Your Database (Supabase)**

1. Go to your Supabase project
2. Go to **SQL Editor**
3. Run the migration file: `prisma/migrations/notification-migration.sql`
4. Copy your **Connection String** from Settings → Database
   - Format: `postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres`

### 2. **Push Code to GitHub**

```bash
git init
git add .
git commit -m "Initial commit - AI Assistant for Financial Advisors"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 3. **Create New Web Service on Render**

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure the service:

**Basic Settings:**
- **Name:** `jump-ai-assistant` (or your preferred name)
- **Region:** Singapore (or closest to you)
- **Branch:** `main`
- **Root Directory:** Leave empty
- **Runtime:** Node
- **Build Command:** 
  ```bash
  npm install && npx prisma generate && npm run build
  ```
- **Start Command:**
  ```bash
  npm start
  ```

### 4. **Configure Environment Variables**

In Render dashboard, go to **Environment** and add these variables:

#### **Required Variables:**

```env
# Node Version
NODE_VERSION=20.11.0

# Database
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# NextAuth
NEXTAUTH_URL=https://YOUR-APP-NAME.onrender.com
NEXTAUTH_SECRET=YOUR_GENERATED_SECRET_HERE

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# HubSpot OAuth
HUBSPOT_CLIENT_ID=your-hubspot-client-id
HUBSPOT_CLIENT_SECRET=your-hubspot-client-secret
NEXT_PUBLIC_HUBSPOT_CLIENT_ID=your-hubspot-client-id
NEXT_PUBLIC_HUBSPOT_REDIRECT_URI=https://YOUR-APP-NAME.onrender.com/api/auth/callback/hubspot

# OpenAI
OPENAI_API_KEY=sk-proj-your-openai-api-key

# Background Services
ENABLE_BACKGROUND_POLLING=true
```

#### **Generate NEXTAUTH_SECRET:**

Run this command locally:
```bash
openssl rand -base64 32
```

Or use this Node.js command:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5. **Update OAuth Redirect URIs**

#### **Google Cloud Console:**
1. Go to https://console.cloud.google.com
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Edit your OAuth 2.0 Client ID
5. Add to **Authorized redirect URIs:**
   ```
   https://YOUR-APP-NAME.onrender.com/api/auth/callback/google
   ```
6. Add to **Authorized JavaScript origins:**
   ```
   https://YOUR-APP-NAME.onrender.com
   ```

#### **HubSpot App Settings:**
1. Go to https://developers.hubspot.com
2. Select your app
3. Go to **Auth** tab
4. Update **Redirect URL:**
   ```
   https://YOUR-APP-NAME.onrender.com/api/auth/callback/hubspot
   ```

### 6. **Deploy!**

1. Click **"Create Web Service"** in Render
2. Wait for the build to complete (5-10 minutes)
3. Once deployed, you'll get a URL like: `https://your-app-name.onrender.com`

### 7. **Run Database Migrations (First Time Only)**

After first deployment:

1. Go to Render Dashboard → Your Service → **Shell**
2. Run:
   ```bash
   npx prisma db push
   ```

Or run the migration SQL directly in Supabase SQL Editor.

### 8. **Test Your Deployment**

1. Visit: `https://YOUR-APP-NAME.onrender.com`
2. Click **"Sign in with Google"**
3. Test the features:
   - ✅ Gmail integration
   - ✅ Calendar sync
   - ✅ HubSpot connection
   - ✅ Voice input
   - ✅ Chat functionality

## 🔧 Troubleshooting

### **Build Fails**

**Problem:** Build command fails
**Solution:** Check build logs, ensure all dependencies are in `package.json`

### **Database Connection Error**

**Problem:** Can't connect to database
**Solution:** 
- Verify `DATABASE_URL` is correct
- Check if Supabase allows connections from Render IPs
- Run `npx prisma generate` in build command

### **OAuth Errors**

**Problem:** "Redirect URI mismatch"
**Solution:**
- Update Google/HubSpot redirect URIs with your Render URL
- Ensure `NEXTAUTH_URL` matches your Render URL exactly

### **App Crashes After Deploy**

**Problem:** App starts then crashes
**Solution:**
- Check logs in Render dashboard
- Verify all environment variables are set
- Ensure `NEXTAUTH_SECRET` is set

### **Background Polling Not Working**

**Problem:** Proactive agent doesn't run
**Solution:**
- Set `ENABLE_BACKGROUND_POLLING=true`
- Check logs for polling messages
- Verify database has ongoing instructions

## 📊 Monitoring

### **View Logs:**
1. Go to Render Dashboard
2. Select your service
3. Click **"Logs"** tab
4. Watch for:
   ```
   🌟 Initializing background services...
   🚀 Background poller started - checking every 5 minutes
   🔍 Polling for X users with ongoing instructions
   ```

### **Performance:**
- Monitor response times in Render dashboard
- Check database query performance in Supabase
- Watch for connection pool timeouts

## 🔄 Updating Your App

After making changes:

```bash
git add .
git commit -m "Your update message"
git push origin main
```

Render will automatically rebuild and redeploy!

## 💡 Tips

1. **Free Tier Limitations:**
   - Render free tier spins down after 15 minutes of inactivity
   - First request after spin-down takes ~30 seconds
   - Consider upgrading to Starter plan ($7/month) for always-on

2. **Database Connection Pooling:**
   - Supabase has connection limits
   - Consider using connection pooling URL if you hit limits

3. **Environment Variables:**
   - Never commit `.env` files to Git
   - Use Render's environment variable management
   - Mark sensitive variables as "secret"

4. **Custom Domain (Optional):**
   - Go to Settings → Custom Domains
   - Add your domain
   - Update DNS records
   - Update OAuth redirect URIs

## 🎉 You're Done!

Your AI Assistant is now live at:
```
https://YOUR-APP-NAME.onrender.com
```

Share it with your team and start using it! 🚀

## 📞 Support

If you encounter issues:
1. Check Render logs
2. Check Supabase logs
3. Verify all environment variables
4. Test OAuth flows
5. Check API rate limits

## 🔒 Security Checklist

Before going live:
- ✅ All environment variables set
- ✅ `NEXTAUTH_SECRET` is unique and strong
- ✅ OAuth redirect URIs match exactly
- ✅ Database credentials are secure
- ✅ API keys are valid and not expired
- ✅ Test user authentication
- ✅ Test all integrations

