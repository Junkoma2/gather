window.APP_VERSION = '20260607-01'

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-app-version]').forEach((element) => {
    element.textContent = window.APP_VERSION
  })
})
