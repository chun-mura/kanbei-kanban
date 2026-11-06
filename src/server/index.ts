import { serve } from '@hono/node-server'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { mkdirSync } from 'node:fs'
import { openDatabase } from './db'
import { createApp } from './routes'

const dataDir = join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

const { db } = openDatabase(join(dataDir, 'kanban.db'))
const app = createApp(db)
const distDir = join(process.cwd(), 'dist')
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

if (process.env.NODE_ENV === 'production') {
  app.get('*', async (c) => {
    const url = new URL(c.req.url)
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^[/\\]+/, '')
    const file = safeFile(rel)
    if (!file) return c.notFound()
    try {
      const data = await readFile(file)
      const type = contentTypes[extname(file)] ?? 'application/octet-stream'
      return c.body(data, 200, { 'content-type': type })
    } catch {
      if (extname(rel)) return c.notFound()
      const html = await readFile(join(distDir, 'index.html'))
      return c.body(html, 200, { 'content-type': 'text/html; charset=utf-8' })
    }
  })
}

const host = listenHost()
const port = listenPort()

serve({ fetch: app.fetch, hostname: host, port }, () => {
  const published = process.env.KANBEI_PUBLIC_PORT ?? String(port)
  console.log(`kanbei http://127.0.0.1:${published}`)
})

function listenHost() {
  const host = process.env.HOST ?? '127.0.0.1'
  if (host.trim() !== host || host.includes('\0') || host.length === 0) {
    console.error('HOST が不正です')
    process.exit(1)
  }
  return host
}

function listenPort() {
  const raw = process.env.PORT ?? '8787'
  if (!/^\d+$/.test(raw)) {
    console.error('PORT は 1 から 65535 の整数にしてください')
    process.exit(1)
  }
  const port = Number(raw)
  if (port < 1 || port > 65535) {
    console.error('PORT は 1 から 65535 の整数にしてください')
    process.exit(1)
  }
  return port
}

function safeFile(rel: string) {
  let decoded = rel
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const parts = decoded.split(/[/\\]/).filter(Boolean)
  if (parts.some((part) => part === '..')) return null
  const file = normalize(join(distDir, parts.join(sep)))
  const root = normalize(distDir + sep)
  if (!file.startsWith(root) && file !== normalize(distDir)) return null
  return file
}
