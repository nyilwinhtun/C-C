import { toast } from "@/components/ui/sonner"
import { t, type Locale } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"

export interface ShareMediaFileOptions {
  blob: Blob
  filename: string
  title?: string
  captionText?: string
  /** Optional explicit MIME type override (normalized automatically). */
  mimeType?: string
  /** Optional locale override for toasts (defaults to current UI language). */
  language?: Locale
  /** Whether to show confirmation toasts automatically (default: true). */
  showToast?: boolean
}

export interface ShareMediaFileResult {
  status: "shared" | "fallback_downloaded" | "cancelled"
  captionCopied: boolean
}

const BLOB_REVOKE_DELAY_MS = 60_000

/**
 * Resolves a clean MIME type without codec parameters (e.g. `video/mp4`,
 * `video/webm`, `image/png`) so mobile Web Share targets accept the File.
 */
function resolveExplicitMimeType(
  blob: Blob,
  filename: string,
  mimeTypeOverride?: string
): string {
  const raw = (mimeTypeOverride || blob.type || "").toLowerCase().split(";")[0].trim()
  if (raw === "image/png" || raw === "video/mp4" || raw === "video/webm") {
    return raw
  }
  const lowerName = filename.toLowerCase()
  if (lowerName.endsWith(".mp4") || lowerName.endsWith(".m4v")) {
    return "video/mp4"
  }
  if (lowerName.endsWith(".webm")) {
    return "video/webm"
  }
  if (lowerName.endsWith(".png")) {
    return "image/png"
  }
  if (raw) {
    return raw
  }
  return "application/octet-stream"
}

/**
 * Copies caption text to clipboard if available, silently returning false on failure.
 */
async function copyCaptionToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Triggers a browser file download with a 60-second blob URL cleanup delay so
 * mobile Safari/Chrome download managers finish saving before revocation.
 */
function triggerFallbackDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_DELAY_MS)
}

/**
 * Converts an HTMLCanvasElement to a high-quality PNG Blob.
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === "function") {
      try {
        canvas.toBlob((blob) => resolve(blob), "image/png", 1.0)
        return
      } catch {
        // Fall through to dataURL fallback
      }
    }
    try {
      const dataUrl = canvas.toDataURL("image/png")
      const parts = dataUrl.split(",")
      if (parts.length < 2) {
        resolve(null)
        return
      }
      const binary = atob(parts[1])
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      resolve(new Blob([bytes], { type: "image/png" }))
    } catch {
      resolve(null)
    }
  })
}

/**
 * Unified 1-Tap Native Mobile Share helper for images and videos.
 *
 * 1. Copies `captionText` (if provided) to clipboard first so users can immediately
 *    paste their Myanmar/English sales caption inside Facebook, Messenger, Viber, or TikTok.
 * 2. Wraps `blob` in a `File` with an explicit MIME type (`image/png`, `video/mp4`, `video/webm`).
 * 3. Uses `navigator.canShare({ files: [file] })` + `navigator.share(...)` when supported.
 * 4. Gracefully ignores user-cancelled shares (`AbortError`) without error toasts.
 * 5. On desktop or unsupported browsers, falls back to downloading the file (60s URL cleanup)
 *    and displays a confirmation toast.
 */
export async function shareMediaFile({
  blob,
  filename,
  title,
  captionText,
  mimeType,
  language,
  showToast = true,
}: ShareMediaFileOptions): Promise<ShareMediaFileResult> {
  const lang: Locale = language ?? useUIStore.getState().language
  const trimmedCaption = captionText?.trim() ?? ""
  const trimmedTitle = title?.trim() ?? ""
  const explicitMimeType = resolveExplicitMimeType(blob, filename, mimeType)

  // Always copy caption first so users can paste immediately in Facebook/TikTok/Viber
  const captionCopied = trimmedCaption
    ? await copyCaptionToClipboard(trimmedCaption)
    : false

  const file = new File([blob], filename, { type: explicitMimeType })

  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    (() => {
      try {
        return navigator.canShare({ files: [file] })
      } catch {
        return false
      }
    })()

  if (canShareFiles) {
    try {
      const shareData: ShareData = {
        files: [file],
        ...(trimmedTitle ? { title: trimmedTitle } : {}),
        ...(trimmedCaption ? { text: trimmedCaption } : {}),
      }
      await navigator.share(shareData)
      if (showToast) {
        toast.success(
          t(
            lang,
            captionCopied
              ? "nativeShare.sharedWithCaption"
              : "nativeShare.shared"
          )
        )
      }
      return { status: "shared", captionCopied }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled the native share sheet — exit silently
        return { status: "cancelled", captionCopied }
      }
      // Other share failures fall through to the download fallback below
    }
  }

  // Fallback for desktop or browsers without native file share
  triggerFallbackDownload(blob, filename)
  if (showToast) {
    toast.success(
      t(
        lang,
        captionCopied
          ? "nativeShare.fallbackSavedWithCaption"
          : "nativeShare.fallbackSaved"
      )
    )
  }
  return { status: "fallback_downloaded", captionCopied }
}
