export interface ParsedDocument {
  text: string
  /** Optional page/section breakdown to improve chunk metadata */
  sections?: Array<{ title?: string; text: string; page?: number }>
  metadata?: Record<string, unknown>
}

export interface DocumentParser {
  readonly name: string
  supports(mimeType: string, fileName?: string): boolean
  parse(input: { buffer: Buffer; mimeType: string; fileName?: string }): Promise<ParsedDocument>
}

export interface UrlFetcher {
  fetch(url: string): Promise<ParsedDocument>
}
