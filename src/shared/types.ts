export const PRIORITIES = ['low', 'mid', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]

export const LABEL_COLORS = ['sumi', 'shu', 'ai', 'moegi', 'yamabuki', 'fuji'] as const
export type LabelColor = (typeof LABEL_COLORS)[number]

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: '低',
  mid: '中',
  high: '高',
}

export const COLOR_LABEL: Record<LabelColor, string> = {
  sumi: '墨',
  shu: '朱',
  ai: '藍',
  moegi: '萌黄',
  yamabuki: '山吹',
  fuji: '藤',
}

export type Label = {
  id: number
  name: string
  color: LabelColor
}

export type Card = {
  id: number
  columnId: number
  title: string
  description: string
  priority: Priority | null
  position: number
  labelIds: number[]
}

export type Column = {
  id: number
  name: string
  position: number
  cards: Card[]
}

export type Board = {
  columns: Column[]
  labels: Label[]
}

export type ArchiveCard = {
  id: number
  columnId: number
  columnName: string
  title: string
  description: string
  priority: Priority | null
  archivedAt: number
  labelIds: number[]
}

export type Archive = {
  cards: ArchiveCard[]
  labels: Label[]
}

export type Layout = {
  columns: { id: number; cardIds: number[] }[]
}

export function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'mid' || value === 'high'
}

export function isLabelColor(value: unknown): value is LabelColor {
  return LABEL_COLORS.some((color) => color === value)
}
