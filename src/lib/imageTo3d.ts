import * as THREE from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"

export type ImageTo3dStage =
  | "preparing"
  | "generating_cloud"
  | "generating_local"
  | "ready"

export type ImageTo3dEngine = "triposr" | "instantmesh" | "local_relief"

export interface ImageTo3dProgress {
  stage: ImageTo3dStage
  percent: number
  message?: string
}

export interface ConvertImageTo3dOptions {
  /** Optional Hugging Face API token (`hf_...`) for higher ZeroGPU quota/priority */
  hfToken?: string
  /** Whether to run @imgly/background-removal before 3D conversion (default: true) */
  removeBg?: boolean
  /** Relief depth scale for local GLTFExporter fallback (default: 0.22) */
  reliefDepth?: number
  /** Optional abort signal */
  signal?: AbortSignal
  /** Progress callback */
  onProgress?: (progress: ImageTo3dProgress) => void
}

export interface ConvertImageTo3dResult {
  blob: Blob
  file: File
  fileName: string
  engine: ImageTo3dEngine
  usedFallback: boolean
  previewCutoutDataUrl: string
}

interface PreparedSubject {
  squarePngBlob: Blob
  cutoutCanvas: HTMLCanvasElement
  previewCutoutDataUrl: string
}

const HF_SPACES = [
  {
    id: "triposr" as const,
    baseUrl: "https://stabilityai-triposr.hf.space",
    endpoint: "run",
    buildArgs: (fileData: Record<string, unknown>) => [fileData, false, 0.85, 256],
  },
  {
    id: "instantmesh" as const,
    baseUrl: "https://tencentarc-instantmesh.hf.space",
    endpoint: "generate_mvs",
    buildArgs: (fileData: Record<string, unknown>) => [fileData, 75, 42],
  },
] as const

function loadImageElement(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    let objectUrl: string | null = null

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error("Could not decode image for 3D conversion."))
    }

    if (typeof source === "string") {
      img.src = source
    } else {
      objectUrl = URL.createObjectURL(source)
      img.src = objectUrl
    }
  })
}

async function sourceToBlob(source: File | Blob | string): Promise<Blob> {
  if (source instanceof Blob) return source
  const res = await fetch(source)
  if (!res.ok) throw new Error("Failed to read source image.")
  return res.blob()
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas PNG encoding failed."))
      },
      "image/png",
      0.95
    )
  })
}

/**
 * Finds the tight bounding box of non-transparent pixels in a canvas.
 */
function findOpaqueBounds(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const { data } = ctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3]
      if (alpha > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 }
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Isolates foreground subject (via @imgly/background-removal) and square-pads
 * onto a clean 512x512 canvas for both cloud Image-to-3D and local relief fallback.
 */
