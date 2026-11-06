import { useCallback, useEffect, useState } from 'react'
import { PRIORITY_LABEL, type Archive, type Label } from '../shared/types'
import { api } from './api'

const when = new Intl.DateTimeFormat('ja-JP', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function ArchiveView({ onChanged }: { onChanged: () => Promise<void> }) {
  const [archive, setArchive] = useState<Archive | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const next = await api.archive()
    setArchive(next)
    setError(null)
  }, [])

  useEffect(() => {
    let stopped = false
    void api
      .archive()
      .then((next) => {
        if (!stopped) setArchive(next)
      })
      .catch((caught: unknown) => {
        if (!stopped) setError(caught instanceof Error ? caught.message : '控えを開けませんでした')
      })
    return () => {
      stopped = true
    }
  }, [])

  async function run(id: number, action: 'restore' | 'delete') {
    setPendingId(id)
    setError(null)
    try {
      if (action === 'restore') await api.restoreCard(id)
      else await api.deleteCard(id)
      await load()
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '控えを更新できませんでした')
    } finally {
      setPendingId(null)
    }
  }

  if (!archive && !error) return <p className="stage-message">控えを開いています</p>
  if (!archive) {
    return (
      <p className="stage-message" role="alert">
        {error}
      </p>
    )
  }

  return (
    <section className="ledger">
      <header className="ledger-head">
        <h2>控え</h2>
        <p>板から外した札です。戻すと、元の列の末尾に付きます。</p>
      </header>
      {error ? (
        <p className="sheet-error" role="alert">
          {error}
        </p>
      ) : null}
      {archive.cards.length === 0 ? <p className="ledger-empty">控えは空です</p> : null}
      <ul className="ledger-list">
        {archive.cards.map((card) => (
          <li key={card.id} className="ledger-row">
            <div>
              <p className="ledger-title">{card.title}</p>
              <p className="ledger-meta">
                <span>{card.columnName}</span>
                <span>{when.format(card.archivedAt)}</span>
                {card.priority ? <span className={card.priority === 'high' ? 'meta-high' : undefined}>{PRIORITY_LABEL[card.priority]}</span> : null}
                <LabelNames ids={card.labelIds} labels={archive.labels} />
              </p>
              {card.description ? <p className="ledger-note">{card.description}</p> : null}
            </div>
            <div className="ledger-actions">
              <button type="button" className="btn quiet" disabled={pendingId === card.id} onClick={() => void run(card.id, 'restore')}>
                板に戻す
              </button>
              <button type="button" className="text-button danger" disabled={pendingId === card.id} onClick={() => void run(card.id, 'delete')}>
                消す
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LabelNames({ ids, labels }: { ids: number[]; labels: Label[] }) {
  const names = labels.filter((label) => ids.includes(label.id)).map((label) => label.name)
  if (names.length === 0) return null
  return <span>{names.join('、')}</span>
}
