import { backgroundPoller } from './background-poller'

/**
 * Initialize background services when the app starts
 */
export function initializeBackgroundServices() {
  // Only run in production or when explicitly enabled
  if (process.env.ENABLE_BACKGROUND_POLLING === 'true') {
    console.log('🌟 Initializing background services...')
    backgroundPoller.start()
  } else {
    console.log('⏸️  Background polling disabled (set ENABLE_BACKGROUND_POLLING=true to enable)')
  }
}

// Auto-initialize if this module is imported
if (typeof window === 'undefined') {
  // Only run on server-side
  initializeBackgroundServices()
}