async function prepareImageFor3d(
  source: File | Blob | string,
  removeBg: boolean
): Promise<PreparedSubject> {
  let workingBlob = await sourceToBlob(source)

  if (removeBg) {
    try {
      const { removeBackground } = await import("@imgly/background-removal")
      workingBlob = await removeBackground(workingBlob)
    } catch (err) {
      console.warn("Background removal skipped; using original image:", err)
    }
  }

  const img = await loadImageElement(workingBlob)
  const rawCanvas = document.createElement("canvas")
  const maxInput = 768
  const rawScale = Math.min(1, maxInput / Math.max(img.width, img.height, 1))
  rawCanvas.width = Math.max(1, Math.round(img.width * rawScale))
  rawCanvas.height = Math.max(1, Math.round(img.height * rawScale))

  const rawCtx = rawCanvas.getContext("2d")
  if (!rawCtx) throw new Error("2D canvas context unavailable.")
  rawCtx.drawImage(img, 0, 0, rawCanvas.width, rawCanvas.height)

  const bounds = findOpaqueBounds(rawCtx, rawCanvas.width, rawCanvas.height)
  const cropW = Math.max(1, bounds.maxX - bounds.minX + 1)
  const cropH = Math.max(1, bounds.maxY - bounds.minY + 1)

  const targetSize = 512
  const paddingRatio = 0.82
  const fitScale = Math.min(
    (targetSize * paddingRatio) / cropW,
    (targetSize * paddingRatio) / cropH
  )
  const drawW = Math.round(cropW * fitScale)
  const drawH = Math.round(cropH * fitScale)
  const drawX = Math.round((targetSize - drawW) / 2)
  const drawY = Math.round((targetSize - drawH) / 2)

  // Transparent square cutout canvas (for preview + local 3D relief texture)
  const cutoutCanvas = document.createElement("canvas")
  cutoutCanvas.width = targetSize
  cutoutCanvas.height = targetSize
  const cutoutCtx = cutoutCanvas.getContext("2d")
  if (!cutoutCtx) throw new Error("2D canvas context unavailable.")
  cutoutCtx.drawImage(
    rawCanvas,
    bounds.minX,
    bounds.minY,
    cropW,
    cropH,
    drawX,
    drawY,
    drawW,
    drawH
  )

  // White-backed square PNG for Hugging Face TripoSR / InstantMesh
  const paddedCanvas = document.createElement("canvas")
  paddedCanvas.width = targetSize
  paddedCanvas.height = targetSize
  const paddedCtx = paddedCanvas.getContext("2d")
  if (!paddedCtx) throw new Error("2D canvas context unavailable.")
  paddedCtx.fillStyle = "#ffffff"
  paddedCtx.fillRect(0, 0, targetSize, targetSize)
  paddedCtx.drawImage(cutoutCanvas, 0, 0)

  const squarePngBlob = await canvasToPngBlob(paddedCanvas)
  const previewCutoutDataUrl = cutoutCanvas.toDataURL("image/png")

  return {
    squarePngBlob,
    cutoutCanvas,
    previewCutoutDataUrl,
  }
}

function buildAuthHeaders(hfToken?: string): Record<string, string> {
  const clean = hfToken?.trim()
  return clean ? { Authorization: `Bearer ${clean}` } : {}
}

/**
 * Extracts the first .glb (or .obj) file reference from a Gradio SSE output payload.
 */
function extractGradioModelUrl(payload: unknown, baseUrl: string): string | null {
  if (!payload) return null

  const scan = (node: unknown): string | null => {
    if (!node) return null
    if (typeof node === "string") {
      if (/\.(glb|gltf)(\?|$)/i.test(node)) {
        if (node.startsWith("http")) return node
        return `${baseUrl}/gradio_api/file=${node.replace(/^\/+/, "")}`
      }
      return null
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = scan(item)
        if (found) return found
      }
      return null
    }
    if (typeof node === "object") {
      const rec = node as Record<string, unknown>
      if (typeof rec.url === "string" && /\.(glb|gltf)(\?|$)/i.test(rec.url)) {
        return rec.url
      }
      if (typeof rec.path === "string" && /\.(glb|gltf)(\?|$)/i.test(rec.path)) {
        return `${baseUrl}/gradio_api/file=${rec.path}`
      }
      for (const val of Object.values(rec)) {
        const found = scan(val)
        if (found) return found
      }
    }
    return null
  }

  return scan(payload)
}

/**
 * Polls a Gradio 4/5 SSE stream (`GET /gradio_api/call/<endpoint>/<event_id>`)
 * until `event: complete` or `event: error`.
 */
