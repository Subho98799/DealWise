export function watchServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return
    reloading = true
    window.location.reload()
  })

  const checkForUpdate = () => {
    if (document.visibilityState !== 'visible') return
    void navigator.serviceWorker.getRegistration('/')
      .then((registration) => registration?.update())
      .catch(() => undefined)
  }

  document.addEventListener('visibilitychange', checkForUpdate)
  window.addEventListener('online', checkForUpdate)
}
