import { registerSW } from "virtual:pwa-register"

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000

let initialized = false

/**
 * Registers the PWA Service Worker with automatic background update checks
 * (on startup, on app resume via visibilitychange, and every 15 minutes)
 * and reloads seamlessly once when a new Service Worker takes control.
 * Local user data in localStorage/IndexedDB is never cleared.
 */
export function initPwaAutoUpdate(): void {
  if (initialized) return
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
  initialized = true

  let hasReloaded = false
  let hadController = Boolean(navigator.serviceWorker.controller)

  const triggerSafeReload = () => {
    if (hasReloaded) return
    hasReloaded = true
    window.location.reload()
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true
      return
    }
    triggerSafeReload()
  })

  registerSW({
    immediate: true,
    onNeedReload: triggerSafeReload,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      let isChecking = false
      const checkForUpdate = async () => {
        if (isChecking) return
        if (navigator.onLine === false) return
        isChecking = true
        try {
          await registration.update()
        } catch {
          // Ignore transient offline/network errors during update checks
        } finally {
          isChecking = false
        }
      }

      // 1. Check immediately on startup
      void checkForUpdate()

      // 2. Check whenever the user returns to the installed PWA
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          void checkForUpdate()
        }
      })

      // 3. Check periodically while the app stays open (every 15 minutes)
      window.setInterval(() => {
        void checkForUpdate()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })
}
