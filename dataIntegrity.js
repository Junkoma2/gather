// 保存データ（localStorage / インポートJSON）の検証・復旧ロジック。
// DOM に依存しない純粋関数のみを置き、Node からそのまま読み込んで単体テストできるようにする。

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

// 1件の思考データが描画・物理演算に必要な最低限の形を満たしているか判定する
function isValidThought(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.note === 'string' &&
    typeof value.color === 'string' &&
    isFiniteNumber(value.radius) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  )
}

// localStorage から読み込んだ生文字列を検証し、壊れている場合は安全な配列へフォールバックする。
// 配列でない・要素が不正など、壊れた形跡があれば wasCorrupted を true にする。
function parseStoredThoughts(raw) {
  if (raw == null) return { thoughts: [], wasCorrupted: false }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { thoughts: [], wasCorrupted: true }
  }

  if (!Array.isArray(parsed)) {
    return { thoughts: [], wasCorrupted: true }
  }

  const valid = parsed.filter(isValidThought)
  return { thoughts: valid, wasCorrupted: valid.length < parsed.length }
}

const api = { isFiniteNumber, isValidThought, parseStoredThoughts }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api
} else if (typeof window !== 'undefined') {
  window.GatherDataIntegrity = api
}
