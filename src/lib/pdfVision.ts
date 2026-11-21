import * as pdfjsLib from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface RenderedPdfPageImage {
  pageNumber: number
  mimeType: "image/jpeg"
  base64Data: string
}

const MAX_RENDER_WIDTH_PX = 1600
const DEFAULT_RENDER_SCALE = 1.8

/**
 * Load a PDF file and return its total page count without extracting raw text.
 */
export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise
  try {
    return pdf.numPages
  } finally {
    await loadingTask.destroy()
  }
}

/**
 * Render a selected PDF page range into clean JPEG base64 images so Gemini Vision
 * can read the visual glyphs directly and bypass broken Zawgyi/legacy font encodings.
 */
export async function renderPdfPagesToImages(
  file: File,
  startPage: number,
  endPage: number
): Promise<RenderedPdfPageImage[]> {
  if (typeof document === "undefined") {
    throw new Error("PDF rendering is only supported in the browser.")
  }

  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise

  try {
    const safeStart = Math.max(1, Math.min(pdf.numPages, Math.floor(startPage)))
    const safeEnd = Math.max(safeStart, Math.min(pdf.numPages, Math.floor(endPage)))
    const images: RenderedPdfPageImage[] = []

    for (let pageNum = safeStart; pageNum <= safeEnd; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      const baseViewport = page.getViewport({ scale: 1 })
      const widthCappedScale =
        baseViewport.width > 0
          ? Math.min(DEFAULT_RENDER_SCALE, MAX_RENDER_WIDTH_PX / baseViewport.width)
          : DEFAULT_RENDER_SCALE
      const viewport = page.getViewport({ scale: Math.max(1, widthCappedScale) })

      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        throw new Error("Could not initialize 2D canvas for PDF rendering.")
      }

      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
      }).promise

      const dataUrl = canvas.toDataURL("image/jpeg", 0.88)
      const base64Data = dataUrl.split(",")[1] ?? ""

      // Release canvas backing store immediately for mobile Safari memory safety
      canvas.width = 0
      canvas.height = 0
      page.cleanup()

      if (base64Data) {
        images.push({
          pageNumber: pageNum,
          mimeType: "image/jpeg",
          base64Data,
        })
      }
    }

    if (images.length === 0) {
      throw new Error("No pages could be rendered from this PDF.")
    }

    return images
  } finally {
    await loadingTask.destroy()
  }
}
