import type { Archive, Board, Card, Label, LabelColor, Layout, Priority } from '../shared/types'

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let message = '通信に失敗しました'
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      message = '通信に失敗しました'
    }
    throw new ApiError(message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export type CardInput = {
  title: string
  description: string
  priority: Priority | null
  labelIds: number[]
}

export const api = {
  board: () => request<Board>('/api/board'),
  archive: () => request<Archive>('/api/archive'),
  createColumn: (name: string) => request('/api/columns', { method: 'POST', body: JSON.stringify({ name }) }),
  renameColumn: (id: number, name: string) =>
    request(`/api/columns/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteColumn: (id: number) => request<void>(`/api/columns/${id}`, { method: 'DELETE' }),
  createCard: (input: CardInput & { columnId: number }) =>
    request<Card>('/api/cards', { method: 'POST', body: JSON.stringify(input) }),
  updateCard: (id: number, input: CardInput) =>
    request<Card>(`/api/cards/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  archiveCard: (id: number) => request<void>(`/api/cards/${id}/archive`, { method: 'POST' }),
  restoreCard: (id: number) => request<void>(`/api/cards/${id}/restore`, { method: 'POST' }),
  deleteCard: (id: number) => request<void>(`/api/cards/${id}`, { method: 'DELETE' }),
  createLabel: (input: { name: string; color: LabelColor }) =>
    request<Label>('/api/labels', { method: 'POST', body: JSON.stringify(input) }),
  deleteLabel: (id: number) => request<void>(`/api/labels/${id}`, { method: 'DELETE' }),
  saveLayout: (layout: Layout) => request<void>('/api/board/layout', { method: 'POST', body: JSON.stringify(layout) }),
}
