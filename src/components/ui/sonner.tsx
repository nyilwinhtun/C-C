"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { AlertCircle, CheckCircle2, Info, Loader2, AlertTriangle } from "lucide-react"
import { cn, triggerHaptic } from "@/lib/utils"

export interface Action {
  label: string
  onClick: () => void
}

type ToastType = "default" | "success" | "error" | "info" | "warning" | "loading"

interface ToastOptions {
  duration?: number
  description?: string
  action?: Action
  id?: string | number
}

interface IslandToastItem {
  id: string
  type: ToastType
  message: string
  description?: string
  duration: number
}

type Listener = () => void

let currentToast: IslandToastItem | null = null
let toastCounter = 0
let dismissTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<Listener>()

function emitChange() {
  listeners.forEach((listener) => listener())
}

function showIslandToast(type: ToastType, message: unknown, options?: ToastOptions): string {
  const id = String(options?.id ?? ++toastCounter)
  const duration = options?.duration ?? (type === "loading" ? 15000 : type === "error" ? 4200 : 2800)

  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }

  currentToast = {
    id,
    type,
    message: typeof message === "string" ? message : String(message ?? ""),
    description: options?.description,
    duration,
  }

  if (type === "success") {
    triggerHaptic(10)
  } else if (type === "error") {
    triggerHaptic(18)
  }

  emitChange()

  if (duration > 0 && type !== "loading") {
    dismissTimer = setTimeout(() => {
      if (currentToast?.id === id) {
        currentToast = null
        emitChange()
      }
    }, duration)
  }

  return id
}

function dismissIslandToast(id?: string | number) {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
  if (!id || currentToast?.id === String(id)) {
    currentToast = null
    emitChange()
  }
}

export const toast = Object.assign(
  (message: string, options?: ToastOptions) => showIslandToast("default", message, options),
  {
    success: (message: string, options?: ToastOptions) => showIslandToast("success", message, options),
    error: (message: string, options?: ToastOptions) => showIslandToast("error", message, options),
    info: (message: string, options?: ToastOptions) => showIslandToast("info", message, options),
    warning: (message: string, options?: ToastOptions) => showIslandToast("warning", message, options),
    loading: (message: string, options?: ToastOptions) => showIslandToast("loading", message, options),
    dismiss: (id?: string | number) => dismissIslandToast(id),
  }
)

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return currentToast
}

export function Toaster(_props: Record<string, unknown>) {
  const active = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (active) {
      setExiting(false)
    }
  }, [active])

  if (!active) return null

  const renderIcon = () => {
    switch (active.type) {
      case "success":
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        )
      case "error":
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        )
      case "warning":
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        )
      case "loading":
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
          </span>
        )
      case "info":
      default:
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A84FF]/25 text-[#0A84FF]">
            <Info className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        )
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => {
        setExiting(true)
        setTimeout(() => dismissIslandToast(active.id), 150)
      }}
      className={cn(
        "fixed top-3 left-1/2 z-[100] flex max-w-[min(92vw,420px)] items-center gap-2.5 rounded-full bg-black px-3.5 py-2 text-white shadow-[0_10px_32px_rgba(0,0,0,0.42)] ring-1 ring-white/15 cursor-pointer select-none animate-dynamic-island transition-all duration-150",
        exiting && "opacity-0 scale-90"
      )}
    >
      {renderIcon()}
      <div className="min-w-0 pr-1">
        <p className="text-xs sm:text-[13px] font-medium leading-snug tracking-tight font-myanmar truncate">
          {active.message}
        </p>
        {active.description && (
          <p className="text-[11px] text-neutral-400 leading-tight truncate font-myanmar">
            {active.description}
          </p>
        )}
      </div>
    </div>
  )
}
