import Database from 'better-sqlite3'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { openDatabase } from './db'
import { createApp } from './routes'
import type { Archive, Board, Project } from '../shared/types'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

function setup() {
  const handle = openDatabase(':memory:')
  cleanups.push(() => handle.close())
  return createApp(handle.db)
}
function post(app: ReturnType<typeof createApp>, path: string, body: unknown, method = 'POST') {
  return app.request(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
async function createProject(app: ReturnType<typeof createApp>) {
  const response = await post(app, '/api/projects', { name: '  新しい仕事  ' })
  expect(response.status).toBe(201)
  return await response.json() as Project
}

it('creates an independent project with three empty columns and validates its name', async () => {
  const app = setup()
  expect(await (await app.request('/api/projects')).json()).toEqual([{ id: 1, name: '既存のプロジェクト' }])
  for (const name of ['', '   ', 'a'.repeat(81), 123, null]) {
    expect((await post(app, '/api/projects', { name })).status).toBe(400)
  }
  const project = await createProject(app)
  expect(project.name).toBe('新しい仕事')
  const board = await (await app.request(`/api/projects/${project.id}/board`)).json() as Board
  expect(board.columns.map(c => c.name)).toEqual(['未着手', '進行中', '完了'])
  expect(board.columns.flatMap(c => c.cards)).toEqual([])
  expect(board.labels).toEqual([])
  expect((await app.request('/api/projects/9999/board')).status).toBe(404)
  expect((await app.request('/api/projects/invalid/board')).status).toBe(404)
})

it('isolates cards, columns, labels, archive and layout including writes with foreign IDs', async () => {
  const app = setup()
  const original = await (await app.request('/api/board')).json() as Board
  const column = original.columns[0]!
  const label = await (await post(app, '/api/labels', { name: '仕事', color: 'shu' })).json() as { id: number }
  const card = await (await post(app, '/api/cards', { columnId: column.id, title: '元の仕事', labelIds: [label.id] })).json() as { id: number }
  const project = await createProject(app)
  const base = `/api/projects/${project.id}`
  const next = await (await app.request(`${base}/board`)).json() as Board
  const ownColumn = next.columns[0]!
  expect((await post(app, `${base}/cards`, { columnId: column.id, title: '他の列' })).status).toBe(404)
  expect((await post(app, `${base}/cards`, { columnId: ownColumn.id, title: '他のラベル', labelIds: [label.id] })).status).toBe(400)
  for (const [path, method, body] of [
    [`cards/${card.id}`, 'PATCH', { title: '書き換え' }],
    [`cards/${card.id}/archive`, 'POST', {}],
    [`cards/${card.id}/restore`, 'POST', {}],
    [`cards/${card.id}`, 'DELETE', {}],
    [`columns/${column.id}`, 'PATCH', { name: '書き換え' }],
    [`columns/${column.id}`, 'DELETE', {}],
    [`labels/${label.id}`, 'DELETE', {}],
  ] as const) expect((await post(app, `${base}/${path}`, body, method)).status).toBe(404)
  expect((await post(app, `${base}/board/layout`, { columns: original.columns.map(c => ({ id: c.id, cardIds: c.id === column.id ? [card.id] : [] })) })).status).toBe(400)
  const ownCard = await (await post(app, `${base}/cards`, { columnId: ownColumn.id, title: '新しい仕事' })).json() as { id: number }
  expect((await post(app, `${base}/board/layout`, { columns: next.columns.map(c => ({ id: c.id, cardIds: c.id === ownColumn.id ? [ownCard.id] : [] })) })).status).toBe(204)
  expect((await post(app, `${base}/cards/${ownCard.id}/archive`, {})).status).toBe(204)
  expect(((await (await app.request(`${base}/archive`)).json()) as Archive).cards).toHaveLength(1)
  expect(((await (await app.request('/api/archive')).json()) as Archive).cards).toHaveLength(0)
  expect((await post(app, `${base}/cards/${ownCard.id}/restore`, {})).status).toBe(204)
  expect(await (await app.request('/api/board')).json()).toMatchObject({ columns: [{ cards: [{ title: '元の仕事', labelIds: [label.id] }] }, {}, {}] })
})

it('migrates an old database preserving all data and remains stable after reopening', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kanbei-projects-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'old.db')
  const old = new Database(path)
  old.exec(readFileSync(new URL('../../drizzle/0000_init.sql', import.meta.url), 'utf8'))
  old.exec(`INSERT INTO columns VALUES (10, '独自の列', 0);
    INSERT INTO cards VALUES (20, 10, '既存カード', 'メモ', 'high', 0, 123, 1, 2);
    INSERT INTO labels VALUES (30, '既存ラベル', 'ai');
    INSERT INTO card_labels VALUES (20, 30);`)
  old.close()
  for (let i = 0; i < 2; i++) {
    const handle = openDatabase(path)
    try {
      const app = createApp(handle.db)
      expect(await (await app.request('/api/projects')).json()).toEqual([{ id: 1, name: '既存のプロジェクト' }])
      const board = await (await app.request('/api/projects/1/board')).json() as Board
      expect(board.columns).toEqual([{ id: 10, name: '独自の列', position: 0, cards: [] }])
      expect(board.labels).toEqual([{ id: 30, name: '既存ラベル', color: 'ai' }])
      expect(await (await app.request('/api/projects/1/archive')).json()).toMatchObject({ cards: [{ id: 20, title: '既存カード', description: 'メモ', priority: 'high', archivedAt: 123, labelIds: [30] }] })
    } finally { handle.close() }
  }
})

