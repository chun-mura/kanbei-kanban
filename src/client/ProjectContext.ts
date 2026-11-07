import { createContext, useContext } from 'react'
import type { createApi } from './api'

export const ProjectApiContext = createContext<ReturnType<typeof createApi> | null>(null)

export function useApi() {
  const api = useContext(ProjectApiContext)
  if (!api) throw new Error('プロジェクトが選択されていません')
  return api
}
