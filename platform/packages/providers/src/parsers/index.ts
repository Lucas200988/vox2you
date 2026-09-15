import * as cheerio from 'cheerio'
import { parse as parseCsv } from 'csv-parse/sync'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import type { DocumentParser, ParsedDocument, UrlFetcher } from '@vox/core'
import { ValidationError } from '@vox/core'

export class TextParser implements DocumentParser {
  readonly name = 'text'
  supports(mime: string, fileName?: string): boolean {
    return mime.startsWith('text/plain') || mime === 'text/markdown' || mime === 'application/json' || /\.(txt|md|markdown|json)$/i.test(fileName ?? '')
  }
  async parse({ buffer }: { buffer: Buffer }): Promise<ParsedDocument> {
    return { text: buffer.toString('utf8') }
  }
}

export class CsvParser implements DocumentParser {
  readonly name = 'csv'
  supports(mime: string, fileName?: string): boolean {
    return mime === 'text/csv' || mime === 'application/csv' || /\.csv$/i.test(fileName ?? '')
  }
  async parse({ buffer }: { buffer: Buffer }): Promise<ParsedDocument> {
    const rows = parseCsv(buffer.toString('utf8'), { columns: true, skip_empty_lines: true, relax_column_count: true, delimiter: [',', ';'] }) as Record<string, string>[]
    return { text: rowsToText(rows) }
  }
}

export class XlsxParser implements DocumentParser {
  readonly name = 'xlsx'
  supports(mime: string, fileName?: string): boolean {
    return mime.includes('spreadsheet') || mime === 'application/vnd.ms-excel' || /\.xlsx?$/i.test(fileName ?? '')
  }
  async parse({ buffer }: { buffer: Buffer }): Promise<ParsedDocument> {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const sections = wb.SheetNames.map((name) => {
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[name]!, { defval: '' })
      return { title: name, text: `## ${name}\n\n${rowsToText(rows)}` }
    })
    return { text: sections.map((s) => s.text).join('\n\n'), sections }
  }
}

export class DocxParser implements DocumentParser {
  readonly name = 'docx'
  supports(mime: string, fileName?: string): boolean {
    return mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(fileName ?? '')
  }
  async parse({ buffer }: { buffer: Buffer }): Promise<ParsedDocument> {
    const res = await mammoth.extractRawText({ buffer })
    return { text: res.value }
  }
}

export class PdfParser implements DocumentParser {
  readonly name = 'pdf'
  supports(mime: string, fileName?: string): boolean {
    return mime === 'application/pdf' || /\.pdf$/i.test(fileName ?? '')
  }
  async parse({ buffer }: { buffer: Buffer }): Promise<ParsedDocument> {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      const sections = (result.pages ?? []).map((p, i) => ({ page: i + 1, text: p.text }))
      return { text: result.text, sections, metadata: { pages: result.total } }
    } finally {
      await parser.destroy().catch(() => undefined)
    }
  }
}

export class HtmlParser implements DocumentParser {
  readonly name = 'html'
  supports(mime: string, fileName?: string): boolean {
    return mime.startsWith('text/html') || /\.html?$/i.test(fileName ?? '')
  }
  async parse({ buffer }: { buffer: Buffer }): Promise<ParsedDocument> {
    return { text: htmlToText(buffer.toString('utf8')) }
  }
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, footer, noscript, iframe, svg').remove()
  const title = $('title').text().trim()
  const parts: string[] = []
  $('h1, h2, h3, h4, p, li, td, th, blockquote, pre').each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? ''
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    if (!text) return
    if (/^h[1-4]$/.test(tag)) parts.push(`\n## ${text}\n`)
    else parts.push(text)
  })
  const body = parts.length ? parts.join('\n') : $('body').text().replace(/\s+/g, ' ').trim()
  return title ? `# ${title}\n\n${body}` : body
}

/** Fetches a public URL (size-limited, no redirects to private hosts) and extracts readable text. */
export class SimpleUrlFetcher implements UrlFetcher {
  constructor(private readonly opts: { maxBytes?: number; fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}

  async fetch(url: string): Promise<ParsedDocument> {
    const u = new URL(url)
    if (!['http:', 'https:'].includes(u.protocol)) throw new ValidationError('Only http(s) URLs are supported')
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith('.local')) throw new ValidationError('Private hosts are not allowed')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 15000)
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(url, { signal: controller.signal, headers: { 'User-Agent': 'VOX2you-KB/1.0' } })
      if (!res.ok) throw new ValidationError(`Fetch failed: ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > (this.opts.maxBytes ?? 5 * 1024 * 1024)) throw new ValidationError('Document too large')
      const mime = res.headers.get('content-type') ?? 'text/html'
      if (mime.includes('pdf')) return new PdfParser().parse({ buffer: buf })
      if (mime.includes('html')) return { text: htmlToText(buf.toString('utf8')), metadata: { url } }
      return { text: buf.toString('utf8'), metadata: { url } }
    } finally {
      clearTimeout(timer)
    }
  }
}

function rowsToText(rows: Record<string, string>[]): string {
  return rows.map((r) => Object.entries(r).filter(([, v]) => String(v).trim() !== '').map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n')
}

export function defaultParsers(): DocumentParser[] {
  return [new TextParser(), new CsvParser(), new XlsxParser(), new DocxParser(), new PdfParser(), new HtmlParser()]
}
