import type { Column, Layout } from './types'

export function layoutOf(columns: Column[]): Layout {
  return {
    columns: columns.map((column) => ({
      id: column.id,
      cardIds: column.cards.map((card) => card.id),
    })),
  }
}

export function parseDragId(value: string): { kind: 'column' | 'card'; id: number } | null {
  const match = /^(column|card):(\d+)$/.exec(value)
  if (!match) return null
  return { kind: match[1] as 'column' | 'card', id: Number(match[2]) }
}

export function moveCard(
  columns: Column[],
  cardId: number,
  over: { kind: 'column' | 'card'; id: number },
): Column[] {
  const fromIndex = columns.findIndex((column) => column.cards.some((card) => card.id === cardId))
  if (fromIndex < 0) return columns
  const toIndex =
    over.kind === 'column'
      ? columns.findIndex((column) => column.id === over.id)
      : columns.findIndex((column) => column.cards.some((card) => card.id === over.id))
  if (toIndex < 0) return columns
  if (over.kind === 'card' && over.id === cardId) return columns

  const source = columns[fromIndex]
  if (!source) return columns
  const card = source.cards.find((item) => item.id === cardId)
  if (!card) return columns

  if (fromIndex === toIndex) {
    if (over.kind === 'column') return columns
    const oldIndex = source.cards.findIndex((item) => item.id === cardId)
    const newIndex = source.cards.findIndex((item) => item.id === over.id)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return columns
    return columns.map((column, index) =>
      index === fromIndex ? { ...column, cards: arrayMove(source.cards, oldIndex, newIndex) } : column,
    )
  }

  const target = columns[toIndex]
  if (!target) return columns
  const remaining = source.cards.filter((item) => item.id !== cardId)
  let insertAt = target.cards.length
  if (over.kind === 'card') {
    const index = target.cards.findIndex((item) => item.id === over.id)
    if (index >= 0) insertAt = index
  }
  const nextTarget = [
    ...target.cards.slice(0, insertAt),
    { ...card, columnId: target.id },
    ...target.cards.slice(insertAt),
  ]
  return columns.map((column, index) => {
    if (index === fromIndex) return { ...column, cards: remaining }
    if (index === toIndex) return { ...column, cards: nextTarget }
    return column
  })
}

export function moveColumn(columns: Column[], columnId: number, overColumnId: number): Column[] {
  const fromIndex = columns.findIndex((column) => column.id === columnId)
  const toIndex = columns.findIndex((column) => column.id === overColumnId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return columns
  return arrayMove(columns, fromIndex, toIndex)
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice()
  const [item] = next.splice(from, 1)
  if (item === undefined) return items
  next.splice(to, 0, item)
  return next
}
