import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const columns = sqliteTable('columns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
})

export const cards = sqliteTable('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  columnId: integer('column_id')
    .notNull()
    .references(() => columns.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  priority: text('priority'),
  position: integer('position').notNull(),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const labels = sqliteTable('labels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color').notNull(),
})

export const cardLabels = sqliteTable(
  'card_labels',
  {
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    labelId: integer('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.cardId, table.labelId] })],
)
