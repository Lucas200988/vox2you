const BOT_NOTIFY_URL = process.env.BOT_NOTIFY_URL ?? 'http://127.0.0.1:3001'

/**
 * Sends a WhatsApp notification via the Claudia bot's local HTTP server.
 * Fails silently — never throws, never blocks the calling action.
 */
export async function notifyGroup(message: string): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    await fetch(`${BOT_NOTIFY_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {
    // bot may not be running — that's fine
  }
}
