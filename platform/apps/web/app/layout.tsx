import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VOX2you CRM',
  description: 'CRM conversacional com agente comercial de IA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
