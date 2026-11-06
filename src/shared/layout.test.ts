import { describe, expect, it } from 'vitest'
import { layoutOf, moveCard, moveColumn } from './layout'
import type { Column } from './types'

const columns: Column[] = [
  {
    id: 1,
    name: '未着手',
    position: 0,
    cards: [
      card(1, 1),
      card(2, 1),
    ],
  },
  { id: 2, name: '進行中', position: 1, cards: [card(3, 2)] },
  { id: 3, name: '完了', position: 2, cards: [] },
]

describe('layout', () => {
  it('moves a card in front of another card in a different column', () => {
    const next = moveCard(columns, 2, { kind: 'card', id: 3 })
    expect(layoutOf(next)).toEqual({
      columns: [
        { id: 1, cardIds: [1] },
        { id: 2, cardIds: [2, 3] },
        { id: 3, cardIds: [] },
      ],
    })
  })

  it('appends a card when it is dropped on an empty column', () => {
    const next = moveCard(columns, 1, { kind: 'column', id: 3 })
    expect(next[2]?.cards.map((item) => item.id)).toEqual([1])
    expect(next[0]?.cards.map((item) => item.id)).toEqual([2])
  })

  it('reorders cards inside one column and columns across the board', () => {
    const reordered = moveCard(columns, 2, { kind: 'card', id: 1 })
    expect(reordered[0]?.cards.map((item) => item.id)).toEqual([2, 1])
    const shifted = moveColumn(columns, 3, 1)
    expect(shifted.map((column) => column.id)).toEqual([3, 1, 2])
  })
})

function card(id: number, columnId: number) {
  return {
    id,
    columnId,
    title: `札${id}`,
    description: '',
    priority: null,
    position: id,
    labelIds: [],
  }
}
