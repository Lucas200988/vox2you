'use client'

import useSWR, { type SWRConfiguration } from 'swr'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
  }
  const text = await res.text()
  const json = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const err = json as { error?: string; message?: string; details?: unknown } | null
    throw new ApiError(
      res.status,
      err?.error ?? 'error',
      err?.message ?? `Erro ${res.status}`,
      err?.details,
    )
  }
  return json as T
}

export const api = {
  get: <T>(path: string) => fetch(`/api/${path}`, { cache: 'no-store' }).then((r) => handle<T>(r)),
  post: <T>(path: string, body?: unknown) =>
    fetch(`/api/${path}`, {
      method: 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  put: <T>(path: string, body?: unknown) =>
    fetch(`/api/${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => handle<T>(r)),
  patch: <T>(path: string, body?: unknown) =>
    fetch(`/api/${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => handle<T>(r)),
  del: <T>(path: string) => fetch(`/api/${path}`, { method: 'DELETE' }).then((r) => handle<T>(r)),
  upload: <T>(path: string, form: FormData) =>
    fetch(`/api/${path}`, { method: 'POST', body: form }).then((r) => handle<T>(r)),
}

export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (p: string) => api.get<T>(p), { revalidateOnFocus: false, ...config })
}
