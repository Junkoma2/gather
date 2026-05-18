const STORAGE_KEY = 'gather-thoughts'
const DEFAULT_COLOR = '#7fb7be'
const DEFAULT_SIZE = 32

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

let thoughts = loadThoughts()
let editingId = null
let width = 0
let height = 0
let animationFrame = null

function loadThoughts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
}

function saveThoughts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(thoughts))
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

function draw() {
  ctx.clearRect(0, 0, width, height)

  thoughts.forEach(thought => {
    const isEditing = thought.id === editingId
    ctx.beginPath()
    ctx.arc(thought.x, thought.y, thought.radius, 0, Math.PI * 2)
    ctx.fillStyle = thought.color
    ctx.globalAlpha = isEditing ? 0.72 : 0.52
    ctx.fill()
    ctx.globalAlpha = 1

    if (isEditing) {
      ctx.lineWidth = 2
      ctx.strokeStyle = '#172033'
      ctx.stroke()
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
  colorSwatches.forEach(swatch => {
    swatch.classList.toggle('is-selected', swatch.dataset.color === color.toLowerCase())
  })
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

addThoughtButton.addEventListener('click', openCreateDialog)
closeDialogButton.addEventListener('click', closeDialog)
exportButton.addEventListener('click', exportThoughts)
importButton.addEventListener('click', () => importFile.click())
importFile.addEventListener('change', event => importThoughts(event.target.files?.[0]))
checkUpdateButton.addEventListener('click', checkForUpdate)

form.addEventListener('submit', event => {
  event.preventDefault()
  updateThoughtFromForm()
  closeDialog()
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

  if (found) openEditDialog(found.id)
})

deleteThoughtButton.addEventListener('click', () => {
  if (!editingId) return
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

window.addEventListener('resize', resizeCanvas)

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
