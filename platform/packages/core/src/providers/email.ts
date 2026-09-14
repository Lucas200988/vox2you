export interface EmailMessage {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  replyTo?: string
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<{ id: string }>
}
