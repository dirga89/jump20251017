import { google } from 'googleapis'
import { prisma } from './prisma'

export class GmailService {
  private oauth2Client: any
  private gmail: any

  constructor(accessToken: string, refreshToken?: string) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + '/api/auth/callback/google'
    )

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
  }

  async syncEmails(userId: string, maxResults: number = 100) {
    try {
      // Get recent emails
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: 'in:inbox' // Only sync inbox emails for now
      })

      const messages = response.data.messages || []
      
      for (const message of messages) {
        await this.syncEmail(userId, message.id)
      }

      return { success: true, count: messages.length }
    } catch (error) {
      console.error('Gmail sync error:', error)
      throw error
    }
  }

  private async syncEmail(userId: string, messageId: string) {
    try {
      // Check if email already exists
      const existingEmail = await prisma.email.findFirst({
        where: { gmailId: messageId, userId }
      })

      if (existingEmail) return

      // Get full message details
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      })

      const headers = message.data.payload?.headers || []
      const getHeader = (name: string) => 
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value

      const subject = getHeader('Subject') || ''
      const from = getHeader('From') || ''
      const to = getHeader('To') || ''
      const date = new Date(getHeader('Date') || Date.now())

      // Extract body text
      let body = ''
      let htmlBody = ''
      
      const extractBody = (part: any) => {
        if (part.body?.data) {
          const content = Buffer.from(part.body.data, 'base64').toString()
          if (part.mimeType === 'text/html') {
            htmlBody += content
          } else {
            body += content
          }
        }
        
        if (part.parts) {
          part.parts.forEach(extractBody)
        }
      }

      if (message.data.payload) {
        extractBody(message.data.payload)
      }

      // Get labels
      const labels = message.data.labelIds || []

      // Create email record
      await prisma.email.create({
        data: {
          userId,
          gmailId: messageId,
          threadId: message.data.threadId || '',
          subject,
          sender: from,
          recipient: to,
          body,
          htmlBody,
          date,
          labels,
          isRead: labels.includes('UNREAD') ? false : true
        }
      })

    } catch (error) {
      console.error(`Error syncing email ${messageId}:`, error)
    }
  }

  async sendEmail(to: string, subject: string, body: string, htmlBody?: string) {
    try {
      const message = {
        to,
        subject,
        text: body,
        html: htmlBody
      }

      const encodedMessage = Buffer.from(
        `To: ${to}\r\n` +
        `Subject: ${subject}\r\n` +
        `Content-Type: text/html; charset=utf-8\r\n` +
        `\r\n` +
        `${htmlBody || body}`
      ).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      })

      return { success: true, messageId: response.data.id }
    } catch (error) {
      console.error('Send email error:', error)
      throw error
    }
  }

  async searchEmails(userId: string, query: string, maxResults: number = 10) {
    try {
      // First try Gmail API search
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults
      })

      const messageIds = response.data.messages?.map(m => m.id) || []
      const emails = []

      for (const messageId of messageIds) {
        const email = await prisma.email.findFirst({
          where: { gmailId: messageId, userId }
        })
        if (email) emails.push(email)
      }

      return emails
    } catch (error) {
      console.error('Search emails error:', error)
      // Fallback to database search
      return await prisma.email.findMany({
        where: {
          userId,
          OR: [
            { subject: { contains: query, mode: 'insensitive' } },
            { body: { contains: query, mode: 'insensitive' } },
            { sender: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: maxResults,
        orderBy: { date: 'desc' }
      })
    }
  }
}
