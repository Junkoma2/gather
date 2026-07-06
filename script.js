const STORAGE_KEY = 'gather-thoughts'
const DEFAULT_COLOR = '#7fb7be'
const DEFAULT_SIZE = 32
const HINT_SHOWN_KEY = 'gather-hint-shown'

const addThoughtButton = document.querySelector('#add-thought')
const dialog = document.querySelector('#thought-dialog')
const dialogTitle = document.querySelector('#dialog-title')
const closeDialogButton = document.querySelector('#close-dialog')
const form = document.querySelector('#thought-form')
const titleInput = document.querySelector('#title-input')
const noteInput = document.querySelector('#note-input')
const colorInput = document.querySelector('#color-input')
const colorR = document.querySelector('#color-r')
const colorG = document.querySelector('#color-g')
const colorB = document.querySelector('#color-b')
const colorRValue = document.querySelector('#color-r-value')
const colorGValue = document.querySelector('#color-g-value')
const colorBValue = document.querySelector('#color-b-value')
const colorPreviewSwatch = document.querySelector('#color-preview-swatch')
const sizeInput = document.querySelector('#size-input')
const deleteThoughtButton = document.querySelector('#delete-thought')
const duplicateThoughtButton = document.querySelector('#duplicate-thought')
const colorSwatches = [...document.querySelectorAll('.color-swatch')]
const canvas = document.querySelector('#gather-canvas')
const ctx = canvas.getContext('2d')
const checkUpdateButton = document.querySelector('#check-update')
const exportButton = document.querySelector('#export-data')
const importButton = document.querySelector('#import-data')
const importFile = document.querySelector('#import-file')
const statusMessage = document.querySelector('#status-message')
const emptyState = document.querySelector('#empty-state')
const emptyStateAddButton = document.querySelector('#empty-state-add')
const emptyStateMessage = document.querySelector('#empty-state-message')
const thoughtsA11y = document.querySelector('#thoughts-a11y')
const thoughtListSr = document.querySelector('#thought-list-sr')
const blendModeButton = document.querySelector('#blend-mode')
const blendStrengthInput = document.querySelector('#blend-strength')
const menuButton = document.querySelector('#menu-button')
const actionMenu = document.querySelector('.action-menu')
const sizePreviewCircle = document.querySelector('#size-preview-circle')
const circleActionMenu = document.querySelector('#circle-action-menu')
const circleEditButton = document.querySelector('#circle-edit')
const circleDeleteButton = document.querySelector('#circle-delete')
const blendPopup = document.querySelector('#blend-popup')
const blendPopupConfirm = document.querySelector('#blend-popup-confirm')
const blendPopupCancel = document.querySelector('#blend-popup-cancel')
const confirmDialogEl = document.querySelector('#confirm-dialog')
const confirmDialogMessage = document.querySelector('#confirm-dialog-message')
const confirmDialogOk = document.querySelector('#confirm-dialog-ok')
const confirmDialogCancel = document.querySelector('#confirm-dialog-cancel')
let thoughts = loadThoughts()
let editingId = null
let width = 0
let height = 0
let animationFrame = null
let isBlendMode = false
let selectedIds = []
let draggingId = null
let dragOffsetX = 0
let dragOffsetY = 0
let dragMoved = false
let activePointerId = null
let actionMenuTargetId = null
let blendPopupIds = null
let blendPopupTimer = null

// 空白タッチ引力
let attractionX = null
let attractionY = null
let attractionStrength = 0
let isAttracting = false

function loadThoughts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
}

function saveThoughts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thoughts))
  } catch {
    showStatus('保存に失敗しました')
  }
  updateEmptyStateA11y()
}

function updateEmptyStateA11y() {
  const isEmpty = thoughts.length === 0
  if (emptyState) emptyState.hidden = !isEmpty
  if (emptyStateMessage) {
    emptyStateMessage.textContent = isEmpty
      ? '考えがまだありません。考えを追加できます。'
      : ''
  }
  if (thoughtsA11y) {
    // canvas の円情報をスクリーンリーダー向けに提供
    thoughtsA11y.textContent = isEmpty
      ? ''
      : `${thoughts.length}個の考えがあります。` + thoughts.map(t => t.title).join('、')
  }
  if (thoughtListSr) {
    thoughtListSr.replaceChildren()
    thoughts.forEach(t => {
      const item = document.createElement('li')
      item.textContent = `${t.title || '（タイトルなし）'}${t.note ? `：${t.note}` : ''}`
      thoughtListSr.appendChild(item)
    })
  }
}

