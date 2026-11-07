import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardDialog } from './CardDialog'
import { ProjectApiContext } from './ProjectContext'
import { createApi } from './api'

function dialog() {
  return renderToStaticMarkup(createElement(ProjectApiContext.Provider, { value: createApi(1) },
    createElement(CardDialog, {
      draft: { card: { id: 1, columnId: 1, title: '確認する', description: '', priority: null, position: 0, labelIds: [] }, columnName: '未着手' },
      columns: [{ id: 1, name: '未着手', position: 0, cards: [] }], labels: [], onClose() {}, async onChanged() {}, onLabels() {}, onArchived() {}, onDeleted() {},
    })))
}

describe('カード編集のアクセシビリティ', () => {
  it('ブラウザ標準のモーダルを使用する', () => {
    expect(dialog()).toContain('<dialog')
  })
  it('優先度と色を矢印キーで選べる標準ラジオとして提供する', () => {
    expect(dialog().match(/type="radio"/g)).toHaveLength(10)
  })
  it('必須タイトルと入力エラーの関連を提供する', () => {
    expect(dialog()).toMatch(/<input[^>]*required=""/)
  })
})

it('ドラッグせず移動できる列の選択肢を提供する', () => {
  expect(dialog()).toContain('移動先の列')
  expect(dialog()).toContain('<select')
})
