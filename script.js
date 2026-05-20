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
const sizeInput = document.querySelector('#size-input')
const deleteThoughtButton = document.querySelector('#delete-thought')
const colorSwatches = [...document.querySelectorAll('.color-swatch')]
const canvas = document.querySelector('#gather-canvas')
const ctx = canvas.getContext('2d')
const checkUpdateButton = document.querySelector('#check-update')
const exportButton = document.querySelector('#export-data')
const importButton = document.querySelector('#import-data')
const importFile = document.querySelector('#import-file')
const statusMessage = document.querySelector('#status-message')
const customColorPreview = document.querySelector('#custom-color-preview')
const blendModeButton = document.querySelector('#blend-mode')
const menuButton = document.querySelector('#menu-button')
const actionMenu = document.querySelector('.action-menu')

let thoughts = loadThoughts()
let editingId = null
let width = 0
let height = 0
let animationFrame = null
let isBlendMode = false
let selectedIds = []

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
}

function showStatus(message) {
  statusMessage.textContent = message
  window.clearTimeout(showStatus.timer)
  showStatus.timer = window.setTimeout(() => {
    statusMessage.textContent = ''
  }, 2600)
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
      if (!window.confirm('現在の考えを置き換えてインポートしますか？')) return
      thoughts = payload.thoughts
      normalizeThoughts()
      saveThoughts()
      showStatus('インポートしました')
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

function blendHues(thoughtA, thoughtB) {
  const strength = parseInt(document.querySelector('#blend-strength').value) / 100
  const diff = thoughtB.hue - thoughtA.hue
  const adjusted = ((diff + 540) % 360) - 180
  const newHueA = (thoughtA.hue + adjusted / 2 * strength + 360) % 360
  const newHueB = (thoughtB.hue - adjusted / 2 * strength + 360) % 360
  thoughtA.hue = newHueA
  thoughtB.hue = newHueB
  const hslA = hexToHsl(thoughtA.color)
  thoughtA.color = hslToHex(newHueA, hslA.s, hslA.l)
  const hslB = hexToHsl(thoughtB.color)
  thoughtB.color = hslToHex(newHueB, hslB.s, hslB.l)
}

function enterBlendMode() {
  closeMenu()
  isBlendMode = true
  selectedIds = []
  blendModeButton.classList.add('is-active')
  showStatus('2つの円をタップしてください')
}

function exitBlendMode() {
  showStatus('')
  isBlendMode = false
  selectedIds = []
  blendModeButton.classList.remove('is-active')
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
    a.vx += centerDx * 0.000015
    a.vy += centerDy * 0.000015
  }

  thoughts.forEach(thought => {
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

function drawEmptyState() {
  ctx.fillStyle = 'rgba(23, 32, 51, 0.28)'
  ctx.font = '15px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('+ ボタンで考えを追加できます', width / 2, height / 2)
}

function draw() {
  ctx.clearRect(0, 0, width, height)

  if (thoughts.length === 0) {
    drawEmptyState()
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

    ctx.fillStyle = '#172033'
    ctx.font = `${Math.max(11, Math.min(16, thought.radius / 2.3))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(thought.title, thought.x, thought.y)
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

function selectSwatch(color) {
  const lc = color.toLowerCase()
  colorSwatches.forEach(swatch => {
    swatch.classList.toggle('is-selected', swatch.dataset.color === lc)
  })
  const isPreset = colorSwatches.some(s => s.dataset.color === lc)
  if (customColorPreview) {
    customColorPreview.style.setProperty('--custom-color', color)
    customColorPreview.style.opacity = isPreset ? '0.4' : '1'
  }
}

function openCreateDialog() {
  editingId = null
  dialogTitle.textContent = '考えを追加'
  deleteThoughtButton.hidden = true
  form.reset()
  colorInput.value = DEFAULT_COLOR
  sizeInput.value = DEFAULT_SIZE
  selectSwatch(DEFAULT_COLOR)
  dialog.showModal()
  titleInput.focus()
}

function openEditDialog(id) {
  const thought = thoughts.find(item => item.id === id)
  if (!thought) return

  editingId = thought.id
  dialogTitle.textContent = '考えを編集'
  deleteThoughtButton.hidden = false
  titleInput.value = thought.title
  noteInput.value = thought.note
  colorInput.value = thought.color
  sizeInput.value = thought.radius
  selectSwatch(thought.color)
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
    showStatus('円をタップすると内容を確認・編集できます')
  }
})

colorSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    colorInput.value = swatch.dataset.color
    selectSwatch(swatch.dataset.color)
  })
})

colorInput.addEventListener('input', event => {
  selectSwatch(event.target.value)
})

canvas.addEventListener('click', event => {
  const pointer = getPointerPosition(event)
  const found = [...thoughts].reverse().find(thought => {
    return Math.hypot(pointer.x - thought.x, pointer.y - thought.y) <= thought.radius
  })

  if (isBlendMode) {
    if (!found) { exitBlendMode(); return }
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

  if (found) openEditDialog(found.id)
})

deleteThoughtButton.addEventListener('click', () => {
  if (!editingId) return
  const thought = thoughts.find(t => t.id === editingId)
  if (!window.confirm(`「${thought?.title || '円'}」を削除しますか？`)) return
  thoughts = thoughts.filter(thought => thought.id !== editingId)
  saveThoughts()
  closeDialog()
})

dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect()
  const isInDialog =
    rect.top <= event.clientY &&
    event.clientY <= rect.bottom &&
    rect.left <= event.clientX &&
    event.clientX <= rect.right

  if (!isInDialog) closeDialog()
})

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!actionMenu.hidden) { closeMenu(); return }
    if (isBlendMode) exitBlendMode()
  }
})

window.addEventListener('resize', resizeCanvas)

// --- 下スワイプ更新 ---
const PULL_THRESHOLD = 80
let pullStartY = null
let pullY = 0
let pullBlockedByCircle = false

const pullIndicator = document.createElement('div')
pullIndicator.className = 'pull-indicator'
pullIndicator.setAttribute('aria-live', 'polite')
document.body.prepend(pullIndicator)

function setPullIndicator(text, isComplete) {
  pullIndicator.textContent = text
  pullIndicator.classList.toggle('complete', Boolean(isComplete))
}

function updatePullIndicatorHeight(y) {
  pullIndicator.style.height = y > 0 ? (y + 'px') : ''
  pullIndicator.style.opacity = y > 0 ? String(Math.min(y / PULL_THRESHOLD, 1)) : ''
}

function hitTestCircle(clientX, clientY) {
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  return thoughts.some(thought => Math.hypot(x - thought.x, y - thought.y) <= thought.radius)
}

canvas.addEventListener('touchstart', event => {
  if (window.scrollY > 0) {
    pullBlockedByCircle = true
    return
  }
  const touch = event.touches[0]
  if (hitTestCircle(touch.clientX, touch.clientY)) {
    pullBlockedByCircle = true
    pullStartY = null
    return
  }
  pullBlockedByCircle = false
  pullStartY = touch.clientY
}, { passive: true })

canvas.addEventListener('touchmove', event => {
  if (pullStartY === null || pullBlockedByCircle) return
  const dy = event.touches[0].clientY - pullStartY
  if (dy <= 0) {
    pullStartY = null
    return
  }
  const visual = dy * 0.4
  pullY = visual <= PULL_THRESHOLD
    ? visual
    : Math.min(PULL_THRESHOLD + (visual - PULL_THRESHOLD) * 0.3, PULL_THRESHOLD + 50)
  updatePullIndicatorHeight(pullY)
  setPullIndicator(pullY >= PULL_THRESHOLD ? '放して更新' : '引っ張って更新', false)
}, { passive: true })

canvas.addEventListener('touchend', async () => {
  if (pullStartY === null || pullBlockedByCircle) {
    pullBlockedByCircle = false
    return
  }
  pullStartY = null
  if (pullY < PULL_THRESHOLD) {
    updatePullIndicatorHeight(0)
    pullY = 0
    return
  }
  pullY = 0
  setPullIndicator('更新中…', false)
  updatePullIndicatorHeight(PULL_THRESHOLD)
  await checkForUpdate()
  setPullIndicator('完了', true)
  setTimeout(() => {
    updatePullIndicatorHeight(0)
    setTimeout(() => setPullIndicator('', false), 400)
  }, 700)
})
// --- 下スワイプ更新ここまで ---

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
}

normalizeThoughts()
resizeCanvas()
selectSwatch(DEFAULT_COLOR)
animationFrame = requestAnimationFrame(tick)

window.addEventListener('beforeunload', () => {
  if (animationFrame) cancelAnimationFrame(animationFrame)
})