function showStatus(message) {
  statusMessage.textContent = message
  window.clearTimeout(showStatus.timer)
  showStatus.timer = window.setTimeout(() => {
    statusMessage.textContent = ''
  }, 2600)
}

function showConfirm(message, onConfirm) {
  confirmDialogMessage.textContent = message
  confirmDialogEl.showModal()
  // { once: true } でリスナーを自動解除し、複数回呼ばれても累積しない
  confirmDialogOk.addEventListener('click', () => {
    confirmDialogEl.close()
    onConfirm()
  }, { once: true })
  confirmDialogCancel.addEventListener('click', () => {
    confirmDialogEl.close()
  }, { once: true })
}

function exportThoughts() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    thoughts,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `gather-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  showStatus('エクスポートしました')
}

function isValidThought(value) {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.note === 'string' &&
    typeof value.color === 'string' &&
    typeof value.radius === 'number'
  )
}

function importThoughts(file) {
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    showStatus('ファイルが大きすぎます')
    return
  }

  const reader = new FileReader()
  reader.onload = event => {
    try {
      const payload = JSON.parse(event.target.result)
      if (!Array.isArray(payload.thoughts) || !payload.thoughts.every(isValidThought)) {
        throw new Error('invalid')
      }
      showConfirm('現在の考えを置き換えてインポートしますか？', () => {
        thoughts = payload.thoughts
        normalizeThoughts()
        saveThoughts()
        showStatus('インポートしました')
      })
    } catch {
      showStatus('JSON を読み込めませんでした')
    } finally {
      importFile.value = ''
    }
  }
  reader.readAsText(file)
}

async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) {
    window.location.reload()
    return
  }

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    window.location.reload()
    return
  }

  await registration.update()
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    showStatus('更新を適用しています')
    return
  }
  showStatus('最新です')
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  width = rect.width
  height = rect.height
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function hexToHue(hex) {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  if (delta === 0) return 0

  let hue
  if (max === r) hue = ((g - b) / delta) % 6
  if (max === g) hue = (b - r) / delta + 2
  if (max === b) hue = (r - g) / delta + 4
  return Math.round(hue * 60 + (hue < 0 ? 360 : 0))
}

function hueDistance(a, b) {
  const diff = Math.abs(a - b)
  return Math.min(diff, 360 - diff)
}

function createThought(title, note, color, size) {
  return {
    id: crypto.randomUUID(),
    title,
    note,
    color,
    hue: hexToHue(color),
    radius: Number(size),
    x: width / 2 + (Math.random() - 0.5) * Math.min(width * 0.5, 240),
    y: height / 2 + (Math.random() - 0.5) * Math.min(height * 0.5, 240),
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
  }
}

function hexToHsl(hex) {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const delta = max - min
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h = (h * 60 + 360) % 360
  return { h, s, l }
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r, g, b
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// thoughtA（能動側）の色を thoughtB（受動側）の色に近づける。thoughtB は変えない。
function blendHues(thoughtA, thoughtB) {
  const strength = blendStrengthInput ? parseInt(blendStrengthInput.value) / 100 : 0.3
  const diff = thoughtB.hue - thoughtA.hue
  const adjusted = ((diff + 540) % 360) - 180
  const newHueA = (thoughtA.hue + adjusted * strength + 360) % 360
  thoughtA.hue = newHueA
  const hslA = hexToHsl(thoughtA.color)
  thoughtA.color = hslToHex(newHueA, hslA.s, hslA.l)
}

function enterBlendMode() {
  closeMenu()
  isBlendMode = true
  selectedIds = []
  blendModeButton.classList.add('is-active')
  blendModeButton.textContent = 'キャンセル'
  blendModeButton.setAttribute('aria-label', 'つなぐモードをキャンセル')
  showStatus('2つの円をタップしてください')
}

function exitBlendMode() {
  showStatus('')
  isBlendMode = false
  selectedIds = []
  blendModeButton.classList.remove('is-active')
  blendModeButton.textContent = 'つなぐ'
  blendModeButton.setAttribute('aria-label', '2つの円を選んで色を近づける')
}

function updatePhysics() {
  for (let i = 0; i < thoughts.length; i += 1) {
    const a = thoughts[i]

    for (let j = i + 1; j < thoughts.length; j += 1) {
      const b = thoughts[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.max(Math.hypot(dx, dy), 1)
      const nx = dx / distance
      const ny = dy / distance
      const colorGap = hueDistance(a.hue, b.hue)
      const closeness = 1 - colorGap / 180
      const mass = (a.radius + b.radius) / 2
      const idealDistance = a.radius + b.radius + 18

      let force = 0
      if (closeness >= 0.45) {
        force = closeness * mass * 0.0009
      } else {
        force = -(0.45 - closeness) * mass * 0.0011
      }

      if (distance < idealDistance) {
        force -= (idealDistance - distance) * 0.004
      }

      a.vx += nx * force * (b.radius / Math.max(a.radius, 1))
      a.vy += ny * force * (b.radius / Math.max(a.radius, 1))
      b.vx -= nx * force * (a.radius / Math.max(b.radius, 1))
      b.vy -= ny * force * (a.radius / Math.max(b.radius, 1))
    }

    const centerDx = width / 2 - a.x
    const centerDy = height / 2 - a.y
    a.vx += centerDx * 0.00008
    a.vy += centerDy * 0.00008
  }

  // 空白タッチ引力（指を離すまで持続）
  if (attractionX !== null && attractionY !== null) {
    if (isAttracting) {
      attractionStrength = 1.0
    }
    if (attractionStrength > 0.01) {
      thoughts.forEach(thought => {
        if (thought.id === draggingId) return
        const dx = attractionX - thought.x
        const dy = attractionY - thought.y
        const distance = Math.max(Math.hypot(dx, dy), 1)
        const pull = attractionStrength * 0.08 * (1 + Math.min(distance / 100, 2))
        thought.vx += (dx / distance) * pull
        thought.vy += (dy / distance) * pull
      })
      if (!isAttracting) attractionStrength *= 0.82
    } else {
      attractionStrength = 0
      attractionX = null
      attractionY = null
    }
  }

  thoughts.forEach(thought => {
    if (thought.id === draggingId) return
    thought.vx *= 0.988
    thought.vy *= 0.988
    thought.x += thought.vx
    thought.y += thought.vy

    if (thought.x - thought.radius < 0 || thought.x + thought.radius > width) {
      thought.vx *= -0.8
      thought.x = Math.min(Math.max(thought.radius, thought.x), width - thought.radius)
    }
    if (thought.y - thought.radius < 0 || thought.y + thought.radius > height) {
      thought.vy *= -0.8
      thought.y = Math.min(Math.max(thought.radius, thought.y), height - thought.radius)
    }
  })
}


// 最大幅に収まるようにテキストを折り返して描画する
function fillWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split('')
  // 単語が空の場合は何もしない（空白文字区切りではなく文字単位）
  // まず全体が収まるか試す
  const measured = ctx.measureText(text)
  if (measured.width <= maxWidth) {
    ctx.fillText(text, x, y)
    return
  }
  // 収まらない場合は文字単位で折り返す
  const chars = [...text]
  const lines = []
  let current = ''
  for (const ch of chars) {
    const test = current + ch
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = ch
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  const totalH = lines.length * lineHeight
  const startY = y - (totalH - lineHeight) / 2
  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight))
}
function draw() {
  ctx.clearRect(0, 0, width, height)

  if (thoughts.length === 0) {
    return
  }

  thoughts.forEach(thought => {
    const isEditing = thought.id === editingId
    const isSelected = selectedIds.includes(thought.id)
    ctx.beginPath()
    ctx.arc(thought.x, thought.y, thought.radius, 0, Math.PI * 2)
    ctx.fillStyle = thought.color
    ctx.globalAlpha = isEditing || isSelected ? 0.72 : 0.52
    ctx.fill()
    ctx.globalAlpha = 1

    if (isEditing) {
      ctx.lineWidth = 2
      ctx.strokeStyle = '#172033'
      ctx.stroke()
    }

    if (isSelected) {
      ctx.lineWidth = 2
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = '#172033'
      ctx.stroke()
      ctx.setLineDash([])
    }

    const fontSize = Math.max(11, Math.min(16, thought.radius / 2.3))
    ctx.fillStyle = '#172033'
    ctx.font = `${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillWrappedText(ctx, thought.title, thought.x, thought.y, thought.radius * 1.6, fontSize * 1.3)
  })
}

