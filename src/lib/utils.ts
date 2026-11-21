import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

let tapticLabelEl: HTMLLabelElement | null = null

function triggerIosTapticSwitch(): void {
  if (typeof document === 'undefined' || !document.body) return
  try {
    if (!tapticLabelEl || !document.body.contains(tapticLabelEl)) {
      const label = document.createElement('label')
      label.setAttribute('aria-hidden', 'true')
      label.style.position = 'fixed'
      label.style.left = '-9999px'
      label.style.top = '-9999px'
      label.style.width = '1px'
      label.style.height = '1px'
      label.style.opacity = '0'
      label.style.pointerEvents = 'none'

      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      input.tabIndex = -1
      input.setAttribute('aria-hidden', 'true')

      label.appendChild(input)
      document.body.appendChild(label)
      tapticLabelEl = label
    }
    tapticLabelEl.click()
  } catch {
    // Ignore taptic fallback errors in restricted contexts
  }
}

/**
 * Lightweight tactile haptic feedback for iOS/Android webviews & PWAs.
 * Uses navigator.vibrate on Android/Desktop and iOS 18+ hidden <input type="checkbox" switch> taptic fallback.
 */
export function triggerHaptic(duration = 10): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      const vibrated = navigator.vibrate(duration)
      if (vibrated) return
    } catch {
      // Fall through to iOS taptic switch fallback
    }
  }
  triggerIosTapticSwitch()
}