it('keeps project data and intentionally empty boards after reopening', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kanbei-projects-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'projects.db')
  const first = openDatabase(path)
  let project: Project
  try {
    const app = createApp(first.db)
    project = await createProject(app)
    const original = await (await app.request('/api/board')).json() as Board
    for (const column of original.columns) {
      expect((await app.request(`/api/columns/${column.id}`, { method: 'DELETE' })).status).toBe(204)
    }
    const own = await (await app.request(`/api/projects/${project.id}/board`)).json() as Board
    const base = `/api/projects/${project.id}`
    const label = await (await post(app, `${base}/labels`, { name: '独立', color: 'ai' })).json() as { id: number }
    expect((await post(app, `${base}/cards`, { columnId: own.columns[0]!.id, title: '保存されたカード', labelIds: [label.id] })).status).toBe(201)
  } finally { first.close() }
  const second = openDatabase(path)
  try {
    const app = createApp(second.db)
    expect((await (await app.request('/api/board')).json() as Board).columns).toEqual([])
    expect(await (await app.request('/api/projects')).json()).toHaveLength(2)
    const own = await (await app.request(`/api/projects/${project.id}/board`)).json() as Board
    expect(own.columns).toHaveLength(3)
    expect(own.columns[0]!.cards[0]!.title).toBe('保存されたカード')
    expect(own.labels[0]!.name).toBe('独立')
  } finally { second.close() }
})

it('renames the selected project without changing its board or other projects', async () => {
  const app = setup()
  const project = await createProject(app)
  const before = await (await app.request(`/api/projects/${project.id}/board`)).json()
  const response = await post(app, `/api/projects/${project.id}`, { name: '  改名した仕事  ' }, 'PATCH')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ id: project.id, name: '改名した仕事' })
  expect(await (await app.request('/api/projects')).json()).toEqual([
    { id: 1, name: '既存のプロジェクト' },
    { id: project.id, name: '改名した仕事' },
  ])
  expect(await (await app.request(`/api/projects/${project.id}/board`)).json()).toEqual(before)
  expect((await post(app, '/api/projects/1', { name: '自分の仕事' }, 'PATCH')).status).toBe(200)
})

it('rejects invalid project renames without changing saved names', async () => {
  const app = setup()
  for (const name of ['', '   ', 'a'.repeat(81), 123, null]) {
    expect((await post(app, '/api/projects/1', { name }, 'PATCH')).status).toBe(400)
  }
  for (const id of ['99999', 'invalid', '0']) {
    expect((await post(app, `/api/projects/${id}`, { name: '変更' }, 'PATCH')).status).toBe(404)
  }
  expect(await (await app.request('/api/projects')).json()).toEqual([{ id: 1, name: '既存のプロジェクト' }])
})
