import { useEffect, useRef, useState, type FormEvent } from 'react'
import { COLOR_LABEL, LABEL_COLORS, PRIORITY_LABEL, PRIORITIES, type Card, type Label, type LabelColor, type Priority } from '../shared/types'
import { api, type CardInput } from './api'

export type Draft = { card: Card; columnName: string }

type Props = {
  draft: Draft
  labels: Label[]
  onClose: () => void
  onChanged: () => Promise<void>
  onLabels: (labels: Label[]) => void
  onArchived: (card: Card) => void
  onDeleted: (card: Card) => void
}

export function CardDialog({ draft, labels, onClose, onChanged, onLabels, onArchived, onDeleted }: Props) {
  const editing = draft.card
  const [title, setTitle] = useState(editing.title)
  const [description, setDescription] = useState(editing.description)
  const [priority, setPriority] = useState<Priority | null>(editing.priority)
  const [selected, setSelected] = useState<number[]>(editing.labelIds)
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState<LabelColor>('sumi')
  const [error, setError] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const input: CardInput = { title, description, priority, labelIds: selected }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError('題を書いてください')
      titleRef.current?.focus()
      return
    }
    setPending(true)
    setError(null)
    try {
      await api.updateCard(draft.card.id, input)
      await onChanged()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存できませんでした')
      setPending(false)
    }
  }

  async function addLabel() {
    setError(null)
    try {
      const created = await api.createLabel({ name: labelName, color: labelColor })
      onLabels([...labels, created])
      setSelected((current) => [...current, created.id])
      setLabelName('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ラベルを作れませんでした')
    }
  }

  async function removeLabel(id: number) {
    setError(null)
    try {
      await api.deleteLabel(id)
      onLabels(labels.filter((label) => label.id !== id))
      setSelected((current) => current.filter((labelId) => labelId !== id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ラベルを消せませんでした')
    }
  }

  async function archive() {
    setPending(true)
    try {
      await api.archiveCard(draft.card.id)
      await onChanged()
      onArchived(draft.card)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '控えに移せませんでした')
      setPending(false)
    }
  }

  async function destroy() {
    setPending(true)
    try {
      await api.deleteCard(draft.card.id)
      await onChanged()
      onDeleted(draft.card)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '札を消せませんでした')
      setPending(false)
    }
  }

  return (
    <div className="scrim">
      <form className="sheet" role="dialog" aria-modal="true" aria-labelledby="slip-dialog-title" onSubmit={(event) => void save(event)}>
        <p className="sheet-kicker">{draft.columnName}</p>
        <h2 id="slip-dialog-title">札を直す</h2>
        <label className="field">
          <span>タイトル</span>
          <input ref={titleRef} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>メモ</span>
          <textarea value={description} maxLength={4000} rows={4} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="field">
          <span id="priority-label">優先度</span>
          <div className="choice-row" role="radiogroup" aria-labelledby="priority-label">
            <button type="button" role="radio" aria-checked={priority === null} onClick={() => setPriority(null)}>
              未設定
            </button>
            {PRIORITIES.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                className={item === 'high' ? 'is-high' : undefined}
                aria-checked={priority === item}
                onClick={() => setPriority(item)}
              >
                {PRIORITY_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>ラベル</span>
          {labels.length === 0 ? <p className="field-note">まだラベルはない</p> : null}
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
                  <button type="button" className="text-button" aria-label={`${label.name}を削除`} onClick={() => void removeLabel(label.id)}>
                    削除
                  </button>
                </span>
              )
            })}
          </div>
          <div className="new-label">
            <input
              aria-label="新しいラベルの名前"
              placeholder="ラベルの名前"
              value={labelName}
              maxLength={20}
              onChange={(event) => setLabelName(event.target.value)}
            />
            <div className="swatches" role="radiogroup" aria-label="ラベルの色">
              {LABEL_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  className={`swatch swatch-${color}`}
                  aria-checked={labelColor === color}
                  aria-label={COLOR_LABEL[color]}
                  onClick={() => setLabelColor(color)}
                />
              ))}
            </div>
            <button type="button" className="btn quiet" onClick={() => void addLabel()}>
              ラベルを足す
            </button>
          </div>
        </div>
        {error ? (
          <p className="sheet-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="sheet-actions">
          <button type="submit" className="btn" disabled={pending}>
            保存する
          </button>
          <button type="button" className="btn quiet" onClick={onClose}>
            閉じる
          </button>
          <button type="button" className="btn quiet" disabled={pending} onClick={() => void archive()}>
            控えに移す
          </button>
          {!armed ? (
            <button type="button" className="text-button danger" onClick={() => setArmed(true)}>
              この札を消す
            </button>
          ) : (
            <button type="button" className="btn danger" disabled={pending} onClick={() => void destroy()}>
              消す
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
