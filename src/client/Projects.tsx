import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Project } from '../shared/types'
import { App } from './App'
import { createApi, projectsApi } from './api'
import { ProjectApiContext } from './ProjectContext'

const selectionKey = 'kanbei.projectId'

function savedProjectId() {
  try { return Number(localStorage.getItem(selectionKey)) } catch { return null }
}

function rememberProject(id: number) {
  try { localStorage.setItem(selectionKey, String(id)) } catch { /* 保存できない環境でも切り替えは利用できる。 */ }
}

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [attempt, setAttempt] = useState(0)
  const api = useMemo(() => selected === null ? null : createApi(selected), [selected])

  useEffect(() => {
    let stopped = false
    setError(null)
    void projectsApi.list().then((list) => {
      if (stopped) return
      const project = list.find((item) => item.id === savedProjectId()) ?? list[0]
      if (!project) throw new Error('プロジェクトが見当たりません')
      setProjects(list)
      setSelected(project.id)
      rememberProject(project.id)
    }).catch((caught: unknown) => {
      if (!stopped) setError(caught instanceof Error ? caught.message : 'プロジェクトを開けませんでした')
    })
    return () => { stopped = true }
  }, [attempt])

  function select(id: number) {
    setSelected(id)
    rememberProject(id)
  }

  const controls = (
    <div className="project-controls">
      <label className="project-picker">
        <span>プロジェクト</span>
        <select value={selected ?? ''} onChange={(event) => select(Number(event.target.value))}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <button type="button" className="btn project-rename"
        onClick={() => setEditing(projects.find((project) => project.id === selected) ?? null)}>名前を変更</button>
      <button type="button" className="btn project-create" onClick={() => setCreating(true)}>＋ プロジェクト</button>
    </div>
  )

  return (
    <>
      {api ? (
        <ProjectApiContext.Provider key={selected} value={api}>
          <App projectControls={controls} />
        </ProjectApiContext.Provider>
      ) : (
        <div className="stage">
          <h1>勘兵衛</h1>
          <p className="stage-message" role={error ? 'alert' : 'status'}>{error ?? 'プロジェクトを開いています'}</p>
          {error ? <button type="button" className="btn" onClick={() => setAttempt((value) => value + 1)}>もう一度開く</button> : null}
        </div>
      )}
      {creating || editing ? (
        <ProjectDialog
          project={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={(project) => {
            if (editing) {
              setProjects((list) => list.map((item) => item.id === project.id ? project : item))
            } else {
              setProjects((list) => [...list, project])
              select(project.id)
            }
            setCreating(false)
            setEditing(null)
          }}
        />
      ) : null}
    </>
  )
}

function ProjectDialog({ project, onClose, onSaved }: {
  project?: Project
  onClose: () => void
  onSaved: (project: Project) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(project?.name ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    if (!name.trim()) { setError('プロジェクト名を入れてください'); return }
    setPending(true)
    setError(null)
    try {
      onSaved(await (project ? projectsApi.rename(project.id, name) : projectsApi.create(name)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存できませんでした')
      setPending(false)
    }
  }

  return (
    <dialog ref={dialog} className="project-dialog sheet" aria-labelledby="project-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose() }}>
      <form onSubmit={(event) => void submit(event)} onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
      }}>
        <h2 id="project-dialog-title">{project ? 'プロジェクト名を変更' : 'プロジェクトを作成'}</h2>
        <p className="project-hint">{project ? '新しいプロジェクト名を入力してください。' : '新しいボードを用意します。最初の列は「未着手・進行中・完了」です。'}</p>
        <label className="project-name">
          <span>プロジェクト名</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required maxLength={80}
            placeholder="例：新しいサービス" disabled={pending} aria-describedby={error ? 'project-error' : undefined} />
        </label>
        {error ? <p id="project-error" className="sheet-error" role="alert">{error}</p> : null}
        <div className="project-actions">
          <button type="button" className="btn quiet" disabled={pending} onClick={onClose}>キャンセル</button>
          <button type="submit" className="btn" disabled={pending}>{pending ? '保存しています…' : project ? '変更する' : '作成する'}</button>
        </div>
      </form>
    </dialog>
  )
}
