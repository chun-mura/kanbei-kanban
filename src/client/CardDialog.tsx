import { useEffect, useRef, useState, type FormEvent } from 'react'
import { COLOR_LABEL, LABEL_COLORS, PRIORITY_LABEL, PRIORITIES, type Card, type Column, type Label, type LabelColor, type Priority } from '../shared/types'
import { layoutOf, moveCard } from '../shared/layout'
import type { CardInput } from './api'
import { useApi } from './ProjectContext'

export type Draft = { card: Card; columnName: string }

type Props = {
  draft: Draft
  columns: Column[]
  labels: Label[]
  onClose: () => void
  onChanged: () => Promise<void>
  onLabels: (labels: Label[]) => void
  onArchived: (card: Card) => void
  onDeleted: (card: Card) => void
}

export function CardDialog({ draft, columns, labels, onClose, onChanged, onLabels, onArchived, onDeleted }: Props) {
  const api = useApi()
  const editing = draft.card
  const [columnId, setColumnId] = useState(editing.columnId)
  const [title, setTitle] = useState(editing.title)
  const [description, setDescription] = useState(editing.description)
  const [priority, setPriority] = useState<Priority | null>(editing.priority)
  const [selected, setSelected] = useState<number[]>(editing.labelIds)
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState<LabelColor>('sumi')
  const [error, setError] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [deletingLabel, setDeletingLabel] = useState<number | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const busy = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const element = dialogRef.current
    const previousFocus = document.activeElement as HTMLElement | null
    const previous = document.body.style.overflow
    element?.showModal()
    titleRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      element?.close()
      document.body.style.overflow = previous
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const dirty = columnId !== editing.columnId || title !== editing.title || description !== editing.description || priority !== editing.priority ||
    JSON.stringify([...selected].sort()) !== JSON.stringify([...editing.labelIds].sort())

  useEffect(() => {
    if (!dirty && !labelName.trim()) return
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty, labelName])

  function requestClose() {
    if (busy.current) return
    if (dirty || labelName.trim()) setDiscard(true)
    else onClose()
  }

  function begin() {
    if (busy.current) return false
    busy.current = true
    setPending(true)
    setError(null)
    return true
  }

  function finish() { busy.current = false; setPending(false) }

  const input: CardInput = { title, description, priority, labelIds: selected }

  async function persist() {
    await api.updateCard(editing.id, input)
    if (columnId !== editing.columnId) {
      await api.saveLayout(layoutOf(moveCard(columns, editing.id, { kind: 'column', id: columnId })))
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError('タイトルを入力してください')
      titleRef.current?.focus()
      return
    }
    if (!begin()) return
    try {
      await persist()
      await onChanged()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存できませんでした')
      finish()
    }
  }

  async function addLabel() {
    if (!labelName.trim() || !begin()) return
    try {
      const created = await api.createLabel({ name: labelName, color: labelColor })
      onLabels([...labels, created])
      setSelected((current) => [...current, created.id])
      setLabelName('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ラベルを作れませんでした')
    } finally { finish() }
  }

  async function removeLabel(id: number) {
    if (!begin()) return
    try {
      await api.deleteLabel(id)
      onLabels(labels.filter((label) => label.id !== id))
      setSelected((current) => current.filter((labelId) => labelId !== id))
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ラベルを消せませんでした')
    } finally { setDeletingLabel(null); finish() }
  }

  async function archive() {
    if (!begin()) return
    try {
      if (dirty) await persist()
      await api.archiveCard(draft.card.id)
      onArchived({ ...draft.card, ...input, columnId })
      await onChanged()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'アーカイブできませんでした')
      finish()
    }
  }

  async function destroy() {
    if (!begin()) return
    try {
      await api.deleteCard(draft.card.id)
      onDeleted({ ...draft.card, labelIds: draft.card.labelIds.filter((id) => labels.some((label) => label.id === id)) })
      await onChanged()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'カードを削除できませんでした')
      finish()
    }
  }

  return (
    <dialog ref={dialogRef} className="card-dialog sheet" aria-labelledby="slip-dialog-title"
      onCancel={(event) => { event.preventDefault(); requestClose() }}>
      <form onSubmit={(event) => void save(event)} onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
      }}>
        <fieldset className="form-fields" disabled={pending} aria-busy={pending}>
        <p className="sheet-kicker">{draft.columnName}</p>
        <h2 id="slip-dialog-title">カードを編集</h2>
        <label className="field">
          <span>タイトル <small>必須</small></span>
          <input ref={titleRef} required aria-invalid={error && !title.trim() ? true : undefined} aria-describedby={error ? "card-error" : undefined} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>移動先の列</span>
          <select value={columnId} onChange={(event) => setColumnId(Number(event.target.value))}>
            {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
          </select>
          <span className="field-note">保存すると選択した列に移動します。</span>
        </label>
        <label className="field">
          <span>メモ</span>
          <textarea value={description} maxLength={4000} rows={4} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="field">
          <span id="priority-label">優先度</span>
          <div className="choice-row" role="group" aria-labelledby="priority-label">
            {[null, ...PRIORITIES].map((item) => (
              <label key={item ?? 'none'} className={`radio-choice ${item === 'high' ? 'is-high' : ''}`}>
                <input type="radio" name="priority" value={item ?? ''} checked={priority === item} onChange={() => setPriority(item)} />
                <span>{item ? PRIORITY_LABEL[item] : '未設定'}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span>ラベル</span>
          {labels.length === 0 ? <p className="field-note">ラベルを作成すると、カードを分類できます。</p> : null}
          <div className="label-list">
            {labels.map((label) => {
              const on = selected.includes(label.id)
              return (
                <span key={label.id} className="label-edit">
                  <button
                    type="button"
                    className={`mark mark-${label.color}`}
                    aria-pressed={on}
                    onClick={() =>
                      setSelected((current) => (on ? current.filter((id) => id !== label.id) : [...current, label.id]))
                    }
                  >
                    {label.name}
                  </button>
                  <button type="button" className="text-button" aria-label={`${label.name}を削除`} onClick={() => setDeletingLabel(label.id)}>
                    削除
                  </button>
                </span>
              )
            })}
          </div>
          {deletingLabel !== null ? (
            <div className="confirmation" role="alert">
              <p>「{labels.find((label) => label.id === deletingLabel)?.name}」を削除しますか？このプロジェクトのすべてのカードから外れます。</p>
              <button type="button" className="btn danger" onClick={() => void removeLabel(deletingLabel)}>ラベルを削除</button>
              <button type="button" className="btn quiet" onClick={() => setDeletingLabel(null)}>キャンセル</button>
            </div>
          ) : null}
          <div className="new-label">
            <input
              aria-label="新しいラベルの名前"
              placeholder="ラベルの名前"
              value={labelName}
              maxLength={20}
              onChange={(event) => setLabelName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault(); void addLabel()
                }
              }}
            />
            <div className="swatches" role="group" aria-label="ラベルの色">
              {LABEL_COLORS.map((color) => (
                <label key={color} className={`swatch swatch-${color}`} title={COLOR_LABEL[color]}>
                  <input type="radio" name="label-color" checked={labelColor === color} aria-label={COLOR_LABEL[color]} onChange={() => setLabelColor(color)} />
                  <span aria-hidden="true" />
                </label>
              ))}
            </div>
            <button type="button" className="btn quiet" disabled={!labelName.trim()} onClick={() => void addLabel()}>
              ラベルを足す
            </button>
          </div>
        </div>
        {error ? (
          <p id="card-error" className="sheet-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="sheet-actions">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? '処理しています…' : '保存する'}
          </button>
          <button type="button" className="btn quiet" onClick={requestClose}>
            閉じる
          </button>
          <button type="button" className="btn quiet" disabled={pending} onClick={() => void archive()}>
            {dirty ? '保存してアーカイブ' : 'アーカイブする'}
          </button>
          {!armed ? (
            <button type="button" className="text-button danger" onClick={() => setArmed(true)}>
              カードを削除
            </button>
          ) : (
            <div className="confirmation" role="alert">
              <p>このカードを削除しますか？</p>
              <button type="button" className="btn danger" disabled={pending} onClick={() => void destroy()}>削除する</button>
              <button type="button" className="btn quiet" onClick={() => setArmed(false)}>キャンセル</button>
            </div>
          )}
        </div>
        {discard ? <div className="confirmation" role="alert">
          <p>保存していない変更があります。変更を破棄して閉じますか？</p>
          <button type="button" className="btn quiet" autoFocus onClick={() => setDiscard(false)}>編集を続ける</button>
          <button type="button" className="btn danger" onClick={onClose}>破棄して閉じる</button>
        </div> : null}
        </fieldset>
      </form>
    </dialog>
  )
}
