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
  const db = drizzle(sqlite, { schema })
  try {
    sqlite.pragma('journal_mode = WAL')
    // SQLite cannot add a REFERENCES column with a non-null default while
    // foreign keys are enabled. This connection is not exposed until migration finishes.
    sqlite.pragma('foreign_keys = OFF')
    sqlite.transaction(() => {
      sqlite.exec(schemaSql)
      sqlite.exec(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )`)
      const inserted = sqlite.prepare("INSERT OR IGNORE INTO projects (id, name) VALUES (1, '既存のプロジェクト')").run()
      for (const table of ['columns', 'labels']) {
        const fields = sqlite.pragma(`table_info(${table})`) as { name: string }[]
        if (!fields.some((field) => field.name === 'project_id')) {
          sqlite.exec(`ALTER TABLE ${table} ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id)`)
        }
        sqlite.exec(`CREATE INDEX IF NOT EXISTS ${table}_project_idx ON ${table}(project_id)`)
      }
      if (inserted.changes > 0) seedColumns(db)
    })()
    sqlite.pragma('foreign_keys = ON')
  } catch (error) {
    sqlite.close()
    throw error
  }
  return {
    db,
    close() {
      sqlite.close()
    },
  }
}

function seedColumns(db: AppDatabase) {
  const existing = db.select({ id: schema.columns.id }).from(schema.columns).where(eq(schema.columns.projectId, 1)).all()
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
