# Ask Anything - Financial Advisor AI

An AI agent for financial advisors that integrates with Gmail, Google Calendar, and HubSpot CRM to provide intelligent assistance and automation.

## Features

- **ChatGPT-like Interface**: Natural language chat interface for asking questions and requesting actions
- **Gmail Integration**: Sync and search through emails with vector-based RAG
- **Google Calendar Integration**: Manage calendar events and find available time slots
- **HubSpot CRM Integration**: Sync contacts and notes, create new contacts
- **RAG System**: Semantic search through emails, contacts, and notes using OpenAI embeddings
- **Tool Calling**: AI agent can perform actions like sending emails, creating contacts, scheduling meetings
- **Task Management**: Persistent task system with memory for complex workflows
- **Ongoing Instructions**: Set up automated rules that trigger based on events
- **Webhook Support**: Proactive agent behavior triggered by external events

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ 
- PostgreSQL database with pgvector extension
- Google Cloud Console project
- HubSpot developer account
- OpenAI API key

### 2. Environment Setup

1. Copy `env.template` to `.env.local`
2. Fill in the required environment variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/financial_advisor_ai"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# HubSpot
HUBSPOT_CLIENT_ID="your-hubspot-client-id"
HUBSPOT_CLIENT_SECRET="your-hubspot-client-secret"
HUBSPOT_REDIRECT_URI="http://localhost:3000/api/auth/callback/hubspot"

# OpenAI
OPENAI_API_KEY="your-openai-api-key"

# Application
NODE_ENV="development"
```

### 3. Database Setup

1. Create a PostgreSQL database
2. Enable the pgvector extension:
   ```sql
   CREATE EXTENSION vector;
   ```
3. Run database migrations:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Gmail API and Google Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)
6. Add `webshookeng@gmail.com` as a test user
7. Configure OAuth consent screen with required scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`

### 5. HubSpot Setup

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Create a new app
3. Configure OAuth settings:
   - Redirect URI: `http://localhost:3000/api/auth/callback/hubspot`
   - Scopes: `contacts`, `crm.objects.contacts.read`, `crm.objects.contacts.write`
4. Get your Client ID and Client Secret

### 6. Installation and Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

### 1. Sign In
- Click "Sign in with Google" to authenticate with your Google account
- Grant permissions for Gmail and Calendar access

### 2. Connect HubSpot
- Go to the dashboard
- Click "Connect HubSpot" to link your CRM account

### 3. Sync Data
- Use the sync buttons on the dashboard to import your emails, contacts, and calendar events
- The system will automatically generate embeddings for semantic search

### 4. Start Chatting
- Go to the main chat interface
- Ask questions like:
  - "Who mentioned their kid plays baseball?"
  - "Why did Greg say he wanted to sell AAPL stock?"
  - "Find all emails from John about the quarterly review"

### 5. Request Actions
- Ask the AI to perform tasks:
  - "Schedule an appointment with Sara Smith"
  - "Create a contact for the new lead from LinkedIn"
  - "Send follow-up email to all Q4 prospects"

### 6. Set Up Ongoing Instructions
- Configure automated rules that trigger based on events:
  - "When someone emails me that is not in HubSpot, create a contact"
  - "When I create a contact in HubSpot, send them a welcome email"
  - "When I add an event in my calendar, send an email to attendees"

## API Endpoints

### Chat
- `POST /api/chat` - Send message to AI agent

### Authentication
- `GET /api/auth/signin` - Sign in with Google
- `GET /api/auth/callback/google` - Google OAuth callback
- `GET /api/auth/callback/hubspot` - HubSpot OAuth callback

### Data Sync
- `POST /api/sync/emails` - Sync Gmail emails
- `POST /api/sync/contacts` - Sync HubSpot contacts
- `POST /api/sync/calendar` - Sync Google Calendar events

### User Data
- `GET /api/user/data` - Get user dashboard data

### Instructions
- `GET /api/instructions` - Get ongoing instructions
- `POST /api/instructions` - Create new instruction
- `PUT /api/instructions` - Update instruction
- `DELETE /api/instructions` - Delete instruction

### Webhooks
- `POST /api/webhooks/gmail` - Gmail webhook handler
- `POST /api/webhooks/hubspot` - HubSpot webhook handler
- `POST /api/webhooks/calendar` - Calendar webhook handler

### Task Processing
- `POST /api/process-tasks` - Process pending tasks

## Deployment

### Render.com

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Configure environment variables
4. Set build command: `npm run build`
5. Set start command: `npm start`
6. Deploy

### Fly.io

1. Install flyctl
2. Run `fly launch`
3. Configure environment variables
4. Deploy with `fly deploy`

## Architecture

- **Frontend**: Next.js 15 with TypeScript and Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: PostgreSQL with pgvector for vector search
- **Authentication**: NextAuth.js with Google OAuth
- **AI**: OpenAI GPT-4 with function calling
- **Integrations**: Gmail API, Google Calendar API, HubSpot API
- **Vector Search**: OpenAI embeddings with pgvector

## Security

- All API keys and secrets are stored in environment variables
- User data is encrypted in transit and at rest
- OAuth tokens are securely stored and refreshed
- Webhook endpoints validate incoming requests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.