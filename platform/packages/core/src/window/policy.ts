import { WHATSAPP_SESSION_WINDOW_HOURS, hoursBetween } from '@vox/shared'

/**
 * WhatsApp 24h customer service window. Free-form messages are only allowed while the window is
 * open; outside it only approved templates may be sent. Messenger/Instagram have the same 24h
 * standard window (without templates); other kinds (playground) have no window.
 */
export const WINDOWED_CHANNEL_KINDS = ['whatsapp', 'instagram', 'messenger'] as const

export function isSessionWindowOpen(
  channelKind: string,
  lastInboundAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!(WINDOWED_CHANNEL_KINDS as readonly string[]).includes(channelKind)) return true
  if (!lastInboundAt) return false
  return hoursBetween(lastInboundAt, now) < WHATSAPP_SESSION_WINDOW_HOURS
}

export function sessionWindowRemainingMinutes(
  lastInboundAt: Date | null | undefined,
  now = new Date(),
): number {
  if (!lastInboundAt) return 0
  const remaining =
    WHATSAPP_SESSION_WINDOW_HOURS * 60 - (now.getTime() - lastInboundAt.getTime()) / 60000
  return Math.max(0, Math.round(remaining))
}
