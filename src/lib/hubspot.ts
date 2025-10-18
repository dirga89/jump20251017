import { Client } from '@hubspot/api-client'
import { prisma } from './prisma'

export class HubSpotService {
  private client: Client

  constructor(accessToken: string) {
    this.client = new Client({ accessToken })
  }

  async syncContacts(userId: string) {
    try {
      // Get all contacts from HubSpot
      const response = await this.client.crm.contacts.getAll(undefined, undefined, [
        'firstname',
        'lastname', 
        'email',
        'phone',
        'company',
        'jobtitle',
        'notes_last_contacted',
        'hs_lead_status',
        'lifecyclestage'
      ])

      const contacts = (response as any).results || []
      
      for (const contact of contacts) {
        await this.syncContact(userId, contact)
      }

      return { success: true, count: contacts.length }
    } catch (error) {
      console.error('HubSpot contacts sync error:', error)
      throw error
    }
  }

  private async syncContact(userId: string, hubspotContact: any) {
    try {
      const contactData = {
        userId,
        hubspotId: hubspotContact.id,
        email: hubspotContact.properties.email,
        firstName: hubspotContact.properties.firstname,
        lastName: hubspotContact.properties.lastname,
        phone: hubspotContact.properties.phone,
        company: hubspotContact.properties.company,
        jobTitle: hubspotContact.properties.jobtitle,
        notes: `Status: ${hubspotContact.properties.hs_lead_status || 'Unknown'}, Stage: ${hubspotContact.properties.lifecyclestage || 'Unknown'}`
      }

      await prisma.contact.upsert({
        where: { hubspotId: hubspotContact.id },
        update: contactData,
        create: contactData
      })

      // Sync contact notes
      await this.syncContactNotes(userId, hubspotContact.id)

    } catch (error) {
      console.error(`Error syncing contact ${hubspotContact.id}:`, error)
    }
  }

  async syncContactNotes(userId: string, contactId: string) {
    try {
      // Get notes for this contact - using basicApi.getPage instead of getAll
      const response = await this.client.crm.objects.notes.basicApi.getPage(undefined, undefined, [
        'hs_note_body',
        'hs_createdate'
      ])

      const notes = (response.results as any[] || []).filter((note: any) => 
        note.associations?.contacts?.results?.some((assoc: any) => assoc.id === contactId)
      )

      for (const note of notes) {
        await prisma.contactNote.upsert({
          where: { hubspotId: note.id },
          update: {
            note: note.properties.hs_note_body || '',
            createdAt: new Date(note.properties.hs_createdate || Date.now())
          },
          create: {
            userId,
            contactId: contactId,
            hubspotId: note.id,
            note: note.properties.hs_note_body || '',
            createdAt: new Date(note.properties.hs_createdate || Date.now())
          }
        })
      }

    } catch (error) {
      console.error(`Error syncing notes for contact ${contactId}:`, error)
    }
  }

  async createContact(userId: string, contactData: {
    email?: string
    firstName?: string
    lastName?: string
    phone?: string
    company?: string
    jobTitle?: string
    notes?: string
  }) {
    try {
      const response = await this.client.crm.contacts.basicApi.create({
        properties: {
          email: contactData.email || '',
          firstname: contactData.firstName || '',
          lastname: contactData.lastName || '',
          phone: contactData.phone || '',
          company: contactData.company || '',
          jobtitle: contactData.jobTitle || '',
          lifecyclestage: 'lead'
        }
      })

      // Sync the new contact to our database first
      await this.syncContact(userId, response)

      // Add note if provided - do this AFTER syncing the contact
      if (contactData.notes && response.id) {
        try {
          await this.addContactNote(response.id, contactData.notes)
        } catch (noteError) {
          console.error('Error adding note to new contact:', noteError)
          // Don't fail the whole operation if note creation fails
        }
      }

      return { success: true, contactId: response.id }
    } catch (error) {
      console.error('Create contact error:', error)
      throw error
    }
  }

  async addContactNote(contactId: string, note: string) {
    try {
      // Create note with association to contact
      const response = await this.client.crm.objects.notes.basicApi.create({
        properties: {
          hs_note_body: note,
          hs_timestamp: new Date().toISOString()
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED' as any,
                associationTypeId: 202
              }
            ]
          }
        ]
      })

      return { success: true, noteId: response.id }
    } catch (error) {
      console.error('Add contact note error:', error)
      throw error
    }
  }

  async searchContacts(userId: string, query: string, maxResults: number = 10) {
    try {
      // Search in HubSpot
      const response = await this.client.crm.contacts.searchApi.doSearch({
        query,
        limit: maxResults,
        properties: ['firstname', 'lastname', 'email', 'company']
      })

      const contactIds = response.results?.map(c => c.id) || []
      const contacts = []

      for (const contactId of contactIds) {
        const contact = await prisma.contact.findFirst({
          where: { hubspotId: contactId, userId }
        })
        if (contact) contacts.push(contact)
      }

      return contacts
    } catch (error) {
      console.error('Search contacts error:', error)
      // Fallback to database search
      return await prisma.contact.findMany({
        where: {
          userId,
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { company: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: maxResults
      })
    }
  }
}
