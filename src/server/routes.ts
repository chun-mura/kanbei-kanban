import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { isLabelColor, isPriority, type LabelColor, type Layout, type Priority } from '../shared/types'
import type { AppDatabase } from './db'
import { nextPosition } from './db'
import { cardLabels, cards, columns, labels, projects } from './schema'

class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 500,
    message: string,
  ) {
    super(message)
  }
}

const columnNameLimit = 40
const titleLimit = 120
const descriptionLimit = 4000
const labelNameLimit = 20

export function createApp(db: AppDatabase) {
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status)
    console.error(error)
    return c.json({ error: '保存に失敗しました' }, 500)
  })
  app.get('/api/projects', (c) => c.json(db.select().from(projects).orderBy(asc(projects.id)).all()))
  app.post('/api/projects', async (c) => {
    const body = await readJson(c)
    const name = requiredText(body.name, 'プロジェクト名を入れてください', 80, 'プロジェクト名は80字までです')
    const project = db.transaction((tx) => {
      const created = tx.insert(projects).values({ name }).returning().get()
      tx.insert(columns).values(['未着手', '進行中', '完了'].map((name, position) => ({ name, position, projectId: created.id }))).run()
      return created
    })
    return c.json(project, 201)
  })
  app.patch('/api/projects/:projectId', async (c) => {
    const id = idParam(c.req.param('projectId'))
    const body = await readJson(c)
    const name = requiredText(body.name, 'プロジェクト名を入れてください', 80, 'プロジェクト名は80字までです')
    const updated = db.update(projects).set({ name }).where(eq(projects.id, id)).returning().get()
    if (!updated) throw new HttpError(404, 'そのプロジェクトは見当たりません')
    return c.json(updated)
  })
  app.all('/api/projects/:projectId/*', (c) => {
    const projectId = idParam(c.req.param('projectId'))
    if (!db.select().from(projects).where(eq(projects.id, projectId)).get()) {
      throw new HttpError(404, 'そのプロジェクトは見当たりません')
    }
    const url = new URL(c.req.url)
    url.pathname = url.pathname.replace(/^\/api\/projects\/[^/]+/, '/api')
    return createBoardApp(db, projectId).fetch(new Request(url, c.req.raw))
  })
  app.route('/', createBoardApp(db, 1))
  return app
}

