import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Board as BoardData, Card } from '../shared/types'
import { useApi } from './ProjectContext'
import { ArchiveView } from './ArchiveView'
import { Board } from './Board'
import { CardDialog, type Draft } from './CardDialog'

export function App({ projectControls }: { projectControls: ReactNode }) {
  const api = useApi()
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
  }, [api])

  const syncBoard = useCallback(async () => {
    try { await refresh() }
    catch { setNotice('変更は保存されましたが、最新の表示を取得できませんでした。再読み込みしてください。') }
  }, [refresh])

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
    offerUndo({ kind: 'archive', card })
    await syncBoard()
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
          labelIds: action.card.labelIds.filter((id) => board?.labels.some((label) => label.id === id)),
        })
      }
      await syncBoard()
    } catch (caught) {
      setUndo(action)
      setNotice(caught instanceof Error ? caught.message : '戻せませんでした')
    }
  }

  const count = board?.columns.reduce((sum, column) => sum + column.cards.length, 0) ?? 0

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">ボードへ移動</a>
      <header className="topbar">
        <div className="brand">
          <span className="hanko" aria-hidden="true">
            勘
          </span>
          <h1>勘兵衛</h1>
        </div>
        {projectControls}
        <div className="top-tools">
          <p className="census">
            カード <span>{count}</span> 件
          </p>
          <nav className="views" aria-label="表示切り替え">
            <button type="button" aria-current={view === 'board' ? 'page' : undefined} onClick={() => setView('board')}>
              ボード
            </button>
            <button type="button" aria-current={view === 'archive' ? 'page' : undefined} onClick={() => setView('archive')}>
              アーカイブ
            </button>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
      {notice ? (
        <div className="notice" role="alert">
          <p>{notice}</p>
          <button type="button" className="btn quiet" onClick={() => {
            setNotice(null)
            void refresh().catch(() => setNotice('最新の表示を取得できませんでした。もう一度お試しください。'))
          }}>再読み込み</button>
          <button type="button" className="text-button" aria-label="エラー通知を閉じる" onClick={() => setNotice(null)}>閉じる</button>
        </div>
      ) : null}
      {status === 'loading' ? <p className="stage-message" role="status">ボードを開いています…</p> : null}
      {status === 'error' ? (
        <div className="stage">
          <p className="stage-message">ボードを開けませんでした</p>
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
          onRefresh={syncBoard}
        />
      ) : null}
      {status === 'ready' && view === 'archive' ? <ArchiveView onChanged={syncBoard} /> : null}
      </main>
      {draft && board ? (
        <CardDialog
          draft={draft}
          columns={board.columns}
          labels={board.labels}
          onClose={closeDialog}
          onChanged={syncBoard}
          onLabels={(labels) => setBoard({ ...board, labels })}
          onArchived={(card) => offerUndo({ kind: 'archive', card })}
          onDeleted={(card) => offerUndo({ kind: 'delete', card })}
        />
      ) : null}
      {undo ? (
        <div className="toast" role="status">
          <p>{undo.kind === 'archive' ? `「${undo.card.title}」をアーカイブしました` : `「${undo.card.title}」を削除しました`}</p>
          <button type="button" className="btn" onClick={() => void undoLast()}>
            元に戻す
          </button>
          <button type="button" className="text-button" aria-label="通知を閉じる" onClick={() => setUndo(null)}>閉じる</button>
        </div>
      ) : null}
    </div>
  )
}

type Undo = { kind: 'archive' | 'delete'; card: Card }
