import type { FaceLandmarker } from "@mediapipe/tasks-vision"

export interface MouthDetection {
  /** Mouth (lip-line) centre, 0–1 in image space */
  x: number
  y: number
  /** Outer lip width as a fraction of image width */
  width: number
  /** Chin bottom, 0–1 of image height */
  jawBottom: number
  /** Jaw half-width (0–1 of image width) */
  jawHalfWidth: number
  /** True if a real face was found; false = centre-face fallback */
  detected: boolean
}

export const FALLBACK_MOUTH: MouthDetection = {
  x: 0.5,
  y: 0.42,
  width: 0.12,
  jawBottom: 0.56,
  jawHalfWidth: 0.14,
  detected: false,
}

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

let landmarkerPromise: Promise<FaceLandmarker> | null = null

async function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision")
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
      const make = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "IMAGE",
          numFaces: 1,
        })
      try {
        return await make("GPU")
      } catch {
        return await make("CPU")
      }
    })()
    landmarkerPromise.catch(() => {
      landmarkerPromise = null
    })
  }
  return landmarkerPromise
}

/**
 * Locates the mouth centre, lip width and jaw bounds of the main face.
 * Never throws: falls back to a centred-face estimate (detected=false).
 */
export async function detectMouthFromImage(img: HTMLImageElement): Promise<MouthDetection> {
  try {
    const landmarker = await getLandmarker()
    const result = landmarker.detect(img)
    const lm = result.faceLandmarks?.[0]
    if (!lm || lm.length < 455) return FALLBACK_MOUTH

    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    const left = lm[61]
    const right = lm[291]
    const upperInner = lm[13]
    const lowerInner = lm[14]
    const chin = lm[152]
    const jawL = lm[234]
    const jawR = lm[454]

    const aspect = img.width / img.height
    const lipWidthPx = Math.hypot((right.x - left.x) * aspect, right.y - left.y)
    return {
      x: clamp((left.x + right.x) / 2),
      y: clamp((upperInner.y + lowerInner.y) / 2),
      width: Math.min(0.4, Math.max(0.04, lipWidthPx / aspect)),
      jawBottom: clamp(chin.y),
      jawHalfWidth: Math.min(0.5, Math.max(0.05, Math.abs(jawR.x - jawL.x) / 2)),
      detected: true,
    }
  } catch (err) {
    console.warn("Mouth detection unavailable, using centre-face fallback", err)
    return FALLBACK_MOUTH
  }
}
