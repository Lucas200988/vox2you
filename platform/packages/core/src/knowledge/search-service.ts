import type { Db, DbTx } from '@vox/db'
import { sql, toSearchQuery, toVectorLiteral } from '@vox/db'
import type { EmbeddingProvider } from '../providers/embedding.js'

export interface SearchParams {
  tenantId: string
  unitId?: string | null
  query: string
  productId?: string | null
  categories?: string[]
  limit?: number
  now?: Date
}

export interface SearchHit {
  chunkId: string
  documentId: string
  title: string
  category: string
  priority: number
  version: number
  content: string
  score: number
  lexicalRank: number | null
  vectorRank: number | null
}

interface RawRow {
  id: string
  document_id: string
  title: string
  category: string
  priority: number
  version: number
  content: string
  lex_score: number | null
  vec_score: number | null
}

/**
 * Hybrid search: BM25-like (ts_rank_cd) + cosine (pgvector) fused with Reciprocal Rank Fusion,
 * filtered by tenant + (unit OR global) + published + validity, boosted by document priority.
 */
export class KnowledgeSearchService {
  constructor(
    private readonly db: Db | DbTx,
    private readonly embedding: EmbeddingProvider,
  ) {}

  async search(params: SearchParams): Promise<SearchHit[]> {
    const limit = params.limit ?? 6
    const now = params.now ?? new Date()
    const candidateLimit = Math.max(20, limit * 4)
    const q = toSearchQuery(params.query)
    if (!q) return []
    const [vector] = await this.embedding.embed([params.query])
    const vec = toVectorLiteral(vector ?? [])

    const unitFilter = params.unitId ? sql`AND (d.unit_id IS NULL OR d.unit_id = ${params.unitId}::uuid)` : sql`AND d.unit_id IS NULL`
    const productFilter = params.productId ? sql`AND (d.product_id IS NULL OR d.product_id = ${params.productId}::uuid)` : sql``
    const categoryFilter = params.categories?.length ? sql`AND d.category = ANY(${params.categories}::text[])` : sql``

    const rows = await this.db.$queryRaw<RawRow[]>(sql`
      WITH base AS (
        SELECT c.id, c.document_id, c.content, c.tsv, c.embedding, d.title, d.category, d.priority, d.version
        FROM knowledge_chunks c
        JOIN knowledge_documents d ON d.id = c.document_id
        WHERE c.tenant_id = ${params.tenantId}::uuid
          AND d.status = 'published'
          AND (d.valid_from IS NULL OR d.valid_from <= ${now})
          AND (d.valid_to IS NULL OR d.valid_to >= ${now})
          ${unitFilter} ${productFilter} ${categoryFilter}
      ),
      lex AS (
        SELECT id, ts_rank_cd(tsv, plainto_tsquery('vox_pt', ${q})) AS lex_score
        FROM base
        WHERE tsv @@ plainto_tsquery('vox_pt', ${q})
        ORDER BY lex_score DESC
        LIMIT ${candidateLimit}
      ),
      vec AS (
        SELECT id, 1 - (embedding <=> ${vec}::vector) AS vec_score
        FROM base
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${candidateLimit}
      )
      SELECT b.id, b.document_id, b.title, b.category, b.priority, b.version, b.content, lex.lex_score, vec.vec_score
      FROM base b
      LEFT JOIN lex ON lex.id = b.id
      LEFT JOIN vec ON vec.id = b.id
      WHERE lex.id IS NOT NULL OR vec.id IS NOT NULL
    `)

    const lexRanked = [...rows].filter((r) => r.lex_score !== null).sort((a, b) => (b.lex_score ?? 0) - (a.lex_score ?? 0))
    const vecRanked = [...rows].filter((r) => r.vec_score !== null).sort((a, b) => (b.vec_score ?? 0) - (a.vec_score ?? 0))
    const lexRank = new Map(lexRanked.map((r, i) => [r.id, i + 1]))
    const vecRank = new Map(vecRanked.map((r, i) => [r.id, i + 1]))
    const K = 60
    const hits: SearchHit[] = rows.map((r) => {
      const lr = lexRank.get(r.id) ?? null
      const vr = vecRank.get(r.id) ?? null
      const rrf = (lr ? 1 / (K + lr) : 0) + (vr ? 1 / (K + vr) : 0)
      const priorityBoost = 1 + (r.priority - 5) * 0.05 // priority 10 → +25%, priority 1 → -20%
      // include raw cosine similarity to give absolute grounding signal
      const absolute = Math.max(r.vec_score ?? 0, Math.min(1, (r.lex_score ?? 0) * 2))
      return {
        chunkId: r.id,
        documentId: r.document_id,
        title: r.title,
        category: r.category,
        priority: r.priority,
        version: r.version,
        content: r.content,
        score: Number((rrf * priorityBoost * 30 + absolute * 0.5).toFixed(4)),
        lexicalRank: lr,
        vectorRank: vr,
      }
    })
    return hits.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  /** Aggregate retrieval confidence: best absolute similarity among hits (0..1). */
  static retrievalConfidence(hits: SearchHit[]): number {
    if (!hits.length) return 0
    const top = hits[0]!
    const bothSignals = top.lexicalRank !== null && top.vectorRank !== null
    const base = Math.min(1, top.score)
    return Number((bothSignals ? Math.min(1, base + 0.15) : base).toFixed(3))
  }

  /** Renders hits for prompt inclusion with stable ids for source attribution. */
  static render(hits: SearchHit[], maxChars = 6000): string {
    let out = ''
    for (const h of hits) {
      const block = `[src:${h.chunkId.slice(0, 8)}] (${h.title} · ${h.category} · v${h.version})\n${h.content}\n\n`
      if (out.length + block.length > maxChars) break
      out += block
    }
    return out.trim()
  }
}
