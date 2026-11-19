import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Lightweight tactile haptic feedback for iOS/Android webviews & PWAs.
 */
export function triggerHaptic(duration = 10): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(duration)
    } catch {
      // Ignore vibration errors in restricted contexts
    }
  }
}
