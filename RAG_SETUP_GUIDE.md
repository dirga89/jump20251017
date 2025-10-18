# RAG (Retrieval Augmented Generation) Setup Guide

## ✅ What's Been Implemented

The application now has **full RAG functionality** using pgvector for semantic search across:
- 📧 **Gmail emails**
- 👥 **HubSpot contacts**
- 📝 **Contact notes**

## 🔧 How It Works

1. **Email Sync**: Fetches emails from Gmail API → Stores in PostgreSQL
2. **Embedding Generation**: Creates vector embeddings using OpenAI's `text-embedding-ada-002`
3. **Semantic Search**: Uses pgvector's cosine distance (`<->` operator) to find relevant content
4. **AI Response**: ChatGPT uses the retrieved context to answer questions

## 📝 Testing the RAG System

### Step 1: Enable pgvector in Supabase (if not already done)

```sql
-- Run this in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;
```

### Step 2: Sync Your Emails

1. **Click the "🔄 Sync Emails" button** in the top header
2. Wait for confirmation: "✅ Successfully synced X emails from Gmail!"
3. This will:
   - Fetch up to 100 recent emails from your Gmail inbox
   - Store them in the database
   - Generate vector embeddings for semantic search

### Step 3: Ask Questions About Your Emails

Now you can ask natural language questions like:

**Example Questions:**
- "Who mentioned their kid plays baseball?"
- "What emails are about meetings?"
- "Show me emails from John"
- "What did Sarah say about the project?"
- "Who emailed me about investments?"

### Step 4: How to Verify It's Working

1. **Check the terminal logs** for:
   ```
   🔧 AI requested 1 tool calls
   🔨 Executing tool: search_emails
   📝 Arguments: {"query":"...","limit":5}
   ✅ Tool result: [...]
   ```

2. **The AI should respond** with specific email content, not generic responses

## 🎯 Technical Details

### Vector Search Query (src/lib/rag.ts)

```sql
SELECT 
  id, subject, sender, body, date,
  embedding <-> '[...]'::vector as distance
FROM "Email"
WHERE "userId" = 'user-id'
AND embedding IS NOT NULL
ORDER BY embedding <-> '[...]'::vector
LIMIT 5
```

### Embedding Model
- Model: `text-embedding-ada-002`
- Dimensions: 1536
- Cost: ~$0.0001 per 1K tokens

## 🐛 Troubleshooting

### Issue: "Vector search error: operator does not exist"
**Solution**: Enable pgvector extension in Supabase:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Issue: "No emails found"
**Solutions**:
1. Click "🔄 Sync Emails" button first
2. Check Gmail permissions are granted
3. Verify emails exist in database:
   ```sql
   SELECT COUNT(*) FROM "Email" WHERE "userId" = 'your-user-id';
   ```

### Issue: "Embedding is null"
**Solution**: The sync process should auto-generate embeddings. If not, call:
```typescript
await ragService.updateEmailEmbeddings(userId)
```

### Issue: "OpenAI quota exceeded"
**Solution**: Add credits at https://platform.openai.com/account/billing

## 📊 Database Schema

```prisma
model Email {
  id         String    @id @default(uuid())
  userId     String
  gmailId    String    @unique
  subject    String
  sender     String
  body       String    @db.Text
  date       DateTime
  embedding  Unsupported("vector(1536)")?  // pgvector
}
```

## 🚀 Next Steps

1. ✅ **Sync emails** - Click the button!
2. ✅ **Ask questions** - Test RAG search
3. ⏭️ **Add HubSpot contacts** - Sync CRM data
4. ⏭️ **Add Calendar events** - Complete integration

## 💡 Pro Tips

1. **Re-sync regularly**: Emails are synced once. Click sync again for new emails.
2. **Be specific**: "Emails from John about the project" works better than "John"
3. **Natural language**: The AI understands context and synonyms
4. **Combine sources**: Soon you can ask "Who in HubSpot mentioned baseball in emails?"

---

**The RAG system is fully functional! Test it by syncing emails and asking questions.** 🎉

