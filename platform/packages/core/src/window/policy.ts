import { WHATSAPP_SESSION_WINDOW_HOURS, hoursBetween } from '@vox/shared'

/**
 * WhatsApp 24h customer service window. Free-form messages are only allowed while the window is
 * open; outside it only approved templates may be sent. Channel kinds other than whatsapp have no window.
 */
export function isSessionWindowOpen(channelKind: string, lastInboundAt: Date | null | undefined, now = new Date()): boolean {
  if (channelKind !== 'whatsapp') return true
  if (!lastInboundAt) return false
  return hoursBetween(lastInboundAt, now) < WHATSAPP_SESSION_WINDOW_HOURS
}

export function sessionWindowRemainingMinutes(lastInboundAt: Date | null | undefined, now = new Date()): number {
  if (!lastInboundAt) return 0
  const remaining = WHATSAPP_SESSION_WINDOW_HOURS * 60 - (now.getTime() - lastInboundAt.getTime()) / 60000
  return Math.max(0, Math.round(remaining))
}