async function readGradioSseResult(
  sseUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<unknown> {
  const res = await fetch(sseUrl, { headers, signal })
  if (!res.ok || !res.body) {
    throw new Error(`Gradio SSE failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        const rawData = line.slice(5).trim()
        if (currentEvent === "error") {
          throw new Error(`Space error: ${rawData}`)
        }
        if (currentEvent === "complete") {
          try {
            return JSON.parse(rawData)
          } catch {
            return rawData
          }
        }
      }
    }
  }

  throw new Error("Gradio SSE stream ended before completion.")
}

async function tryHuggingFaceSpace(
  space: (typeof HF_SPACES)[number],
  pngBlob: Blob,
  hfToken?: string,
  outerSignal?: AbortSignal
): Promise<Blob> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45_000)

  const onOuterAbort = () => controller.abort()
  outerSignal?.addEventListener("abort", onOuterAbort, { once: true })

  try {
    const headers = buildAuthHeaders(hfToken)

    // 1. Upload square-padded PNG to Gradio Space
    const formData = new FormData()
    formData.append("files", pngBlob, "subject.png")

    const uploadRes = await fetch(`${space.baseUrl}/gradio_api/upload`, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    })

    if (!uploadRes.ok) {
      throw new Error(`Upload failed (${uploadRes.status})`)
    }

    const uploadedPaths = (await uploadRes.json()) as string[]
    const uploadedPath = uploadedPaths?.[0]
    if (!uploadedPath) {
      throw new Error("No file path returned from Gradio upload.")
    }

    const fileData = {
      path: uploadedPath,
      meta: { _type: "gradio.FileData" },
    }

    // 2. Enqueue ZeroGPU prediction
    const callRes = await fetch(`${space.baseUrl}/gradio_api/call/${space.endpoint}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: space.buildArgs(fileData) }),
      signal: controller.signal,
    })

    if (!callRes.ok) {
      throw new Error(`Call enqueue failed (${callRes.status})`)
    }

    const { event_id: eventId } = (await callRes.json()) as { event_id?: string }
    if (!eventId) {
      throw new Error("Missing event_id from Gradio call.")
    }

    // 3. Stream SSE result
    const output = await readGradioSseResult(
      `${space.baseUrl}/gradio_api/call/${space.endpoint}/${eventId}`,
      headers,
      controller.signal
    )

    const modelUrl = extractGradioModelUrl(output, space.baseUrl)
    if (!modelUrl) {
      throw new Error("No .glb model URL returned by Space.")
    }

    // 4. Download generated .glb
    const glbRes = await fetch(modelUrl, { headers, signal: controller.signal })
    if (!glbRes.ok) {
      throw new Error(`Failed to download .glb (${glbRes.status})`)
    }

    const glbBlob = await glbRes.blob()
    if (glbBlob.size < 128) {
      throw new Error("Downloaded .glb is unexpectedly empty.")
    }

    return new Blob([glbBlob], { type: "model/gltf-binary" })
  } finally {
    clearTimeout(timeoutId)
    outerSignal?.removeEventListener("abort", onOuterAbort)
  }
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape()
  const hw = width / 2
  const hh = height / 2
  const r = Math.min(radius, hw, hh)

  shape.moveTo(-hw + r, -hh)
  shape.lineTo(hw - r, -hh)
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r)
  shape.lineTo(hw, hh - r)
  shape.quadraticCurveTo(hw, hh, hw - r, hh)
  shape.lineTo(-hw + r, hh)
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r)
  shape.lineTo(-hw, -hh + r)
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return shape
}

function createRoundedRectPath(width: number, height: number, radius: number): THREE.Path {
  const path = new THREE.Path()
  const hw = width / 2
  const hh = height / 2
  const r = Math.min(radius, hw, hh)

  path.moveTo(-hw + r, -hh)
  path.lineTo(hw - r, -hh)
  path.quadraticCurveTo(hw, -hh, hw, -hh + r)
  path.lineTo(hw, hh - r)
  path.quadraticCurveTo(hw, hh, hw - r, hh)
  path.lineTo(-hw + r, hh)
  path.quadraticCurveTo(-hw, hh, -hw, hh - r)
  path.lineTo(-hw, -hh + r)
  path.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return path
}

function flipPlaneUvForGltf(geom: THREE.PlaneGeometry): void {
  const uv = geom.getAttribute("uv")
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, 1 - uv.getY(i))
  }
  uv.needsUpdate = true
}

function createShowcaseFrontCanvas(cutoutCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = 640
  const h = 768
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas context unavailable.")

  // Sleek studio card background with subtle radial highlight
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.38, w * 0.08, w * 0.5, h * 0.5, h * 0.72)
  bg.addColorStop(0, "#FAF8F5")
  bg.addColorStop(1, "#E7E0D5")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Subtle studio floor shadow under the subject
  ctx.save()
  ctx.fillStyle = "rgba(28, 25, 23, 0.10)"
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.84, w * 0.28, h * 0.032, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Draw crisp, un-warped subject cutout centered inside card
  const pad = 0.84
  const scale = Math.min((w * pad) / cutoutCanvas.width, (h * pad) / cutoutCanvas.height)
  const drawW = cutoutCanvas.width * scale
  const drawH = cutoutCanvas.height * scale
  const drawX = (w - drawW) / 2
  const drawY = (h - drawH) / 2

  ctx.save()
  ctx.shadowColor = "rgba(28, 25, 23, 0.22)"
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 12
  ctx.drawImage(cutoutCanvas, drawX, drawY, drawW, drawH)
  ctx.restore()

  // Subtle inner metallic-tint hairline
  ctx.strokeStyle = "rgba(212, 175, 55, 0.35)"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(14, 14, w - 28, h - 28, 42)
  ctx.stroke()

  return canvas
}

