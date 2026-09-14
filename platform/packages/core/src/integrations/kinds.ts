/**
 * Catalog of integrations an admin can configure from the CRM (Configurações → Integrações).
 * Values are stored per tenant (or per unit for channel-bound kinds); secrets are encrypted at rest.
 * `toEnv` maps the stored values onto the same environment keys the provider factory reads, so a
 * credential entered in the CRM behaves exactly like one set in `.env` (the `.env` stays the
 * fallback for anything not configured here).
 */
export type IntegrationScope = 'tenant' | 'unit'

export interface IntegrationField {
  key: string
  label: string
  secret?: boolean
  required?: boolean
  placeholder?: string
  help?: string
  multiline?: boolean
}

export interface IntegrationKindDef {
  kind: string
  label: string
  group: 'ia' | 'canal' | 'agenda' | 'infra'
  scope: IntegrationScope
  description: string
  docsUrl?: string
  fields: IntegrationField[]
  toEnv(values: Record<string, string>): Record<string, string>
}

const pick = (
  values: Record<string, string>,
  map: Record<string, string>,
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [envKey, valueKey] of Object.entries(map)) {
    const v = values[valueKey]
    if (v !== undefined && v !== '') out[envKey] = v
  }
  return out
}

export const INTEGRATION_KINDS: IntegrationKindDef[] = [
  {
    kind: 'anthropic',
    label: 'Anthropic (Claude)',
    group: 'ia',
    scope: 'tenant',
    description: 'Modelo principal do agente (classificação, resposta, copilot, avaliação).',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, required: true, placeholder: 'sk-ant-…' },
      {
        key: 'modelSmart',
        label: 'Modelo principal (opcional)',
        placeholder: 'claude-opus-5',
        help: 'Padrão: claude-opus-5. Use claude-sonnet-5 para reduzir custo.',
      },
      { key: 'modelFast', label: 'Modelo rápido (opcional)', placeholder: 'claude-haiku-4-5' },
    ],
    toEnv: (v) => ({
      LLM_PROVIDER: 'anthropic',
      ...pick(v, {
        ANTHROPIC_API_KEY: 'apiKey',
        LLM_MODEL_SMART: 'modelSmart',
        LLM_MODEL_EVAL: 'modelSmart',
        LLM_MODEL_FAST: 'modelFast',
      }),
    }),
  },
  {
    kind: 'openai',
    label: 'OpenAI (embeddings + áudio)',
    group: 'ia',
    scope: 'tenant',
    description:
      'Embeddings da base de conhecimento e transcrição de áudios (Whisper). Também serve de fallback do LLM.',
    docsUrl: 'https://platform.openai.com/api-keys',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, required: true, placeholder: 'sk-…' },
    ],
    toEnv: (v) => ({
      EMBEDDING_PROVIDER: 'openai',
      STT_PROVIDER: 'openai',
      ...pick(v, { OPENAI_API_KEY: 'apiKey' }),
    }),
  },
  {
    kind: 'whatsapp_meta',
    label: 'WhatsApp Business (Meta Cloud API)',
    group: 'canal',
    scope: 'unit',
    description:
      'Número oficial da unidade. Ao salvar, o canal é criado/atualizado automaticamente com o phone_number_id.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    fields: [
      {
        key: 'phoneNumberId',
        label: 'Phone number ID',
        required: true,
        placeholder: '1234567890',
        help: 'Meta → WhatsApp → API Setup',
      },
      {
        key: 'businessAccountId',
        label: 'WhatsApp Business Account ID',
        placeholder: '9876543210',
      },
      {
        key: 'accessToken',
        label: 'Access token (permanente, do System User)',
        secret: true,
        required: true,
      },
      {
        key: 'appSecret',
        label: 'App secret (validação do webhook)',
        secret: true,
        required: true,
      },
      {
        key: 'verifyToken',
        label: 'Verify token (você escolhe; o mesmo vai na tela de webhook da Meta)',
        secret: true,
        required: true,
      },
    ],
    toEnv: (v) => ({
      MESSAGING_PROVIDER: 'meta',
      ...pick(v, {
        WHATSAPP_PHONE_NUMBER_ID: 'phoneNumberId',
        WHATSAPP_BUSINESS_ACCOUNT_ID: 'businessAccountId',
        WHATSAPP_ACCESS_TOKEN: 'accessToken',
        WHATSAPP_APP_SECRET: 'appSecret',
        WHATSAPP_VERIFY_TOKEN: 'verifyToken',
      }),
    }),
  },
  {
    kind: 'google_calendar',
    label: 'Google Calendar',
    group: 'agenda',
    scope: 'unit',
    description:
      'Agenda da unidade para visitas. Compartilhe o calendário com o e-mail da service account (permissão "fazer alterações").',
    docsUrl: 'https://developers.google.com/workspace/guides/create-credentials#service-account',
    fields: [
      {
        key: 'calendarId',
        label: 'ID do calendário',
        required: true,
        placeholder: 'unidade@group.calendar.google.com',
      },
      {
        key: 'serviceAccountJson',
        label: 'Service account (JSON)',
        secret: true,
        required: true,
        multiline: true,
        help: 'Cole o conteúdo do arquivo JSON baixado do Google Cloud.',
      },
    ],
    toEnv: (v) => {
      const json = v['serviceAccountJson']
      return {
        CALENDAR_PROVIDER: 'google',
        ...pick(v, { GOOGLE_CALENDAR_ID: 'calendarId' }),
        ...(json
          ? {
              GOOGLE_SERVICE_ACCOUNT_JSON: json.trim().startsWith('{')
                ? Buffer.from(json, 'utf8').toString('base64')
                : json,
            }
          : {}),
      }
    },
  },
  {
    kind: 'langfuse',
    label: 'Langfuse (rastreamento da IA)',
    group: 'infra',
    scope: 'tenant',
    description: 'Traces de cada execução do agente: prompts, custo, latência, avaliações.',
    docsUrl: 'https://cloud.langfuse.com',
    fields: [
      { key: 'publicKey', label: 'Public key', required: true, placeholder: 'pk-lf-…' },
      {
        key: 'secretKey',
        label: 'Secret key',
        secret: true,
        required: true,
        placeholder: 'sk-lf-…',
      },
      { key: 'baseUrl', label: 'URL', placeholder: 'https://cloud.langfuse.com' },
    ],
    toEnv: (v) => ({
      TRACE_SINK: 'langfuse',
      ...pick(v, {
        LANGFUSE_PUBLIC_KEY: 'publicKey',
        LANGFUSE_SECRET_KEY: 'secretKey',
        LANGFUSE_BASE_URL: 'baseUrl',
      }),
    }),
  },
  {
    kind: 'smtp',
    label: 'E-mail (SMTP)',
    group: 'infra',
    scope: 'tenant',
    description: 'Notificações para a equipe (handoff, novo lead quente) e convites de agenda.',
    fields: [
      { key: 'host', label: 'Servidor SMTP', required: true, placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'Porta', placeholder: '587' },
      { key: 'user', label: 'Usuário' },
      { key: 'pass', label: 'Senha', secret: true },
      { key: 'from', label: 'Remetente', placeholder: 'VOX2you <no-reply@vox2you.com.br>' },
    ],
    toEnv: (v) =>
      pick(v, {
        SMTP_HOST: 'host',
        SMTP_PORT: 'port',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        SMTP_FROM: 'from',
      }),
  },
  {
    kind: 's3',
    label: 'Armazenamento de mídias (S3 / R2 / MinIO)',
    group: 'infra',
    scope: 'tenant',
    description:
      'Áudios, imagens e documentos recebidos. Sem isso, os arquivos ficam no disco do servidor.',
    fields: [
      { key: 'bucket', label: 'Bucket', required: true },
      { key: 'region', label: 'Região', placeholder: 'sa-east-1' },
      {
        key: 'endpoint',
        label: 'Endpoint (R2/MinIO)',
        placeholder: 'https://<account>.r2.cloudflarestorage.com',
      },
      { key: 'accessKeyId', label: 'Access key ID', required: true },
      { key: 'secretAccessKey', label: 'Secret access key', secret: true, required: true },
    ],
    toEnv: (v) => ({
      STORAGE_PROVIDER: 's3',
      S3_FORCE_PATH_STYLE: v['endpoint'] ? 'true' : 'false',
      ...pick(v, {
        S3_BUCKET: 'bucket',
        S3_REGION: 'region',
        S3_ENDPOINT: 'endpoint',
        S3_ACCESS_KEY_ID: 'accessKeyId',
        S3_SECRET_ACCESS_KEY: 'secretAccessKey',
      }),
    }),
  },
  {
    kind: 'meta_capi',
    label: 'Meta Conversions API (atribuição de anúncios)',
    group: 'canal',
    scope: 'tenant',
    description:
      'Envia leads qualificados, visitas e matrículas de volta para o Ads (otimização de campanhas click-to-WhatsApp).',
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/conversions-api',
    fields: [
      { key: 'pixelId', label: 'Pixel / Dataset ID', required: true },
      { key: 'token', label: 'Access token', secret: true, required: true },
    ],
    toEnv: (v) => pick(v, { META_PIXEL_ID: 'pixelId', META_CAPI_TOKEN: 'token' }),
  },
]

export function integrationKind(kind: string): IntegrationKindDef | undefined {
  return INTEGRATION_KINDS.find((k) => k.kind === kind)
}