function tick() {
  updatePhysics()
  draw()
  animationFrame = requestAnimationFrame(tick)
}

function normalizeThoughts() {
  thoughts = thoughts.map(thought => ({
    ...thought,
    color: thought.color ?? DEFAULT_COLOR,
    hue: thought.hue ?? hexToHue(thought.color ?? DEFAULT_COLOR),
    vx: thought.vx ?? 0,
    vy: thought.vy ?? 0,
  }))
}

function getPointerPosition(event) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}


function hexToRgb(hex) {
  const v = hex.replace('#', '')
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function setColorFromHex(hex) {
  const { r, g, b } = hexToRgb(hex)
  colorR.value = r
  colorG.value = g
  colorB.value = b
  if (colorRValue) colorRValue.value = r
  if (colorGValue) colorGValue.value = g
  if (colorBValue) colorBValue.value = b
  colorInput.value = hex
  updateRgbSliderGradients()
  if (colorPreviewSwatch) colorPreviewSwatch.style.background = hex
}

function updateRgbSliderGradients() {
  const r = Number(colorR.value)
  const g = Number(colorG.value)
  const b = Number(colorB.value)
  colorR.style.setProperty('--slider-bg', `linear-gradient(to right, rgb(0,${g},${b}), rgb(255,${g},${b}))`)
  colorG.style.setProperty('--slider-bg', `linear-gradient(to right, rgb(${r},0,${b}), rgb(${r},255,${b}))`)
  colorB.style.setProperty('--slider-bg', `linear-gradient(to right, rgb(${r},${g},0), rgb(${r},${g},255))`)
}


function updateSizePreview() {
  if (!sizePreviewCircle) return
  const r = Number(sizeInput.value) / 2
  sizePreviewCircle.setAttribute('r', r)
  sizePreviewCircle.setAttribute('fill', colorInput.value)
}

function openCreateDialog() {
  editingId = null
  dialogTitle.textContent = '考えを追加'
  deleteThoughtButton.hidden = true
  if (duplicateThoughtButton) duplicateThoughtButton.hidden = true
  form.reset()
  colorInput.value = DEFAULT_COLOR
  sizeInput.value = DEFAULT_SIZE
  setColorFromHex(DEFAULT_COLOR)
  updateSizePreview()
  dialog.showModal()
  titleInput.focus()
}

function openEditDialog(id) {
  const thought = thoughts.find(item => item.id === id)
  if (!thought) return

  editingId = thought.id
  dialogTitle.textContent = '考えを編集'
  deleteThoughtButton.hidden = false
  if (duplicateThoughtButton) duplicateThoughtButton.hidden = false
  titleInput.value = thought.title
  noteInput.value = thought.note
  colorInput.value = thought.color
  sizeInput.value = thought.radius
  setColorFromHex(thought.color)
  updateSizePreview()
  dialog.showModal()
  titleInput.focus()
}

function closeDialog() {
  editingId = null
  dialog.close()
}

function updateThoughtFromForm() {
  const title = titleInput.value.trim()
  const note = noteInput.value.trim()
  const color = colorInput.value
  const radius = Number(sizeInput.value)

  if (editingId) {
    thoughts = thoughts.map(thought =>
      thought.id === editingId
        ? {
            ...thought,
            title,
            note,
            color,
            hue: hexToHue(color),
            radius,
          }
        : thought,
    )
  } else {
    thoughts.push(createThought(title, note, color, radius))
  }

  saveThoughts()
}

function openMenu() {
  actionMenu.hidden = false
  menuButton.setAttribute('aria-expanded', 'true')
  const firstItem = actionMenu.querySelector('button, [href]')
  if (firstItem) firstItem.focus()
}

function closeMenu() {
  actionMenu.hidden = true
  menuButton.setAttribute('aria-expanded', 'false')
  menuButton.focus()
}

menuButton.addEventListener('click', event => {
  event.stopPropagation()
  if (actionMenu.hidden) openMenu()
  else closeMenu()
})

document.addEventListener('click', () => closeMenu())

actionMenu.addEventListener('click', event => {
  event.stopPropagation()
})

blendModeButton.addEventListener('click', () => {
  if (isBlendMode) exitBlendMode()
  else enterBlendMode()
})

addThoughtButton.addEventListener('click', openCreateDialog)
emptyStateAddButton.addEventListener('click', openCreateDialog)
closeDialogButton.addEventListener('click', closeDialog)
exportButton.addEventListener('click', () => { closeMenu(); exportThoughts() })
importButton.addEventListener('click', () => { closeMenu(); importFile.click() })
importFile.addEventListener('change', event => importThoughts(event.target.files?.[0]))
checkUpdateButton.addEventListener('click', () => { closeMenu(); checkForUpdate() })

form.addEventListener('submit', event => {
  event.preventDefault()
  const isFirst = thoughts.length === 0
  updateThoughtFromForm()
  closeDialog()
  if (isFirst && !localStorage.getItem(HINT_SHOWN_KEY)) {
    localStorage.setItem(HINT_SHOWN_KEY, '1')
    showStatus('円をタップして編集・削除できます')
  }
})


;[colorR, colorG, colorB].forEach(slider => {
  slider.addEventListener('input', () => {
    const r = Number(colorR.value)
    const g = Number(colorG.value)
    const b = Number(colorB.value)
    const hex = rgbToHex(r, g, b)
    colorInput.value = hex
    if (colorRValue) colorRValue.value = r
    if (colorGValue) colorGValue.value = g
    if (colorBValue) colorBValue.value = b
    if (colorPreviewSwatch) colorPreviewSwatch.style.background = hex
    updateRgbSliderGradients()
    updateSizePreview()
  })
})

sizeInput.addEventListener('input', updateSizePreview)


// --- アクションメニュー ---
function positionPopup(el, canvasX, canvasY) {
  const rect = canvas.getBoundingClientRect()
  const margin = 8
  el.hidden = false
  // 一時表示してサイズ計測
  el.style.left = '0px'
  el.style.top = '0px'
  const w = el.offsetWidth
  const h = el.offsetHeight
  let left = rect.left + canvasX + 8
  let top = rect.top + canvasY - h / 2
  if (left + w > window.innerWidth - margin) left = rect.left + canvasX - w - 8
  if (top < margin) top = margin
  if (top + h > window.innerHeight - margin) top = window.innerHeight - margin - h
  el.style.left = left + 'px'
  el.style.top = top + 'px'
}

function openCircleActionMenu(id, x, y) {
  closeBlendPopup()
  actionMenuTargetId = id
  positionPopup(circleActionMenu, x, y)
}

function closeCircleActionMenu() {
  circleActionMenu.hidden = true
  actionMenuTargetId = null
}

function openBlendPopup(idA, idB, x, y) {
  closeCircleActionMenu()
  blendPopupIds = [idA, idB]
  positionPopup(blendPopup, x, y)
  clearTimeout(blendPopupTimer)
  blendPopupTimer = setTimeout(closeBlendPopup, 5000)
}

function closeBlendPopup() {
  blendPopup.hidden = true
  blendPopupIds = null
  clearTimeout(blendPopupTimer)
  blendPopupTimer = null
}

circleEditButton.addEventListener('click', () => {
  const id = actionMenuTargetId
  closeCircleActionMenu()
  if (id) openEditDialog(id)
})

circleDeleteButton.addEventListener('click', () => {
  const id = actionMenuTargetId
  closeCircleActionMenu()
  if (!id) return
  const thought = thoughts.find(t => t.id === id)
  showConfirm(`「${thought?.title || '円'}」を削除しますか？`, () => {
    thoughts = thoughts.filter(t => t.id !== id)
    saveThoughts()
  })
})

blendPopupConfirm.addEventListener('click', () => {
  if (!blendPopupIds) return
  const [a, b] = blendPopupIds.map(id => thoughts.find(t => t.id === id))
  if (a && b) {
    blendHues(a, b)
    saveThoughts()
    showStatus('色を近づけました')
  }
  closeBlendPopup()
})

blendPopupCancel.addEventListener('click', closeBlendPopup)
// --- アクションメニューここまで ---

// --- ドラッグ移動 ---
const DRAG_THRESHOLD = 6

canvas.addEventListener('pointerdown', event => {
  // 既に別の指でドラッグ・引力操作中なら、追加の指の入力は無視する（座標ずれ防止）
  if (activePointerId !== null && activePointerId !== event.pointerId) return
  activePointerId = event.pointerId

  // タップ開始時にポップアップを閉じる
  closeCircleActionMenu()
  closeBlendPopup()
  const pointer = getPointerPosition(event)
  const found = [...thoughts].reverse().find(thought =>
    Math.hypot(pointer.x - thought.x, pointer.y - thought.y) <= thought.radius
  )
  if (!found) {
    // 空白タッチ: 指を押している間ずっと引き寄せる
    attractionX = pointer.x
    attractionY = pointer.y
    attractionStrength = 1.0
    isAttracting = true
    canvas.setPointerCapture(event.pointerId)
    return
  }
  if (isBlendMode) {
    if (selectedIds.includes(found.id)) {
      showStatus('同じ円は選べません')
      return
    }
    selectedIds = [...selectedIds, found.id]
    if (selectedIds.length === 1) {
      showStatus('もう1つの円をタップしてください')
    }
    if (selectedIds.length === 2) {
      const [a, b] = selectedIds.map(id => thoughts.find(t => t.id === id))
      blendHues(a, b)
      saveThoughts()
      exitBlendMode()
      showStatus('色を近づけました')
    }
    return
  }
  draggingId = found.id
  dragOffsetX = pointer.x - found.x
  dragOffsetY = pointer.y - found.y
  dragMoved = false
  canvas.setPointerCapture(event.pointerId)
})

canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== activePointerId) return
  if (isAttracting) {
    const pointer = getPointerPosition(event)
    attractionX = pointer.x
    attractionY = pointer.y
    return
  }
  if (!draggingId) return
  const pointer = getPointerPosition(event)
  const thought = thoughts.find(t => t.id === draggingId)
  if (!thought) return
  const dx = pointer.x - dragOffsetX - thought.x
  const dy = pointer.y - dragOffsetY - thought.y
  if (Math.hypot(dx, dy) > DRAG_THRESHOLD) dragMoved = true
  thought.x = pointer.x - dragOffsetX
  thought.y = pointer.y - dragOffsetY
  thought.vx = 0
  thought.vy = 0
})

