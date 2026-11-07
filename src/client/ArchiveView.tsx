import { useCallback, useEffect, useRef, useState } from 'react'
import { PRIORITY_LABEL, type Archive, type Label } from '../shared/types'
import { useApi } from './ProjectContext'

const when = new Intl.DateTimeFormat('ja-JP', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function ArchiveView({ onChanged }: { onChanged: () => Promise<void> }) {
  const api = useApi()
  const [archive, setArchive] = useState<Archive | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const busy = useRef(false)
  const [pendingId, setPendingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const next = await api.archive()
    setArchive(next)
    setError(null)
  }, [api])

  useEffect(() => {
    let stopped = false
    void api
      .archive()
      .then((next) => {
        if (!stopped) setArchive(next)
      })
      .catch((caught: unknown) => {
        if (!stopped) setError(caught instanceof Error ? caught.message : 'アーカイブを開けませんでした')
      })
    return () => {
      stopped = true
    }
  }, [api])

  async function run(id: number, action: 'restore' | 'delete') {
    if (busy.current) return
    busy.current = true
    setPendingId(id)
    setError(null)
    try {
      if (action === 'restore') await api.restoreCard(id)
      else await api.deleteCard(id)
      setArchive((current) => current ? { ...current, cards: current.cards.filter((card) => card.id !== id) } : current)
      await load()
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'アーカイブを更新できませんでした')
    } finally {
      busy.current = false
      setPendingId(null)
      setConfirmId(null)
    }
  }

  if (!archive && !error) return <p className="stage-message" role="status">アーカイブを開いています…</p>
  if (!archive) {
    return (
      <div className="stage">
        <p className="stage-message" role="alert">{error}</p>
        <button type="button" className="btn" onClick={() => void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : '再試行できませんでした'))}>再試行</button>
      </div>
    )
  }

  return (
    <section className="ledger" aria-labelledby="archive-title">
      <header className="ledger-head">
        <h2 id="archive-title">アーカイブ</h2>
        <p>ボードから移したカードです。復元すると、元の列の末尾に戻ります。</p>
      </header>
      {error ? (
        <p className="sheet-error" role="alert">
          {error}
          <button type="button" className="btn quiet" onClick={() => void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : '再試行できませんでした'))}>再試行</button>
        </p>
      ) : null}
      {archive.cards.length === 0 ? <p className="ledger-empty">アーカイブしたカードはありません。カードの「アーカイブ」から移せます。</p> : null}
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
              <button type="button" className="btn quiet" disabled={pendingId !== null} onClick={() => void run(card.id, 'restore')}>
                ボードに戻す
              </button>
              {confirmId === card.id ? <div className="confirmation" role="alert">
                <p>「{card.title}」を完全に削除しますか？この操作は取り消せません。</p>
                <button type="button" className="btn danger" disabled={pendingId !== null} onClick={() => void run(card.id, 'delete')}>完全に削除</button>
                <button type="button" className="btn quiet" disabled={pendingId !== null} onClick={() => setConfirmId(null)}>キャンセル</button>
              </div> : <button type="button" className="text-button danger" disabled={pendingId !== null} onClick={() => setConfirmId(card.id)}>削除</button>}
              {pendingId === card.id ? <span role="status">処理しています…</span> : null}
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
