import type { Logger, ModelRouting, Providers } from '@vox/core'
import { AnthropicLLMProvider } from './llm/anthropic.js'
import { OpenAILLMProvider } from './llm/openai.js'
import { MockLLMProvider } from './llm/mock.js'
import { FallbackLLMProvider } from './llm/fallback.js'
import { OpenAIEmbeddingProvider } from './embedding/openai.js'
import { HashEmbeddingProvider } from './embedding/hash.js'
import { MetaCloudApiProvider } from './messaging/meta-cloud.js'
import { MetaMessengerProvider } from './messaging/meta-messenger.js'
import { MockMessagingProvider } from './messaging/mock.js'
import { OpenAIWhisperProvider } from './stt/openai-whisper.js'
import { MockSttProvider } from './stt/mock.js'
import { InternalCalendarProvider } from './calendar/internal.js'
import { GoogleCalendarProvider } from './calendar/google.js'
import { S3StorageProvider } from './storage/s3.js'
import { LocalFsStorageProvider } from './storage/local.js'
import { LangfuseTraceSink } from './trace/langfuse.js'
import { ConsoleTraceSink } from './trace/console.js'
import { NoopEmailProvider, SmtpEmailProvider } from './email/smtp.js'
import { MockPaymentProvider } from './payment/mock.js'
import { MetaCapiConversionProvider, NoopConversionProvider } from './conversion/noop.js'
import { defaultParsers, SimpleUrlFetcher } from './parsers/index.js'

export interface ProviderEnv {
  NODE_ENV?: string
  LLM_PROVIDER?: string
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  LLM_MODEL_FAST?: string
  LLM_MODEL_SMART?: string
  LLM_MODEL_EVAL?: string
  EMBEDDING_PROVIDER?: string
  EMBEDDING_MODEL?: string
  KNOWLEDGE_EMBEDDING_DIM?: string
  STT_PROVIDER?: string
  MESSAGING_PROVIDER?: string
  MESSENGER_PAGE_ID?: string
  MESSENGER_IG_ID?: string
  MESSENGER_PAGE_TOKEN?: string
  MESSENGER_APP_SECRET?: string
  MESSENGER_VERIFY_TOKEN?: string
  WHATSAPP_ACCESS_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string
  WHATSAPP_APP_SECRET?: string
  WHATSAPP_VERIFY_TOKEN?: string
  WHATSAPP_GRAPH_VERSION?: string
  CALENDAR_PROVIDER?: string
  GOOGLE_SERVICE_ACCOUNT_JSON?: string
  GOOGLE_CALENDAR_ID?: string
  STORAGE_PROVIDER?: string
  STORAGE_LOCAL_DIR?: string
  S3_ENDPOINT?: string
  S3_REGION?: string
  S3_BUCKET?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_FORCE_PATH_STYLE?: string
  TRACE_SINK?: string
  LANGFUSE_PUBLIC_KEY?: string
  LANGFUSE_SECRET_KEY?: string
  LANGFUSE_BASE_URL?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_FROM?: string
  META_PIXEL_ID?: string
  META_CAPI_TOKEN?: string
}

export interface ProviderStatus {
  llm: string
  embedding: string
  messaging: string
  stt: string
  calendar: string
  storage: string
  trace: string
  email: string
  conversion: string
  pendingCredentials: string[]
}

export function defaultModelRouting(env: ProviderEnv): ModelRouting {
  const fast = env.LLM_MODEL_FAST ?? 'claude-haiku-4-5'
  const smart = env.LLM_MODEL_SMART ?? 'claude-opus-5'
  const evalModel = env.LLM_MODEL_EVAL ?? smart
  return {
    classify: fast,
    extract: fast,
    generate: smart,
    validate: fast,
    summarize: fast,
    evaluate: evalModel,
    copilot: smart,
  }
}

/**
 * Builds the provider container from environment variables. Missing credentials never crash the
 * app: the corresponding mock/local adapter is used and reported in `status.pendingCredentials`.
 */
