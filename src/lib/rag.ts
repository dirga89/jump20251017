import { OpenAI } from 'openai'
import { prisma } from './prisma'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export class RAGService {
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.replace(/\n/g, ' ')
      })
      
      return response.data[0].embedding
    } catch (error) {
      console.error('Error generating embedding:', error)
      throw error
    }
  }

  async searchEmails(userId: string, query: string, limit: number = 5) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query)

      // Search using vector similarity
      const results = await prisma.$queryRaw`
        SELECT 
          id, subject, sender, body, date,
          embedding <-> ${JSON.stringify(queryEmbedding)} as distance
        FROM "Email"
        WHERE "userId" = ${userId}
        AND embedding IS NOT NULL
        ORDER BY embedding <-> ${JSON.stringify(queryEmbedding)}
        LIMIT ${limit}
      `

      return results
    } catch (error) {
      console.error('Vector search error:', error)
      
      // Fallback to text search
      return await prisma.email.findMany({
        where: {
          userId,
          OR: [
            { subject: { contains: query, mode: 'insensitive' } },
            { body: { contains: query, mode: 'insensitive' } },
            { sender: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: limit,
        orderBy: { date: 'desc' }
      })
    }
  }

  async searchContacts(userId: string, query: string, limit: number = 5) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query)

      // Search using vector similarity
      const results = await prisma.$queryRaw`
        SELECT 
          id, "firstName", "lastName", email, company, notes,
          embedding <-> ${JSON.stringify(queryEmbedding)} as distance
        FROM "Contact"
        WHERE "userId" = ${userId}
        AND embedding IS NOT NULL
        ORDER BY embedding <-> ${JSON.stringify(queryEmbedding)}
        LIMIT ${limit}
      `

      return results
    } catch (error) {
      console.error('Vector search error:', error)
      
      // Fallback to text search
      return await prisma.contact.findMany({
        where: {
          userId,
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { company: { contains: query, mode: 'insensitive' } },
            { notes: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: limit
      })
    }
  }

  async searchContactNotes(userId: string, query: string, limit: number = 5) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query)

      // Search using vector similarity
      const results = await prisma.$queryRaw`
        SELECT 
          cn.id, cn.note, cn."createdAt", c."firstName", c."lastName", c.email,
          cn.embedding <-> ${JSON.stringify(queryEmbedding)} as distance
        FROM "ContactNote" cn
        JOIN "Contact" c ON cn."contactId" = c.id
        WHERE cn."userId" = ${userId}
        AND cn.embedding IS NOT NULL
        ORDER BY cn.embedding <-> ${JSON.stringify(queryEmbedding)}
        LIMIT ${limit}
      `

      return results
    } catch (error) {
      console.error('Vector search error:', error)
      
      // Fallback to text search
      return await prisma.contactNote.findMany({
        where: {
          userId,
          note: { contains: query, mode: 'insensitive' }
        },
        include: {
          contact: true
        },
        take: limit,
        orderBy: { createdAt: 'desc' }
      })
    }
  }

  async updateEmailEmbeddings(userId: string) {
    try {
      const emails = await prisma.email.findMany({
        where: {
          userId,
          embedding: null
        },
        take: 50 // Process in batches
      })

      for (const email of emails) {
        try {
          const text = `${email.subject} ${email.body}`.substring(0, 8000) // Limit text length
          const embedding = await this.generateEmbedding(text)
          
          await prisma.email.update({
            where: { id: email.id },
            data: { embedding: JSON.stringify(embedding) }
          })
        } catch (error) {
          console.error(`Error updating embedding for email ${email.id}:`, error)
        }
      }

      return { success: true, processed: emails.length }
    } catch (error) {
      console.error('Update email embeddings error:', error)
      throw error
    }
  }

  async updateContactEmbeddings(userId: string) {
    try {
      const contacts = await prisma.contact.findMany({
        where: {
          userId,
          embedding: null
        },
        take: 50 // Process in batches
      })

      for (const contact of contacts) {
        try {
          const text = `${contact.firstName} ${contact.lastName} ${contact.email} ${contact.company} ${contact.notes}`.substring(0, 8000)
          const embedding = await this.generateEmbedding(text)
          
          await prisma.contact.update({
            where: { id: contact.id },
            data: { embedding: JSON.stringify(embedding) }
          })
        } catch (error) {
          console.error(`Error updating embedding for contact ${contact.id}:`, error)
        }
      }

      return { success: true, processed: contacts.length }
    } catch (error) {
      console.error('Update contact embeddings error:', error)
      throw error
    }
  }

  async updateContactNoteEmbeddings(userId: string) {
    try {
      const notes = await prisma.contactNote.findMany({
        where: {
          userId,
          embedding: null
        },
        take: 50 // Process in batches
      })

      for (const note of notes) {
        try {
          const text = note.note.substring(0, 8000)
          const embedding = await this.generateEmbedding(text)
          
          await prisma.contactNote.update({
            where: { id: note.id },
            data: { embedding: JSON.stringify(embedding) }
          })
        } catch (error) {
          console.error(`Error updating embedding for note ${note.id}:`, error)
        }
      }

      return { success: true, processed: notes.length }
    } catch (error) {
      console.error('Update contact note embeddings error:', error)
      throw error
    }
  }

  async getContextForQuery(userId: string, query: string) {
    try {
      const [emails, contacts, notes] = await Promise.all([
        this.searchEmails(userId, query, 3),
        this.searchContacts(userId, query, 3),
        this.searchContactNotes(userId, query, 3)
      ])

      return {
        emails,
        contacts,
        notes,
        summary: this.formatContext(emails, contacts, notes)
      }
    } catch (error) {
      console.error('Get context error:', error)
      return {
        emails: [],
        contacts: [],
        notes: [],
        summary: 'No relevant context found.'
      }
    }
  }

  private formatContext(emails: any[], contacts: any[], notes: any[]) {
    let context = ''

    if (emails.length > 0) {
      context += 'Recent relevant emails:\n'
      emails.forEach(email => {
        context += `- ${email.subject} from ${email.sender} on ${email.date}\n`
      })
      context += '\n'
    }

    if (contacts.length > 0) {
      context += 'Relevant contacts:\n'
      contacts.forEach(contact => {
        context += `- ${contact.firstName} ${contact.lastName} (${contact.email}) at ${contact.company}\n`
      })
      context += '\n'
    }

    if (notes.length > 0) {
      context += 'Recent notes:\n'
      notes.forEach(note => {
        context += `- ${note.note.substring(0, 200)}...\n`
      })
    }

    return context
  }
}
