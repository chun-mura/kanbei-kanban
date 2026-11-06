import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import { layoutOf, moveCard, moveColumn, parseDragId } from '../shared/layout'
import type { Board as BoardData, Card } from '../shared/types'
import { SlipFace } from './Card'
import { ColumnLane, NewColumn } from './Column'

type Props = {
  board: BoardData
  reducedMotion: boolean
  onBoard: (board: BoardData) => void
  onLayoutError: (message: string) => void
  saveLayout: (layout: ReturnType<typeof layoutOf>) => Promise<void>
  onOpenCard: (card: Card) => void
  onArchiveCard: (card: Card) => Promise<void>
  onRefresh: () => Promise<void>
}

export function Board({
  board,
  reducedMotion,
  onBoard,
  onLayoutError,
  saveLayout,
  onOpenCard,
  onArchiveCard,
  onRefresh,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<number | null>(null)
  const [stacked, setStacked] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const activeCard = findCard(board, activeId)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const apply = () => setStacked(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function onDragOver(event: DragOverEvent) {
    setOverColumnId(columnUnder(board, event.over ? String(event.over.id) : null))
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    setOverColumnId(null)
    const { active, over } = event
    if (!over) return
    const from = parseDragId(String(active.id))
    const to = parseDragId(String(over.id))
    if (!from || !to) return
    const nextColumns =
      from.kind === 'column' && to.kind === 'column'
        ? moveColumn(board.columns, from.id, to.id)
        : from.kind === 'card'
          ? moveCard(board.columns, from.id, to)
          : board.columns
    const before = JSON.stringify(layoutOf(board.columns))
    const after = layoutOf(nextColumns)
    if (before === JSON.stringify(after)) return
    const previous = board
    onBoard({ ...board, columns: nextColumns })
    try {
      await saveLayout(after)
    } catch (error) {
      onBoard(previous)
      onLayoutError(error instanceof Error ? error.message : '並びを保存できませんでした')
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(event) => void onDragEnd(event)}
      onDragCancel={() => {
        setActiveId(null)
        setOverColumnId(null)
      }}
    >
      <div className="screen">
      <div className="board">
        <SortableContext
          items={board.columns.map((column) => `column:${column.id}`)}
          strategy={stacked ? verticalListSortingStrategy : horizontalListSortingStrategy}
        >
          {board.columns.map((column) => (
            <ColumnLane
              key={column.id}
              column={column}
              labels={board.labels}
              dropTarget={isForeignDrop(board, activeId, overColumnId, column.id)}
              onOpenCard={onOpenCard}
              onArchiveCard={onArchiveCard}
              onRefresh={onRefresh}
            />
          ))}
        </SortableContext>
        <NewColumn onCreated={onRefresh} />
      </div>
      </div>
      <DragOverlay dropAnimation={reducedMotion ? null : { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {activeCard ? <SlipFace card={activeCard} labels={board.labels} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function columnUnder(board: BoardData, overId: string | null) {
  const parsed = overId ? parseDragId(overId) : null
  if (!parsed) return null
  if (parsed.kind === 'column') return parsed.id
  for (const column of board.columns) {
    if (column.cards.some((card) => card.id === parsed.id)) return column.id
  }
  return null
}

function isForeignDrop(board: BoardData, activeId: string | null, overColumnId: number | null, columnId: number) {
  const active = activeId ? parseDragId(activeId) : null
  if (!active || active.kind !== 'card' || overColumnId !== columnId) return false
  const home = board.columns.find((column) => column.cards.some((card) => card.id === active.id))
  return home != null && home.id !== columnId
}

function findCard(board: BoardData, activeId: string | null) {
  const parsed = activeId ? parseDragId(activeId) : null
  if (!parsed || parsed.kind !== 'card') return null
  for (const column of board.columns) {
    const card = column.cards.find((item) => item.id === parsed.id)
    if (card) return card
  }
  return null
}