function createShowcaseBackCanvas(): HTMLCanvasElement {
  const w = 640
  const h = 768
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas context unavailable.")

  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, "#232120")
  bg.addColorStop(1, "#121110")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Gold accent border
  ctx.strokeStyle = "rgba(245, 158, 11, 0.55)"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(24, 24, w - 48, h - 48, 38)
  ctx.stroke()

  // Center studio emblem
  const cx = w / 2
  const cy = h * 0.44
  ctx.strokeStyle = "rgba(250, 204, 21, 0.85)"
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx, cy, 66, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = "#FACC15"
  ctx.font = '700 34px "Inter", system-ui, sans-serif'
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("3D", cx, cy)

  ctx.fillStyle = "#FAF8F5"
  ctx.font = '700 32px "Inter", system-ui, sans-serif'
  ctx.fillText("THE BOYS MOBILE", cx, h * 0.62)

  ctx.fillStyle = "rgba(250, 248, 245, 0.62)"
  ctx.font = '600 18px "Inter", system-ui, sans-serif'
  ctx.fillText("3D STUDIO SHOWCASE", cx, h * 0.68)

  return canvas
}

/**
 * Generates a sleek, non-distorted 3D Studio Showcase Card `.glb` model locally
 * in the browser using THREE.GLTFExporter: an extruded rounded-rectangle acrylic/glass
 * slab with metallic rim bevel, crisp un-warped front texture, and branded back face.
 * Guarantees 0-cost offline conversion even if cloud ZeroGPU Spaces are busy.
 */
export async function createLocalReliefGlb(
  cutoutCanvas: HTMLCanvasElement,
  reliefDepth = 0.22
): Promise<Blob> {
  const cardW = 0.94
  const cardH = 1.12
  const cornerR = 0.085
  const slabDepth = Math.max(0.036, Math.min(0.11, reliefDepth * 0.25))
  const bevelThickness = 0.012
  const bevelSize = 0.012

  // 1. Acrylic/glass core slab
  const slabShape = createRoundedRectShape(cardW, cardH, cornerR)
  const slabGeom = new THREE.ExtrudeGeometry(slabShape, {
    depth: slabDepth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 4,
    curveSegments: 20,
  })
  slabGeom.translate(0, 0, -slabDepth / 2)

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b18,
    roughness: 0.16,
    metalness: 0.2,
  })
  const slabMesh = new THREE.Mesh(slabGeom, slabMat)
  slabMesh.name = "ShowcaseAcrylicSlab"

  // 2. Subtle metallic rim bevel frame
  const rimPad = 0.022
  const rimOuter = createRoundedRectShape(cardW + rimPad, cardH + rimPad, cornerR + 0.01)
  rimOuter.holes.push(createRoundedRectPath(cardW - 0.015, cardH - 0.015, Math.max(0.02, cornerR - 0.008)))
  const rimGeom = new THREE.ExtrudeGeometry(rimOuter, {
    depth: slabDepth + bevelThickness * 1.4,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 3,
    curveSegments: 20,
  })
  rimGeom.translate(0, 0, -(slabDepth + bevelThickness * 1.4) / 2)

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.24,
    metalness: 0.86,
  })
  const rimMesh = new THREE.Mesh(rimGeom, rimMat)
  rimMesh.name = "ShowcaseMetallicRim"

  // 3. Un-warped crisp front cutout face (+Z)
  const faceW = cardW - 0.035
  const faceH = cardH - 0.035
  const faceZ = slabDepth / 2 + bevelThickness + 0.002

  const frontCanvas = createShowcaseFrontCanvas(cutoutCanvas)
  const frontTex = new THREE.CanvasTexture(frontCanvas)
  frontTex.colorSpace = THREE.SRGBColorSpace
  frontTex.flipY = false
  frontTex.needsUpdate = true

  const frontGeom = new THREE.PlaneGeometry(faceW, faceH)
  flipPlaneUvForGltf(frontGeom)
  const frontMat = new THREE.MeshStandardMaterial({
    map: frontTex,
    roughness: 0.35,
    metalness: 0.05,
  })
  const frontMesh = new THREE.Mesh(frontGeom, frontMat)
  frontMesh.name = "ShowcaseFrontFace"
  frontMesh.position.z = faceZ

  // 4. Branded back face (-Z)
  const backCanvas = createShowcaseBackCanvas()
  const backTex = new THREE.CanvasTexture(backCanvas)
  backTex.colorSpace = THREE.SRGBColorSpace
  backTex.flipY = false
  backTex.needsUpdate = true

  const backGeom = new THREE.PlaneGeometry(faceW, faceH)
  flipPlaneUvForGltf(backGeom)
  const backMat = new THREE.MeshStandardMaterial({
    map: backTex,
    roughness: 0.32,
    metalness: 0.14,
  })
  const backMesh = new THREE.Mesh(backGeom, backMat)
  backMesh.name = "ShowcaseBackFace"
  backMesh.rotation.y = Math.PI
  backMesh.position.z = -faceZ

  const group = new THREE.Group()
  group.name = "StudioShowcaseCard3D"
  group.add(slabMesh, rimMesh, frontMesh, backMesh)

  const exporter = new GLTFExporter()
  try {
    const glbBuffer = await exporter.parseAsync(group, { binary: true })
    if (glbBuffer instanceof ArrayBuffer) {
      return new Blob([glbBuffer], { type: "model/gltf-binary" })
    }
    throw new Error("Expected binary ArrayBuffer from GLTFExporter.")
  } finally {
    slabGeom.dispose()
    slabMat.dispose()
    rimGeom.dispose()
    rimMat.dispose()
    frontGeom.dispose()
    frontTex.dispose()
    frontMat.dispose()
    backGeom.dispose()
    backTex.dispose()
    backMat.dispose()
  }
}