canvas.addEventListener('pointerup', event => {
  if (event.pointerId !== activePointerId) return
  activePointerId = null
  if (isAttracting) {
    isAttracting = false
    return
  }
  if (!draggingId) return
  const moved = dragMoved
  const id = draggingId
  const thought = thoughts.find(t => t.id === id)
  draggingId = null
  dragMoved = false

  if (!moved) {
    // タップ: アクションメニューを表示
    closeBlendPopup()
    if (thought) openCircleActionMenu(id, thought.x, thought.y)
    return
  }

  // ドラッグ完了: 別の円との重なりを検出
  if (thought) {
    const overlapping = thoughts.find(other =>
      other.id !== id &&
      Math.hypot(other.x - thought.x, other.y - thought.y) < other.radius + thought.radius
    )
    if (overlapping) {
      const midX = (thought.x + overlapping.x) / 2
      const midY = (thought.y + overlapping.y) / 2
      openBlendPopup(id, overlapping.id, midX, midY)
    }
  }
  saveThoughts()
})

canvas.addEventListener('pointercancel', event => {
  if (event.pointerId !== activePointerId) return
  activePointerId = null
  isAttracting = false
  draggingId = null
  dragMoved = false
})
// --- ドラッグ移動ここまで ---


deleteThoughtButton.addEventListener('click', () => {
  if (!editingId) return
  const thought = thoughts.find(t => t.id === editingId)
  showConfirm(`「${thought?.title || '円'}」を削除しますか？`, () => {
    thoughts = thoughts.filter(thought => thought.id !== editingId)
    saveThoughts()
    closeDialog()
  })
})

