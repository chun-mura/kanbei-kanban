import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './db'
import { createApp } from './routes'

const handles: { close: () => void }[] = []

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close()
})

describe('kanban api', () => {
  it('seeds three columns once and no cards', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'kanbei-')), 'kanban.db')
    const first = openDatabase(file)
    handles.push(first)
    const created = await board(createApp(first.db))
    expect(created.columns.map((column) => column.name)).toEqual(['未着手', '進行中', '完了'])
    expect(created.columns.every((column) => column.cards.length === 0)).toBe(true)
    first.close()
    handles.pop()

    const second = openDatabase(file)
    handles.push(second)
    const again = await board(createApp(second.db))
    expect(again.columns).toHaveLength(3)
  })

  it('rejects an empty title and a column that still has a card', async () => {
    const { app } = memory()
    const columns = (await board(app)).columns
    const todo = columns[0]
    if (!todo) throw new Error('missing column')

    const empty = await app.request('/api/cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ columnId: todo.id, title: '   ' }),
    })
    expect(empty.status).toBe(400)

    const created = await app.request('/api/cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        columnId: todo.id,
        title: '見積もりを返す',
        description: '午後',
        priority: 'high',
      }),
    })
    expect(created.status).toBe(201)
    const card = (await created.json()) as { id: number }

    const blocked = await app.request(`/api/columns/${todo.id}`, { method: 'DELETE' })
    expect(blocked.status).toBe(409)

    const archived = await app.request(`/api/cards/${card.id}/archive`, { method: 'POST' })
    expect(archived.status).toBe(204)
    const stillBlocked = await app.request(`/api/columns/${todo.id}`, { method: 'DELETE' })
    expect(stillBlocked.status).toBe(409)

    const hidden = await board(app)
    expect(hidden.columns[0]?.cards).toEqual([])
    const archive = await app.request('/api/archive')
    const archivedCards = (await archive.json()) as { cards: { id: number; columnId: number }[] }
    expect(archivedCards.cards.map((item) => item.id)).toEqual([card.id])

    const restored = await app.request(`/api/cards/${card.id}/restore`, { method: 'POST' })
    expect(restored.status).toBe(204)
    const back = await board(app)
    expect(back.columns[0]?.cards.map((item) => item.id)).toEqual([card.id])
    expect(back.columns[0]?.cards[0]?.priority).toBe('high')
  })

  it('keeps labels, refuses a bad color, and drops links when the label is deleted', async () => {
    const { app } = memory()
    const todo = (await board(app)).columns[0]
    if (!todo) throw new Error('missing column')
    const bad = await app.request('/api/labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '急ぎ', color: 'pink' }),
    })
    expect(bad.status).toBe(400)

    const labelRes = await app.request('/api/labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '急ぎ', color: 'shu' }),
    })
    expect(labelRes.status).toBe(201)
    const label = (await labelRes.json()) as { id: number }

    const cardRes = await app.request('/api/cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ columnId: todo.id, title: '連絡', labelIds: [label.id] }),
    })
    const card = (await cardRes.json()) as { id: number; labelIds: number[] }
    expect(card.labelIds).toEqual([label.id])

    const removed = await app.request(`/api/labels/${label.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(204)
    const current = await board(app)
    expect(current.labels).toEqual([])
    expect(current.columns[0]?.cards[0]?.labelIds).toEqual([])
  })

  it('saves a layout in one step and rejects a layout that drops a card', async () => {
    const { app } = memory()
    const current = await board(app)
    const [first, second] = current.columns
    if (!first || !second) throw new Error('missing columns')
    const make = async (columnId: number, title: string) => {
      const response = await app.request('/api/cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ columnId, title }),
      })
      return (await response.json()) as { id: number }
    }
    const alpha = await make(first.id, '甲')
    const beta = await make(first.id, '乙')
    const gamma = await make(second.id, '丙')

    const broken = await app.request('/api/board/layout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        columns: current.columns.map((column) => ({
          id: column.id,
          cardIds: column.id === first.id ? [alpha.id] : [],
        })),
      }),
    })
    expect(broken.status).toBe(400)

    const saved = await app.request('/api/board/layout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        columns: [
          { id: second.id, cardIds: [gamma.id, alpha.id] },
          { id: first.id, cardIds: [beta.id] },
          ...current.columns.slice(2).map((column) => ({ id: column.id, cardIds: [] })),
        ],
      }),
    })
    expect(saved.status).toBe(204)
    const next = await board(app)
    expect(next.columns.map((column) => column.id)).toEqual([second.id, first.id, ...current.columns.slice(2).map((column) => column.id)])
    expect(next.columns[0]?.cards.map((card) => card.id)).toEqual([gamma.id, alpha.id])
    expect(next.columns[1]?.cards.map((card) => card.id)).toEqual([beta.id])
  })
})

function memory() {
  const handle = openDatabase(':memory:')
  handles.push(handle)
  return { app: createApp(handle.db) }
}

async function board(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/board')
  expect(response.status).toBe(200)
  return (await response.json()) as {
    columns: { id: number; name: string; cards: { id: number; priority: string | null; labelIds: number[] }[] }[]
    labels: { id: number }[]
  }
}
