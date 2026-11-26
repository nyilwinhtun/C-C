"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { t } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"

export interface FileDropzoneProps {
  /** Accepted extensions / MIME types, e.g. [".jpg", ".png", "image/*"]. Empty = accept all. */
  accept?: string[]
  /** Called with the accepted files (single file unless `multiple`). */
  onFiles: (files: File[]) => void
  multiple?: boolean
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

export function matchesAccept(file: File, accept: string[] | undefined): boolean {
  if (!accept || accept.length === 0) return true
  const name = file.name.toLowerCase()
  const type = (file.type || "").toLowerCase()
  return accept.some((rule) => {
    const r = rule.trim().toLowerCase()
    if (!r) return false
    if (r.startsWith(".")) return name.endsWith(r)
    if (r.endsWith("/*")) return type.startsWith(r.slice(0, -1))
    return type === r
  })
}

function hasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files")
}

export function FileDropzone({
  accept,
  onFiles,
  multiple = false,
  disabled = false,
  className,
  children,
}: FileDropzoneProps) {
  const language = useUIStore((s) => s.language)
  const counterRef = useRef(0)
  const [isOver, setIsOver] = useState(false)

  const reset = useCallback(() => {
    counterRef.current = 0
    setIsOver(false)
  }, [])

  const onDragEnter = (e: React.DragEvent) => {
    if (disabled || !hasFiles(e)) return
    e.preventDefault()
    counterRef.current += 1
    setIsOver(true)
  }

  const onDragOver = (e: React.DragEvent) => {
    if (disabled || !hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }

  const onDragLeave = (e: React.DragEvent) => {
    if (disabled || !hasFiles(e)) return
    counterRef.current = Math.max(0, counterRef.current - 1)
    if (counterRef.current === 0) setIsOver(false)
  }

  const onDrop = (e: React.DragEvent) => {
    if (disabled || !hasFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    reset()
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length === 0) return
    const valid = dropped.filter((f) => matchesAccept(f, accept))
    if (valid.length === 0) {
      toast.error(t(language, "dropzone.unsupported"))
      return
    }
    onFiles(multiple ? valid : valid.slice(0, 1))
  }

  return (
    <div
      className={cn("relative rounded-2xl transition-colors", className)}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
      {isOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#18181B] dark:border-[#FAF8F5] bg-[#FAF8F5]/85 dark:bg-[#18181B]/85"
        >
          <span className="rounded-full bg-[#18181B] dark:bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#FAF8F5] dark:text-[#18181B] shadow-lg font-myanmar">
            {t(language, "dropzone.dropHere")}
          </span>
        </div>
      )}
    </div>
  )
}
