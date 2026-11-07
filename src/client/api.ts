import type { Archive, Board, Card, Label, LabelColor, Layout, Priority, Project } from '../shared/types'

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

export const projectsApi = {
  list: () => request<Project[]>('/api/projects'),
  create: (name: string) => request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (id: number, name: string) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
}

export function createApi(projectId: number) {
  const scopedRequest = <T = unknown>(path: string, init?: RequestInit) =>
    request<T>(path.replace('/api', `/api/projects/${projectId}`), init)
  return {
    board: () => scopedRequest<Board>('/api/board'),
    archive: () => scopedRequest<Archive>('/api/archive'),
    createColumn: (name: string) => scopedRequest('/api/columns', { method: 'POST', body: JSON.stringify({ name }) }),
    renameColumn: (id: number, name: string) =>
      scopedRequest(`/api/columns/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    deleteColumn: (id: number) => scopedRequest<void>(`/api/columns/${id}`, { method: 'DELETE' }),
    createCard: (input: CardInput & { columnId: number }) =>
      scopedRequest<Card>('/api/cards', { method: 'POST', body: JSON.stringify(input) }),
    updateCard: (id: number, input: CardInput) =>
      scopedRequest<Card>(`/api/cards/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    archiveCard: (id: number) => scopedRequest<void>(`/api/cards/${id}/archive`, { method: 'POST' }),
    restoreCard: (id: number) => scopedRequest<void>(`/api/cards/${id}/restore`, { method: 'POST' }),
    deleteCard: (id: number) => scopedRequest<void>(`/api/cards/${id}`, { method: 'DELETE' }),
    createLabel: (input: { name: string; color: LabelColor }) =>
      scopedRequest<Label>('/api/labels', { method: 'POST', body: JSON.stringify(input) }),
    deleteLabel: (id: number) => scopedRequest<void>(`/api/labels/${id}`, { method: 'DELETE' }),
    saveLayout: (layout: Layout) => scopedRequest<void>('/api/board/layout', { method: 'POST', body: JSON.stringify(layout) }),
  }
}
