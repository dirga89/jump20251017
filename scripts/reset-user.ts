import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = 'dirga89@gmail.com'
  
  console.log(`🔍 Looking for user: ${email}`)
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      accounts: true,
      emails: true,
      contacts: true,
      calendarEvents: true,
      messages: true,
      tasks: true,
      ongoingInstructions: true
    }
  })

  if (!user) {
    console.log('❌ User not found')
    return
  }

  console.log(`👤 Found user: ${user.id}`)
  console.log(`📧 Emails: ${user.emails.length}`)
  console.log(`👥 Contacts: ${user.contacts.length}`)
  console.log(`📅 Calendar Events: ${user.calendarEvents.length}`)
  console.log(`💬 Messages: ${user.messages.length}`)
  console.log(`✅ Tasks: ${user.tasks.length}`)
  console.log(`📝 Ongoing Instructions: ${user.ongoingInstructions.length}`)
  console.log(`🔑 Accounts: ${user.accounts.length}`)

  console.log('\n🗑️  Deleting user and all related data...')

  // Delete all related data (Prisma will handle cascade deletes based on schema)
  await prisma.user.delete({
    where: { id: user.id }
  })

  console.log('✅ User deleted successfully!')
  console.log('\n👉 Now sign in again with Google to create a fresh user with the adapter.')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

