import Database from 'better-sqlite3'
import { and, eq, isNull } from 'drizzle-orm'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>

const schemaSql = readFileSync(fileURLToPath(new URL('../../drizzle/0000_init.sql', import.meta.url)), 'utf8')

const defaultColumns = ['未着手', '進行中', '完了']

export function openDatabase(filename: string) {
  const sqlite = new Database(filename)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(schemaSql)
  const db = drizzle(sqlite, { schema })
  seedColumns(db)
  return {
    db,
    close() {
      sqlite.close()
    },
  }
}

function seedColumns(db: AppDatabase) {
  const existing = db.select({ id: schema.columns.id }).from(schema.columns).all()
  if (existing.length > 0) return
  db.insert(schema.columns)
    .values(defaultColumns.map((name, position) => ({ name, position })))
    .run()
}

export function nextPosition(db: AppDatabase, columnId: number) {
  const rows = db
    .select({ position: schema.cards.position })
    .from(schema.cards)
    .where(and(eq(schema.cards.columnId, columnId), isNull(schema.cards.archivedAt)))
    .all()
  return rows.reduce((max, row) => Math.max(max, row.position), -1) + 1
}