/**
 * Converts any 2D mascot or product photo into a downloadable/loadable `.glb` 3D mesh.
 * Tries public Hugging Face ZeroGPU Gradio Spaces (`TripoSR` -> `InstantMesh`) first,
 * and seamlessly falls back to a local 3D Extruded Relief `.glb` via `GLTFExporter`.
 */
export async function convertImageToGlb(
  source: File | Blob | string,
  options: ConvertImageTo3dOptions = {}
): Promise<ConvertImageTo3dResult> {
  const {
    hfToken,
    removeBg = true,
    reliefDepth = 0.22,
    signal,
    onProgress,
  } = options

  onProgress?.({ stage: "preparing", percent: 15 })
  const prepared = await prepareImageFor3d(source, removeBg)

  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }

  onProgress?.({ stage: "generating_cloud", percent: 45 })

  let finalBlob: Blob | null = null
  let usedEngine: ImageTo3dEngine = "local_relief"
  let usedFallback = false

  for (const space of HF_SPACES) {
    if (signal?.aborted) {
      throw new DOMException("Conversion aborted", "AbortError")
    }
    try {
      finalBlob = await tryHuggingFaceSpace(
        space,
        prepared.squarePngBlob,
        hfToken,
        signal
      )
      usedEngine = space.id
      break
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError" && signal?.aborted) {
        throw err
      }
      console.warn(`Hugging Face Space (${space.id}) unavailable, trying next:`, err)
    }
  }

  if (!finalBlob) {
    usedFallback = true
    usedEngine = "local_relief"
    onProgress?.({ stage: "generating_local", percent: 75 })
    finalBlob = await createLocalReliefGlb(prepared.cutoutCanvas, reliefDepth)
  }

  onProgress?.({ stage: "ready", percent: 100 })

  const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, "")
  const fileName = `mascot-3d-${usedEngine}-${timestamp}.glb`
  const file = new File([finalBlob], fileName, { type: "model/gltf-binary" })

  return {
    blob: finalBlob,
    file,
    fileName,
    engine: usedEngine,
    usedFallback,
    previewCutoutDataUrl: prepared.previewCutoutDataUrl,
  }
}
