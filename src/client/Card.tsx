import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRef, useState, type CSSProperties } from 'react'
import { PRIORITY_LABEL, type Card, type Label } from '../shared/types'

type SlipProps = {
  card: Card
  labels: Label[]
  onOpen: () => void
  onArchive: () => Promise<void>
}

export function SortableSlip({ card, labels, onOpen, onArchive }: SlipProps) {
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  async function archive() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    try { await onArchive() }
    finally { busy.current = false; setPending(false) }
  }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `card:${card.id}` })
  const style: CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
  }
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'slip is-dragging' : 'slip'}
      data-priority={card.priority ?? 'none'}
    >
      <button type="button" className="slip-handle" aria-label={`${card.title}を並び替える`} {...attributes} {...listeners}>
        <span />
        <span />
        <span />
      </button>
      <button type="button" className="slip-open" disabled={pending} onClick={onOpen}>
        <SlipBody card={card} labels={labels} />
      </button>
      <button type="button" className="slip-archive" disabled={pending} aria-label={`${card.title}をアーカイブ`} onClick={() => void archive()}>
        {pending ? '移動しています…' : 'アーカイブ'}
      </button>
    </article>
  )
}

export function SlipFace({ card, labels, overlay = false }: { card: Card; labels: Label[]; overlay?: boolean }) {
  return (
    <div className={overlay ? 'slip overlay' : 'slip'} data-priority={card.priority ?? 'none'}>
      <SlipBody card={card} labels={labels} />
    </div>
  )
}

function SlipBody({ card, labels }: { card: Card; labels: Label[] }) {
  const note = card.description.split('\n').find((line) => line.trim()) ?? ''
  const marks = labels.filter((label) => card.labelIds.includes(label.id))
  return (
    <>
      <span className="slip-title">{card.title}</span>
      {note ? <span className="slip-note">{note}</span> : null}
      {marks.length > 0 ? (
        <span className="marks">
          {marks.map((label) => (
            <span key={label.id} className={`mark mark-${label.color}`}>
              {label.name}
            </span>
          ))}
        </span>
      ) : null}
      {card.priority ? <span className={`seal seal-${card.priority}`} aria-label={`優先度：${PRIORITY_LABEL[card.priority]}`}>{PRIORITY_LABEL[card.priority]}</span> : null}
    </>
  )
}
