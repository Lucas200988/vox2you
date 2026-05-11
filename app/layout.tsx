import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vox2You — Controle de Estoque',
  description: 'Sistema de controle de estoque de material didático',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
