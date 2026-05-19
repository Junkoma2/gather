const STORAGE_KEY = 'gather-thoughts'
const HINT_SHOWN_KEY = 'gather-hint-shown'

const statusMessage = document.createElement('div')
statusMessage.className = 'status-message'
statusMessage.setAttribute('aria-live', 'polite')
document.body.appendChild(statusMessage)

function showStatus(message) {
  statusMessage.textContent = message
  window.clearTimeout(showStatus.timer)
  showStatus.timer = window.setTimeout(() => {
    statusMessage.textContent = ''
  }, 3200)
}

const form = document.querySelector('#thought-form')
const titleInput = document.querySelector('#title-input')
const noteInput = document.querySelector('#note-input')
const colorInput = document.querySelector('#color-input')
const sizeInput = document.querySelector('#size-input')
const canvas = document.querySelector('#gather-canvas')
const ctx = canvas.getContext('2d')

const emptyDetail = document.querySelector('#empty-detail')
const thoughtDetail = document.querySelector('#thought-detail')
const detailColor = document.querySelector('#detail-color')
const detailTitle = document.querySelector('#detail-title')
const detailNote = document.querySelector('#detail-note')
const detailSize = document.querySelector('#detail-size')
const deleteThought = document.querySelector('#delete-thought')

let thoughts = loadThoughts()
let selectedId = null
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

function addThought(title, note, color, size) {
  thoughts.push({
    id: crypto.randomUUID(),
    title,
    note,
    color,
    hue: hexToHue(color),
    radius: Number(size),
    x: width / 2 + (Math.random() - 0.5) * 120,
    y: height / 2 + (Math.random() - 0.5) * 120,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
  })
  saveThoughts()
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
    a.vx += centerDx * 0.00003
    a.vy += centerDy * 0.00003
  }

  thoughts.forEach(thought => {
    thought.vx *= 0.985
    thought.vy *= 0.985
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
    ctx.beginPath()
    ctx.arc(thought.x, thought.y, thought.radius, 0, Math.PI * 2)
    ctx.fillStyle = thought.color
    ctx.globalAlpha = thought.id === selectedId ? 0.96 : 0.82
    ctx.fill()
    ctx.globalAlpha = 1

    if (thought.id === selectedId) {
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

function showDetail(id) {
  const thought = thoughts.find(item => item.id === id)
  selectedId = thought?.id ?? null

  if (!thought) {
    emptyDetail.hidden = false
    thoughtDetail.hidden = true
    return
  }

  emptyDetail.hidden = true
  thoughtDetail.hidden = false
  detailColor.style.background = thought.color
  detailTitle.textContent = thought.title
  detailNote.textContent = thought.note || 'メモなし'
  detailSize.textContent = thought.radius
}

function normalizeThoughts() {
  thoughts = thoughts.map(thought => ({
    ...thought,
    hue: thought.hue ?? hexToHue(thought.color),
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

form.addEventListener('submit', event => {
  event.preventDefault()
  const isFirst = thoughts.length === 0
  addThought(
    titleInput.value.trim(),
    noteInput.value.trim(),
    colorInput.value,
    sizeInput.value,
  )
  form.reset()
  colorInput.value = '#5b7cfa'
  sizeInput.value = '32'
  titleInput.focus()

  if (isFirst && !localStorage.getItem(HINT_SHOWN_KEY)) {
    localStorage.setItem(HINT_SHOWN_KEY, '1')
    showStatus('円をタップすると内容を確認・編集できます')
  }
})

canvas.addEventListener('click', event => {
  const pointer = getPointerPosition(event)
  const found = [...thoughts].reverse().find(thought => {
    return Math.hypot(pointer.x - thought.x, pointer.y - thought.y) <= thought.radius
  })
  showDetail(found?.id ?? null)
})

deleteThought.addEventListener('click', () => {
  if (!selectedId) return
  thoughts = thoughts.filter(thought => thought.id !== selectedId)
  selectedId = null
  saveThoughts()
  showDetail(null)
})

window.addEventListener('resize', resizeCanvas)

normalizeThoughts()
resizeCanvas()
showDetail(null)
animationFrame = requestAnimationFrame(tick)

window.addEventListener('beforeunload', () => {
  if (animationFrame) cancelAnimationFrame(animationFrame)
})
