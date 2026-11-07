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
    <li
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
      <button type="button" className="slip-archive" disabled={pending} aria-label={pending ? `${card.title}をアーカイブしています` : `${card.title}をアーカイブ`} title="アーカイブ" onClick={() => void archive()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="5" rx="1" />
          <path d="M5 8v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
        </svg>
        {pending ? <span className="visually-hidden" role="status">アーカイブしています…</span> : null}
      </button>
    </li>
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
      <span className="slip-heading">
        <span className={`seal${card.priority ? ` seal-${card.priority}` : ' seal-none'}`} aria-label={card.priority ? `優先度：${PRIORITY_LABEL[card.priority]}` : undefined} aria-hidden={card.priority ? undefined : true}>
          {card.priority ? PRIORITY_LABEL[card.priority] : '—'}
        </span>
        <span className="slip-title">{card.title}</span>
      </span>
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
    </>
  )
}