if (duplicateThoughtButton) {
  duplicateThoughtButton.addEventListener('click', () => {
    if (!editingId) return
    const original = thoughts.find(t => t.id === editingId)
    if (!original) return
    const copy = {
      ...original,
      id: crypto.randomUUID(),
      x: original.x + original.radius + 8,
      y: original.y + original.radius + 8,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
    }
    thoughts.push(copy)
    saveThoughts()
    closeDialog()
    showStatus('複製しました')
  })
}

dialog.addEventListener('click', event => {
  // フォーム領域外（バックドロップ相当）のクリックでダイアログを閉じる
  // 座標計算はボトムシートで不安定なため event.target で判定する
  if (!form.contains(event.target)) closeDialog()
})

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!circleActionMenu.hidden) { closeCircleActionMenu(); return }
    if (!blendPopup.hidden) { closeBlendPopup(); return }
    if (!actionMenu.hidden) { closeMenu(); return }
    if (isBlendMode) exitBlendMode()
  }
})

window.addEventListener('resize', resizeCanvas)
// iOS Safari では orientationchange のタイミングが resize と異なるため個別に登録
window.addEventListener('orientationchange', () => {
  // orientationchange 直後はまだレイアウトが確定していないため遅延実行
  setTimeout(resizeCanvas, 100)
})


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
}

normalizeThoughts()
resizeCanvas()
setColorFromHex(DEFAULT_COLOR)
updateEmptyStateA11y()
animationFrame = requestAnimationFrame(tick)

window.addEventListener('beforeunload', () => {
  if (animationFrame) cancelAnimationFrame(animationFrame)
})
