import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Card, Column, Label } from '../shared/types'
import { useApi } from './ProjectContext'
import { SortableSlip } from './Card'

type Props = {
  column: Column
  labels: Label[]
  dropTarget: boolean
  onOpenCard: (card: Card) => void
  onArchiveCard: (card: Card) => Promise<void>
  onRefresh: () => Promise<void>
}

export function ColumnLane({ column, labels, dropTarget, onOpenCard, onArchiveCard, onRefresh }: Props) {
  const api = useApi()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(column.name)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cancelRename = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `column:${column.id}`,
  })

  useEffect(() => {
    setDraft(column.name)
  }, [column.name])

  useEffect(() => {
    setError(null)
    setConfirmDelete(false)
  }, [column.cards.map((card) => card.id).join(',')])

  async function commitRename(value: string) {
    const name = value.trim()
    if (!name || name === column.name) {
      setDraft(column.name)
      setEditing(false)
      return
    }
    try {
      await api.renameColumn(column.id, name)
      setEditing(false)
      setError(null)
      await onRefresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '列の名前を保存できませんでした')
    }
  }

  async function remove() {
    try {
      await api.deleteColumn(column.id)
      setError(null)
      await onRefresh()
    } catch (caught) {
      setConfirmDelete(false)
      setError(caught instanceof Error ? caught.message : '列を削除できませんでした')
    }
  }

  const scrollAfterCreate = useRef(false)

  useEffect(() => {
    if (!scrollAfterCreate.current) return
    scrollAfterCreate.current = false
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [column.cards])

  async function created() {
    scrollAfterCreate.current = true
    try {
      await onRefresh()
    } catch (error) {
      scrollAfterCreate.current = false
      throw error
    }
  }

  return (
    <section
      ref={setNodeRef}
      className={['well', isDragging ? 'is-dragging' : '', dropTarget ? 'is-over' : ''].filter(Boolean).join(' ')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <header className="well-head">
        <button type="button" className="grip" aria-label={`${column.name}の列を並び替える`} {...attributes} {...listeners}>
          <span />
          <span />
          <span />
        </button>
        {editing ? (
          <input
            className="rename"
            aria-label="列の名前"
            value={draft}
            maxLength={40}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => {
              if (cancelRename.current) {
                cancelRename.current = false
                return
              }
              void commitRename(event.currentTarget.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault()
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelRename.current = true
                setDraft(column.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button type="button" className="well-name" title="列名を変更" aria-label={`${column.name}：列名を変更`} onClick={() => setEditing(true)}>
            {column.name}
          </button>
        )}
        <span className="well-count" aria-label={`${column.cards.length}件のカード`}>{column.cards.length}</span>
        {confirmDelete ? (
          <span className="confirm-delete">
            <button type="button" className="text-button" onClick={() => void remove()}>
              消す
            </button>
            <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>
              やめる
            </button>
          </span>
        ) : (
          <button type="button" className="text-button" disabled={column.cards.length > 0} title={column.cards.length > 0 ? 'カードを移動またはアーカイブすると列を削除できます' : '空の列を削除'} aria-label={`${column.name}の列を削除`} onClick={() => setConfirmDelete(true)}>
            削除
          </button>
        )}
      </header>
      {error ? (
        <p className="well-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="well-main">
        <ul className="well-slips" ref={listRef} aria-label={`${column.name}のカード`}>
          <SortableContext items={column.cards.map((card) => `card:${card.id}`)} strategy={verticalListSortingStrategy}>
            {column.cards.map((card) => (
              <SortableSlip
                key={card.id}
                card={card}
                labels={labels}
                onOpen={() => onOpenCard(card)}
                onArchive={() => onArchiveCard(card).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'アーカイブできませんでした'))}
              />
            ))}
          </SortableContext>
        </ul>
        <Composer columnId={column.id} hasCards={column.cards.length > 0} onCreated={created} />
      </div>
    </section>
  )
}

export function NewColumn({ onCreated }: { onCreated: () => Promise<void> }) {
  const api = useApi()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const next = name.trim()
    if (!next) {
      setError('列の名前を書いてください')
      return
    }
    setPending(true)
    setError(null)
    try {
      await api.createColumn(next)
      setName('')
      await onCreated()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '列を追加できませんでした')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="well-new" onKeyDown={(event) => {
      if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
    }} onSubmit={(event) => void submit(event)}>
      <h2 className="new-column-title">新しい列</h2>
      <label>
        <span className="visually-hidden">新しい列の名前</span>
        <input
          aria-label="新しい列の名前"
          placeholder="例：確認待ち"
          disabled={pending}
          value={name}
          maxLength={40}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? '追加しています…' : '＋ 列を追加'}
      </button>
      {error ? (
        <p className="well-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}

function Composer({
  columnId,
  hasCards,
  onCreated,
}: {
  columnId: number
  hasCards: boolean
  onCreated: () => Promise<void>
}) {
  const api = useApi()
  const [open, setOpen] = useState(!hasCards)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const focusOnOpen = useRef(false)

  useEffect(() => {
    if (!hasCards) setOpen(true)
  }, [hasCards])

  useEffect(() => {
    if (!open || !focusOnOpen.current) return
    focusOnOpen.current = false
    inputRef.current?.focus()
  }, [open])

  function close() {
    if (!hasCards) return
    setOpen(false)
    setTitle('')
    setError(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const next = title.trim()
    if (!next) {
      setError('タイトルを入力してください')
      inputRef.current?.focus()
      return
    }
    setPending(true)
    setError(null)
    try {
      await api.createCard({ columnId, title: next, description: '', priority: null, labelIds: [] })
      setTitle('')
      await onCreated()
      inputRef.current?.focus()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'カードを追加できませんでした')
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="add-slip"
        onClick={() => {
          focusOnOpen.current = true
          setOpen(true)
        }}
      >
        ＋ カードを追加
      </button>
    )
  }

  return (
    <form className="composer" onSubmit={(event) => void submit(event)} onKeyDown={(event) => {
      if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
    }}>
      <input
        ref={inputRef}
        aria-label="新しいカードのタイトル"
        placeholder="カードのタイトル"
        value={title}
        maxLength={120}
        disabled={pending}
        onChange={(event) => {
          setTitle(event.target.value)
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
      />
      <div className="composer-actions">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? '追加しています…' : 'カードを追加'}
        </button>
        {hasCards ? (
          <button type="button" className="text-button" disabled={pending} onClick={close}>
            閉じる
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="well-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
