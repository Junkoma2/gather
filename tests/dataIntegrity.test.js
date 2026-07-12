// 壊れた保存データ（localStorage / インポートJSON）からの復帰を確認する回帰テスト。
// 追加の依存を増やさないため、Node標準の test runner のみを使う。
// 実行方法: node --test tests/dataIntegrity.test.js

const test = require('node:test')
const assert = require('node:assert/strict')
const { isValidThought, parseStoredThoughts } = require('../dataIntegrity.js')

function validThought(overrides = {}) {
  return {
    id: 'a1',
    title: '考え',
    note: '',
    color: '#7fb7be',
    hue: 190,
    radius: 32,
    x: 100,
    y: 120,
    vx: 0,
    vy: 0,
    ...overrides,
  }
}

test('parseStoredThoughts: 初回起動（キー未設定）は破損扱いにしない', () => {
  const result = parseStoredThoughts(null)
  assert.deepEqual(result, { thoughts: [], wasCorrupted: false })
})

test('parseStoredThoughts: 壊れたオブジェクト {broken:true} は空配列にフォールバックする', () => {
  // 再現条件: localStorage の gather-thoughts に {broken:true} を入れて再読込した際の TypeError を再発防止する
  const result = parseStoredThoughts(JSON.stringify({ broken: true }))
  assert.deepEqual(result.thoughts, [])
  assert.equal(result.wasCorrupted, true)
})

test('parseStoredThoughts: 壊れたJSON文字列（構文エラー）は空配列にフォールバックする', () => {
  const result = parseStoredThoughts('{not valid json')
  assert.deepEqual(result.thoughts, [])
  assert.equal(result.wasCorrupted, true)
})

test('parseStoredThoughts: 正常な配列はそのまま読み込め、破損扱いにしない', () => {
  const thoughts = [validThought({ id: 'a1' }), validThought({ id: 'a2' })]
  const result = parseStoredThoughts(JSON.stringify(thoughts))
  assert.equal(result.thoughts.length, 2)
  assert.equal(result.wasCorrupted, false)
})

test('parseStoredThoughts: 一部の要素が不正な配列は有効な要素だけ救済する', () => {
  const thoughts = [
    validThought({ id: 'ok' }),
    { id: 'missing-position', title: '壊れた項目', note: '', color: '#000000', radius: 10 }, // x/y なし
    null,
  ]
  const result = parseStoredThoughts(JSON.stringify(thoughts))
  assert.equal(result.thoughts.length, 1)
  assert.equal(result.thoughts[0].id, 'ok')
  assert.equal(result.wasCorrupted, true)
})

test('parseStoredThoughts: 配列でないJSON（旧形式・別データ）は空配列にフォールバックする', () => {
  const result = parseStoredThoughts(JSON.stringify({ thoughts: [validThought()] }))
  assert.deepEqual(result.thoughts, [])
  assert.equal(result.wasCorrupted, true)
})

test('isValidThought: x/y が欠けている、または数値でない項目は無効と判定する', () => {
  // インポートJSON側での必須項目検証を確認する（不完全なimport JSONの再現）
  assert.equal(isValidThought(validThought()), true)
  assert.equal(isValidThought(validThought({ x: undefined })), false)
  assert.equal(isValidThought(validThought({ y: undefined })), false)
  assert.equal(isValidThought(validThought({ x: 'not-a-number' })), false)
  assert.equal(isValidThought(validThought({ radius: NaN })), false)
  assert.equal(isValidThought(validThought({ radius: Infinity })), false)
})

test('isValidThought: 必須の文字列項目が欠けている項目は無効と判定する', () => {
  assert.equal(isValidThought(validThought({ id: 123 })), false)
  assert.equal(isValidThought(validThought({ title: null })), false)
  assert.equal(isValidThought(validThought({ color: undefined })), false)
})

test('isValidThought: null・非オブジェクトは無効と判定する', () => {
  assert.equal(isValidThought(null), false)
  assert.equal(isValidThought(undefined), false)
  assert.equal(isValidThought('string'), false)
  assert.equal(isValidThought(42), false)
})

test('import想定: 不完全な要素を含むJSONは every(isValidThought) で不正判定される', () => {
  // script.js の importThoughts は Array.isArray(payload.thoughts) && payload.thoughts.every(isValidThought) で検証する。
  // x/y を欠いた不完全なimportデータが素通りしないことを確認する。
  const incompletePayload = {
    version: 1,
    thoughts: [validThought({ id: 'ok' }), { id: 'no-xy', title: '不完全', note: '', color: '#111111', radius: 20 }],
  }
  assert.equal(
    Array.isArray(incompletePayload.thoughts) && incompletePayload.thoughts.every(isValidThought),
    false,
  )
})