export function createProvidersFromEnv(
  env: ProviderEnv,
  logger?: Logger,
): { providers: Providers; status: ProviderStatus } {
  const pending: string[] = []
  const isProd = env.NODE_ENV === 'production'

  // LLM
  let llm: Providers['llm']
  const llmChoice = env.LLM_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock')
  // `LLM_PROVIDER=mock` written by the bootstrap keeps winning after a key is added by hand to
  // `.env`; credentials configured in the CRM set the provider themselves, so this only warns.
  if (llmChoice === 'mock' && (env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY))
    logger?.warn(
      'LLM_PROVIDER=mock com credencial presente: o agente responde com o simulador. Remova LLM_PROVIDER do .env (ou defina anthropic/openai) para usar a chave.',
    )
  if (llmChoice === 'anthropic' && env.ANTHROPIC_API_KEY) {
    const primary = new AnthropicLLMProvider({ apiKey: env.ANTHROPIC_API_KEY })
    llm = env.OPENAI_API_KEY
      ? new FallbackLLMProvider([primary, new OpenAILLMProvider({ apiKey: env.OPENAI_API_KEY })], {
          modelMap: {
            openai: {
              'claude-opus-5': 'gpt-4.1',
              'claude-sonnet-5': 'gpt-4.1',
              'claude-haiku-4-5': 'gpt-4.1-mini',
            },
          },
          onFallback: (from, to, err) =>
            logger?.warn({ from, to, err: err.message }, 'llm fallback'),
        })
      : primary
  } else if (llmChoice === 'openai' && env.OPENAI_API_KEY) {
    llm = new OpenAILLMProvider({ apiKey: env.OPENAI_API_KEY })
  } else {
    if (llmChoice !== 'mock') pending.push('ANTHROPIC_API_KEY')
    if (isProd && llmChoice !== 'mock')
      logger?.error('LLM credentials missing in production; using mock provider')
    llm = new MockLLMProvider()
  }
  const models = defaultModelRouting(env)
  if (llm.name === 'openai')
    Object.assign(models, {
      classify: 'gpt-4.1-mini',
      extract: 'gpt-4.1-mini',
      validate: 'gpt-4.1-mini',
      summarize: 'gpt-4.1-mini',
      generate: 'gpt-4.1',
      evaluate: 'gpt-4.1',
      copilot: 'gpt-4.1',
    })

  // Embeddings
  const dim = Number(env.KNOWLEDGE_EMBEDDING_DIM ?? 1536)
  if ((env.EMBEDDING_PROVIDER ?? 'hash') === 'hash' && env.OPENAI_API_KEY)
    logger?.warn(
      'EMBEDDING_PROVIDER=hash com OPENAI_API_KEY presente: a base de conhecimento usa embeddings simulados. Remova EMBEDDING_PROVIDER do .env para usar a OpenAI (reindexe os documentos depois).',
    )
  let embedding: Providers['embedding']
  if (
    (env.EMBEDDING_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'hash')) === 'openai' &&
    env.OPENAI_API_KEY
  )
    embedding = new OpenAIEmbeddingProvider(env.EMBEDDING_MODEL ?? 'text-embedding-3-small', dim, {
      apiKey: env.OPENAI_API_KEY,
    })
  else {
    if (env.EMBEDDING_PROVIDER === 'openai') pending.push('OPENAI_API_KEY (embeddings)')
    embedding = new HashEmbeddingProvider(dim)
  }

  // Messaging
  let messaging: Providers['messaging']
  if ((env.MESSAGING_PROVIDER ?? 'mock') === 'meta') {
    if (
      env.WHATSAPP_ACCESS_TOKEN &&
      env.WHATSAPP_PHONE_NUMBER_ID &&
      env.WHATSAPP_APP_SECRET &&
      env.WHATSAPP_VERIFY_TOKEN
    ) {
      messaging = new MetaCloudApiProvider({
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
        appSecret: env.WHATSAPP_APP_SECRET,
        verifyToken: env.WHATSAPP_VERIFY_TOKEN,
        graphVersion: env.WHATSAPP_GRAPH_VERSION,
      })
    } else {
      pending.push(
        'WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN',
      )
      messaging = new MockMessagingProvider({
        appSecret: env.WHATSAPP_APP_SECRET,
        verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      })
    }
  } else {
    messaging = new MockMessagingProvider({
      appSecret: env.WHATSAPP_APP_SECRET,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    })
  }

  // STT
  let stt: Providers['stt']
  if ((env.STT_PROVIDER ?? 'mock') === 'openai' && env.OPENAI_API_KEY)
    stt = new OpenAIWhisperProvider(undefined, { apiKey: env.OPENAI_API_KEY })
  else {
    if (env.STT_PROVIDER === 'openai') pending.push('OPENAI_API_KEY (stt)')
    stt = new MockSttProvider()
  }

  // Calendar
  let calendar: Providers['calendar']
  if ((env.CALENDAR_PROVIDER ?? 'internal') === 'google' && env.GOOGLE_SERVICE_ACCOUNT_JSON)
    calendar = new GoogleCalendarProvider({
      serviceAccount: env.GOOGLE_SERVICE_ACCOUNT_JSON,
      defaultCalendarId: env.GOOGLE_CALENDAR_ID,
    })
  else {
    if (env.CALENDAR_PROVIDER === 'google') pending.push('GOOGLE_SERVICE_ACCOUNT_JSON')
    calendar = new InternalCalendarProvider()
  }

  // Storage
  let storage: Providers['storage']
  if ((env.STORAGE_PROVIDER ?? 'local') === 's3' && env.S3_BUCKET)
    storage = new S3StorageProvider({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    })
  else {
    if (env.STORAGE_PROVIDER === 's3')
      pending.push('S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY')
    storage = new LocalFsStorageProvider(env.STORAGE_LOCAL_DIR ?? './storage')
  }

  // Trace
  let trace: Providers['trace']
  if (
    (env.TRACE_SINK ?? 'console') === 'langfuse' &&
    env.LANGFUSE_PUBLIC_KEY &&
    env.LANGFUSE_SECRET_KEY
  )
    trace = new LangfuseTraceSink({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL,
    })
  else {
    if (env.TRACE_SINK === 'langfuse') pending.push('LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY')
    trace = new ConsoleTraceSink(logger)
  }

  const email = env.SMTP_HOST
    ? new SmtpEmailProvider({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM ?? 'no-reply@vox2you.local',
      })
    : new NoopEmailProvider()
  const conversion =
    env.META_PIXEL_ID && env.META_CAPI_TOKEN
      ? new MetaCapiConversionProvider({
          pixelId: env.META_PIXEL_ID,
          accessToken: env.META_CAPI_TOKEN,
        })
      : new NoopConversionProvider()

  // Messenger / Instagram DM (same Meta app): configured per unit in the CRM; falls back to the WhatsApp provider (mock in dev)
  const messenger =
    env.MESSENGER_PAGE_ID &&
    env.MESSENGER_PAGE_TOKEN &&
    env.MESSENGER_APP_SECRET &&
    env.MESSENGER_VERIFY_TOKEN
      ? new MetaMessengerProvider({
          pageId: env.MESSENGER_PAGE_ID,
          instagramAccountId: env.MESSENGER_IG_ID,
          pageAccessToken: env.MESSENGER_PAGE_TOKEN,
          appSecret: env.MESSENGER_APP_SECRET,
          verifyToken: env.MESSENGER_VERIFY_TOKEN,
        })
      : undefined
  const messagingFor: Providers['messagingFor'] = (channel) =>
    channel.provider === 'meta_messenger' ? (messenger ?? messaging) : messaging
  const providers: Providers = {
    llm,
    models,
    embedding,
    messaging,
    messagingFor,
    stt,
    calendar,
    storage,
    trace,
    email,
    payment: new MockPaymentProvider(),
    conversion,
    parsers: defaultParsers(),
    urlFetcher: new SimpleUrlFetcher(),
  }
  const status: ProviderStatus = {
    llm: llm.name,
    embedding: embedding.name,
    messaging: messaging.name,
    stt: stt.name,
    calendar: calendar.name,
    storage: storage.name,
    trace: trace.name,
    email: email.name,
    conversion: conversion.name,
    pendingCredentials: pending,
  }
  return { providers, status }
}