function createBoardApp(db: AppDatabase, projectId: number) {
  const app = new Hono()

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status)
    console.error(error)
    return c.json({ error: '保存に失敗しました' }, 500)
  })

  app.get('/api/board', (c) => c.json(readBoard(db, projectId)))

  app.get('/api/archive', (c) => c.json(readArchive(db, projectId)))

  app.post('/api/columns', async (c) => {
    const body = await readJson(c)
    const name = requiredText(body.name, '列の名前を入れてください', columnNameLimit, '列の名前は40字までです')
    const position =
      db
        .select({ position: columns.position })
        .from(columns)
        .where(eq(columns.projectId, projectId))
        .all()
        .reduce((max, row) => Math.max(max, row.position), -1) + 1
    const created = db.insert(columns).values({ name, position, projectId }).returning().get()
    if (!created) throw new HttpError(500, '保存に失敗しました')
    return c.json({ id: created.id, name: created.name, position: created.position, cards: [] }, 201)
  })

  app.patch('/api/columns/:id', async (c) => {
    const id = idParam(c.req.param('id'))
    const body = await readJson(c)
    const name = requiredText(body.name, '列の名前を入れてください', columnNameLimit, '列の名前は40字までです')
    const updated = db.update(columns).set({ name }).where(and(eq(columns.id, id), eq(columns.projectId, projectId))).returning().get()
    if (!updated) throw new HttpError(404, 'その列は見当たりません')
    return c.json({ id: updated.id, name: updated.name, position: updated.position })
  })

  app.delete('/api/columns/:id', (c) => {
    const id = idParam(c.req.param('id'))
    const column = db.select({ id: columns.id }).from(columns).where(and(eq(columns.id, id), eq(columns.projectId, projectId))).get()
    if (!column) throw new HttpError(404, 'その列は見当たりません')
    const remaining = db.select({ id: cards.id }).from(cards).where(eq(cards.columnId, id)).get()
    if (remaining) throw new HttpError(409, 'この列にはカードが残っています')
    db.delete(columns).where(and(eq(columns.id, id), eq(columns.projectId, projectId))).run()
    return c.body(null, 204)
  })

  app.post('/api/cards', async (c) => {
    const body = await readJson(c)
    const columnId = positiveId(body.columnId, 'その列は見当たりません')
    const title = requiredText(body.title, 'タイトルを入れてください', titleLimit, 'タイトルは120字までです')
    const description = optionalText(body.description, descriptionLimit)
    const priority = body.priority === undefined ? null : parsePriority(body.priority)
    const labelIds = body.labelIds === undefined ? [] : parseIdList(body.labelIds)
    assertColumn(db, columnId, projectId)
    assertLabels(db, labelIds, projectId)
    const position = nextPosition(db, columnId)
    const created = db.transaction((tx) => {
      const row = tx
        .insert(cards)
        .values({
          columnId,
          title,
          description,
          priority,
          position,
          archivedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .returning()
        .get()
      if (!row) throw new HttpError(500, '保存に失敗しました')
      replaceLabels(tx, row.id, labelIds)
      return row
    })
    return c.json(presentCard(created, labelIds), 201)
  })

  app.patch('/api/cards/:id', async (c) => {
    const id = idParam(c.req.param('id'))
    const body = await readJson(c)
    const current = db.select().from(cards).where(and(eq(cards.id, id), cardsInProject(db, projectId))).get()
    if (!current || current.archivedAt !== null) throw new HttpError(404, 'そのカードは見当たりません')
    const title =
      body.title === undefined
        ? current.title
        : requiredText(body.title, 'タイトルを入れてください', titleLimit, 'タイトルは120字までです')
    const description = body.description === undefined ? current.description : optionalText(body.description, descriptionLimit)
    const priority = body.priority === undefined ? asPriority(current.priority) : parsePriority(body.priority)
    const labelIds = body.labelIds === undefined ? labelIdsFor(db, id) : parseIdList(body.labelIds)
    assertLabels(db, labelIds, projectId)
    const updated = db.transaction((tx) => {
      const row = tx
        .update(cards)
        .set({ title, description, priority, updatedAt: Date.now() })
        .where(and(eq(cards.id, id), cardsInProject(db, projectId)))
        .returning()
        .get()
      if (!row) throw new HttpError(404, 'そのカードは見当たりません')
      if (body.labelIds !== undefined) replaceLabels(tx, id, labelIds)
      return row
    })
    return c.json(presentCard(updated, labelIds))
  })

  app.post('/api/cards/:id/archive', (c) => {
    const id = idParam(c.req.param('id'))
    const updated = db
      .update(cards)
      .set({ archivedAt: Date.now(), updatedAt: Date.now() })
      .where(and(eq(cards.id, id), cardsInProject(db, projectId), isNull(cards.archivedAt)))
      .returning()
      .get()
    if (!updated) throw new HttpError(404, 'そのカードは見当たりません')
    return c.body(null, 204)
  })

  app.post('/api/cards/:id/restore', (c) => {
    const id = idParam(c.req.param('id'))
    const current = db.select().from(cards).where(and(eq(cards.id, id), cardsInProject(db, projectId))).get()
    if (!current || current.archivedAt === null) throw new HttpError(404, 'そのカードは見当たりません')
    db.update(cards)
      .set({
        archivedAt: null,
        position: nextPosition(db, current.columnId),
        updatedAt: Date.now(),
      })
      .where(and(eq(cards.id, id), cardsInProject(db, projectId)))
      .run()
    return c.body(null, 204)
  })

  app.delete('/api/cards/:id', (c) => {
    const id = idParam(c.req.param('id'))
    const removed = db.delete(cards).where(and(eq(cards.id, id), cardsInProject(db, projectId))).returning().get()
    if (!removed) throw new HttpError(404, 'そのカードは見当たりません')
    return c.body(null, 204)
  })

  app.post('/api/labels', async (c) => {
    const body = await readJson(c)
    const name = requiredText(body.name, 'ラベルの名前を入れてください', labelNameLimit, 'ラベルの名前は20字までです')
    if (!isLabelColor(body.color)) throw new HttpError(400, '色は決まった6色から選んでください')
    const created = db.insert(labels).values({ name, color: body.color, projectId }).returning().get()
    if (!created) throw new HttpError(500, '保存に失敗しました')
    return c.json({ id: created.id, name: created.name, color: body.color }, 201)
  })

  app.delete('/api/labels/:id', (c) => {
    const id = idParam(c.req.param('id'))
    const removed = db.delete(labels).where(and(eq(labels.id, id), eq(labels.projectId, projectId))).returning().get()
    if (!removed) throw new HttpError(404, 'そのラベルは見当たりません')
    return c.body(null, 204)
  })

  app.post('/api/board/layout', async (c) => {
    const body = await readJson(c)
    const layout = parseLayout(body)
    applyLayout(db, layout, projectId)
    return c.body(null, 204)
  })

  return app
}

function cardsInProject(db: AppDatabase, projectId: number) {
  return inArray(cards.columnId, db.select({ id: columns.id }).from(columns).where(eq(columns.projectId, projectId)))
}

function readBoard(db: AppDatabase, projectId: number) {
  const columnRows = db.select().from(columns).where(eq(columns.projectId, projectId)).orderBy(asc(columns.position), asc(columns.id)).all()
  const cardRows = db.select().from(cards).where(and(isNull(cards.archivedAt), cardsInProject(db, projectId))).orderBy(asc(cards.position), asc(cards.id)).all()
  const links = labelMap(
    db,
    cardRows.map((card) => card.id),
  )
  return {
    columns: columnRows.map((column) => ({
      id: column.id,
      name: column.name,
      position: column.position,
      cards: cardRows
        .filter((card) => card.columnId === column.id)
        .map((card) => presentCard(card, links.get(card.id) ?? [])),
    })),
    labels: readLabels(db, projectId),
  }
}

function readArchive(db: AppDatabase, projectId: number) {
  const rows = db
    .select({
      id: cards.id,
      columnId: cards.columnId,
      columnName: columns.name,
      title: cards.title,
      description: cards.description,
      priority: cards.priority,
      archivedAt: cards.archivedAt,
    })
    .from(cards)
    .innerJoin(columns, eq(cards.columnId, columns.id))
    .where(and(isNotNull(cards.archivedAt), eq(columns.projectId, projectId)))
    .orderBy(desc(cards.archivedAt), desc(cards.id))
    .all()
  const links = labelMap(
    db,
    rows.map((card) => card.id),
  )
  return {
    cards: rows.map((card) => ({
      id: card.id,
      columnId: card.columnId,
      columnName: card.columnName,
      title: card.title,
      description: card.description,
      priority: asPriority(card.priority),
      archivedAt: card.archivedAt ?? 0,
      labelIds: links.get(card.id) ?? [],
    })),
    labels: readLabels(db, projectId),
  }
}

function applyLayout(db: AppDatabase, layout: Layout, projectId: number) {
  const columnRows = db.select({ id: columns.id }).from(columns).where(eq(columns.projectId, projectId)).all()
  const activeRows = db.select({ id: cards.id }).from(cards).where(and(isNull(cards.archivedAt), cardsInProject(db, projectId))).all()
  const expectedColumns = new Set(columnRows.map((column) => column.id))
  const givenColumns = layout.columns.map((column) => column.id)
  if (new Set(givenColumns).size !== givenColumns.length || givenColumns.length !== expectedColumns.size || givenColumns.some((id) => !expectedColumns.has(id))) {
    throw new HttpError(400, '並びがボードと一致しません')
  }
  const expectedCards = new Set(activeRows.map((card) => card.id))
  const seen = new Set<number>()
  for (const column of layout.columns) {
    for (const cardId of column.cardIds) {
      if (seen.has(cardId) || !expectedCards.has(cardId)) throw new HttpError(400, '並びがボードと一致しません')
      seen.add(cardId)
    }
  }
  if (seen.size !== expectedCards.size) throw new HttpError(400, '並びがボードと一致しません')
  const now = Date.now()
  db.transaction((tx) => {
    layout.columns.forEach((column, columnIndex) => {
      tx.update(columns).set({ position: columnIndex }).where(eq(columns.id, column.id)).run()
      column.cardIds.forEach((cardId, cardIndex) => {
        tx.update(cards)
          .set({ columnId: column.id, position: cardIndex, updatedAt: now })
          .where(eq(cards.id, cardId))
          .run()
      })
    })
  })
}

function presentCard(
  card: {
    id: number
    columnId: number
    title: string
    description: string
    priority: string | null
    position: number
  },
  labelIds: number[],
) {
  return {
    id: card.id,
    columnId: card.columnId,
    title: card.title,
    description: card.description,
    priority: asPriority(card.priority),
    position: card.position,
    labelIds,
  }
}

function readLabels(db: AppDatabase, projectId: number) {
  return db
    .select()
    .from(labels)
    .where(eq(labels.projectId, projectId))
    .orderBy(asc(labels.id))
    .all()
    .map((label) => ({ id: label.id, name: label.name, color: asColor(label.color) }))
}

function labelMap(db: AppDatabase, cardIds: number[]) {
  const map = new Map<number, number[]>()
  if (cardIds.length === 0) return map
  const rows = db.select().from(cardLabels).where(inArray(cardLabels.cardId, cardIds)).all()
  for (const row of rows) {
    const list = map.get(row.cardId) ?? []
    list.push(row.labelId)
    map.set(row.cardId, list)
  }
  return map
}

function labelIdsFor(db: AppDatabase, cardId: number) {
  return db
    .select({ labelId: cardLabels.labelId })
    .from(cardLabels)
    .where(eq(cardLabels.cardId, cardId))
    .all()
    .map((row) => row.labelId)
}

function replaceLabels(db: AppDatabase, cardId: number, labelIds: number[]) {
  db.delete(cardLabels).where(eq(cardLabels.cardId, cardId)).run()
  if (labelIds.length === 0) return
  db.insert(cardLabels)
    .values(labelIds.map((labelId) => ({ cardId, labelId })))
    .run()
}

function assertColumn(db: AppDatabase, columnId: number, projectId: number) {
  const column = db.select({ id: columns.id }).from(columns).where(and(eq(columns.id, columnId), eq(columns.projectId, projectId))).get()
  if (!column) throw new HttpError(404, 'その列は見当たりません')
}

function assertLabels(db: AppDatabase, labelIds: number[], projectId: number) {
  if (labelIds.length === 0) return
  const found = db.select({ id: labels.id }).from(labels).where(and(inArray(labels.id, labelIds), eq(labels.projectId, projectId))).all()
  if (found.length !== labelIds.length) throw new HttpError(400, 'そのラベルは見当たりません')
}

function parseLayout(body: Record<string, unknown>): Layout {
  if (!Array.isArray(body.columns)) throw new HttpError(400, '並びがボードと一致しません')
  return {
    columns: body.columns.map((entry) => {
      if (!entry || typeof entry !== 'object') throw new HttpError(400, '並びがボードと一致しません')
      const column = entry as Record<string, unknown>
      return {
        id: positiveId(column.id, '並びがボードと一致しません'),
        cardIds: parseIdList(column.cardIds, '並びがボードと一致しません'),
      }
    }),
  }
}

async function readJson(c: { req: { json: () => Promise<unknown> } }) {
  let value: unknown
  try {
    value = await c.req.json()
  } catch {
    throw new HttpError(400, 'JSONとして読めません')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'JSONとして読めません')
  return value as Record<string, unknown>
}

function idParam(raw: string) {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, '見当たりません')
  return id
}

