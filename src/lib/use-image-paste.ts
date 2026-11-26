import { useEffect, useRef } from "react"
import { toast } from "@/components/ui/sonner"

/**
 * Listens for Cmd+V / Ctrl+V clipboard image pastes on the document.
 * Ignored while focus is inside an input, textarea, select or contenteditable.
 */
export function useImagePaste(
  onImage: (file: File) => void,
  options: { enabled?: boolean; message: string }
) {
  const handlerRef = useRef(onImage)
  handlerRef.current = onImage
  const enabled = options.enabled ?? true
  const message = options.message

  useEffect(() => {
    if (!enabled) return
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return
      }
      const items = Array.from(e.clipboardData?.items ?? [])
      const item = items.find((i) => i.kind === "file" && i.type.startsWith("image/"))
      const file = item?.getAsFile()
      if (!file) return
      e.preventDefault()
      const named =
        file.name && file.name !== "image.png"
          ? file
          : new File([file], `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`, {
              type: file.type,
            })
      handlerRef.current(named)
      toast.success(message)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [enabled, message])
}
