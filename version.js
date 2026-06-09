const APP_VERSION = '20260607-01'

if (typeof window !== 'undefined') {
  window.APP_VERSION = APP_VERSION

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-app-version]').forEach((element) => {
      element.textContent = APP_VERSION
    })
  })
}
