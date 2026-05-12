import http from 'http'
import type { Client } from 'whatsapp-web.js'

export function startNotifyServer(whatsapp: Client, groupId: string): void {
  const port = parseInt(process.env.BOT_NOTIFY_PORT ?? '3001', 10)

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/notify') {
      res.writeHead(404)
      res.end()
      return
    }

    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body) as { message: string }
        if (!message) { res.writeHead(400); res.end('missing message'); return }
        await whatsapp.sendMessage(groupId, message)
        res.writeHead(200)
        res.end('ok')
      } catch (err) {
        console.error('❌ notify-server:', err)
        res.writeHead(500)
        res.end('error')
      }
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`🔔 Notify server ouvindo em 127.0.0.1:${port}`)
  })
}