function positiveId(value: unknown, message: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new HttpError(400, message)
  return value
}

function requiredText(value: unknown, emptyMessage: string, limit: number, limitMessage: string) {
  if (typeof value !== 'string') throw new HttpError(400, emptyMessage)
  const text = value.trim()
  if (!text) throw new HttpError(400, emptyMessage)
  if ([...text].length > limit) throw new HttpError(400, limitMessage)
  return text
}

function optionalText(value: unknown, limit: number) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new HttpError(400, 'メモは文字で入れてください')
  const text = value.trim()
  if ([...text].length > limit) throw new HttpError(400, 'メモは4000字までです')
  return text
}

function parsePriority(value: unknown): Priority | null {
  if (value === null) return null
  if (!isPriority(value)) throw new HttpError(400, '優先度は未設定・低・中・高のいずれかです')
  return value
}

function parseIdList(value: unknown, message = 'ラベルの指定が不正です') {
  if (!Array.isArray(value)) throw new HttpError(400, message)
  if (value.length > 20) throw new HttpError(400, message)
  const ids = value.map((item) => positiveId(item, message))
  return [...new Set(ids)]
}

function asPriority(value: string | null): Priority | null {
  if (value === null) return null
  if (!isPriority(value)) throw new HttpError(500, '保存に失敗しました')
  return value
}

function asColor(value: string): LabelColor {
  if (!isLabelColor(value)) throw new HttpError(500, '保存に失敗しました')
  return value
}
