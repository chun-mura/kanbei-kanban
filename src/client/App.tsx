import { useCallback, useEffect, useState } from 'react'
import type { Board as BoardData, Card } from '../shared/types'
import { api } from './api'
import { ArchiveView } from './ArchiveView'
import { Board } from './Board'
import { CardDialog, type Draft } from './CardDialog'

export function App() {
  const [view, setView] = useState<'board' | 'archive'>('board')
  const [board, setBoard] = useState<BoardData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [undo, setUndo] = useState<Undo | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  const refresh = useCallback(async () => {
    const next = await api.board()
    setBoard(next)
    setStatus('ready')
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    let stopped = false
    let timer = 0
    async function attempt(count: number) {
      try {
        const next = await api.board()
        if (stopped) return
        setBoard(next)
        setStatus('ready')
      } catch {
        if (stopped) return
        if (count < 4) {
          timer = window.setTimeout(() => void attempt(count + 1), 300)
          return
        }
        setStatus('error')
      }
    }
    void attempt(0)
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [])

  const closeDialog = useCallback(() => setDraft(null), [])

  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), 6000)
    return () => window.clearTimeout(timer)
  }, [undo])

  function openCard(card: Card) {
    const column = board?.columns.find((item) => item.id === card.columnId)
    setDraft({ card, columnName: column?.name ?? '' })
  }

  function offerUndo(next: Undo) {
    setNotice(null)
    setUndo(next)
  }

  async function archiveCard(card: Card) {
    await api.archiveCard(card.id)
    await refresh()
    offerUndo({ kind: 'archive', card })
  }

  async function undoLast() {
    if (!undo) return
    const action = undo
    setUndo(null)
    try {
      if (action.kind === 'archive') {
        await api.restoreCard(action.card.id)
      } else {
        await api.createCard({
          columnId: action.card.columnId,
          title: action.card.title,
          description: action.card.description,
          priority: action.card.priority,
          labelIds: action.card.labelIds,
        })
      }
      await refresh()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '戻せませんでした')
    }
  }

  const count = board?.columns.reduce((sum, column) => sum + column.cards.length, 0) ?? 0

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="hanko" aria-hidden="true">
            勘
          </span>
          <h1>勘兵衛</h1>
        </div>
        <div className="top-tools">
          <p className="census">
            板に <span>{count}</span>
          </p>
          <div className="views">
            <button type="button" aria-current={view === 'board' ? 'page' : undefined} onClick={() => setView('board')}>
              板
            </button>
            <button type="button" aria-current={view === 'archive' ? 'page' : undefined} onClick={() => setView('archive')}>
              控え
            </button>
          </div>
        </div>
      </header>
      {notice ? (
        <p className="notice" role="alert">
          {notice}
        </p>
      ) : null}
      {status === 'loading' ? <p className="stage-message">板を開いています</p> : null}
      {status === 'error' ? (
        <div className="stage">
          <p className="stage-message">板を開けませんでした</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setStatus('loading')
              void refresh().catch(() => setStatus('error'))
            }}
          >
            もう一度開く
          </button>
        </div>
      ) : null}
      {status === 'ready' && board && view === 'board' ? (
        <Board
          board={board}
          reducedMotion={reducedMotion}
          onBoard={setBoard}
          onLayoutError={setNotice}
          saveLayout={api.saveLayout}
          onOpenCard={openCard}
          onArchiveCard={archiveCard}
          onRefresh={refresh}
        />
      ) : null}
      {status === 'ready' && view === 'archive' ? <ArchiveView onChanged={refresh} /> : null}
      {draft && board ? (
        <CardDialog
          draft={draft}
          labels={board.labels}
          onClose={closeDialog}
          onChanged={refresh}
          onLabels={(labels) => setBoard({ ...board, labels })}
          onArchived={(card) => offerUndo({ kind: 'archive', card })}
          onDeleted={(card) => offerUndo({ kind: 'delete', card })}
        />
      ) : null}
      {undo ? (
        <div className="toast" role="status">
          <p>{undo.kind === 'archive' ? `「${undo.card.title}」を控えに移しました` : `「${undo.card.title}」を消しました`}</p>
          <button type="button" className="btn" onClick={() => void undoLast()}>
            戻す
          </button>
        </div>
      ) : null}
    </>
  )
}

type Undo = { kind: 'archive' | 'delete'; card: Card }
