import nodemailer, { type Transporter } from 'nodemailer'
import type { EmailMessage, EmailProvider } from '@vox/core'

export interface SmtpConfig {
  host: string
  port: number
  user?: string
  pass?: string
  from: string
  secure?: boolean
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp'
  private readonly transport: Transporter

  constructor(private readonly cfg: SmtpConfig) {
    this.transport = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure ?? cfg.port === 465, auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined })
  }

  async send(message: EmailMessage): Promise<{ id: string }> {
    const info = await this.transport.sendMail({ from: this.cfg.from, to: message.to, subject: message.subject, text: message.text, html: message.html, replyTo: message.replyTo })
    return { id: info.messageId }
  }
}

export class NoopEmailProvider implements EmailProvider {
  readonly name = 'noop'
  readonly sent: EmailMessage[] = []
  async send(message: EmailMessage): Promise<{ id: string }> {
    this.sent.push(message)
    return { id: `noop-${this.sent.length}` }
  }
}
