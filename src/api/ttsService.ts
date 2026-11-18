import { sanitizeSpeechText } from "@/components/shared/read-aloud-button"
import { useUIStore } from "@/store/useUIStore"

export type BurmeseVoiceType = "female" | "male"
export type VoiceoverSpeed = 0.9 | 1.0 | 1.1 | 1.2

export interface BurmeseVoicePreset {
  id: BurmeseVoiceType
  label: string
  labelMy: string
  neuralVoice: "my-MM-NilarNeural" | "my-MM-ThihaNeural"
  geminiVoice: string
}

export const BURMESE_VOICE_PRESETS: Record<BurmeseVoiceType, BurmeseVoicePreset> = {
  female: {
    id: "female",
    label: "Female (Nilar)",
    labelMy: "မိန်းကလေးအသံ (Nilar)",
    neuralVoice: "my-MM-NilarNeural",
    geminiVoice: "Aoede",
  },
  male: {
    id: "male",
    label: "Male (Thiha)",
    labelMy: "ယောက်ျားလေးအသံ (Thiha)",
    neuralVoice: "my-MM-ThihaNeural",
    geminiVoice: "Charon",
  },
}

export const VOICEOVER_SPEEDS: VoiceoverSpeed[] = [0.9, 1.0, 1.1, 1.2]

export interface VoiceoverResult {
  audioUrl: string
  blob: Blob
  audioBuffer: AudioBuffer
  mimeType: string
  fileExtension: "wav" | "mp3"
  durationSeconds: number
  voiceName: string
  provider: "gemini" | "neural-tts"
  cleanedText: string
}

export class TtsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TtsError"
  }
}

/**
 * Strip markdown symbols, timestamps like [0-3s], and emojis so only clean
 * spoken Burmese text is sent to TTS synthesis.
 */
export function cleanVoiceoverText(raw: string): string {
  const sanitized = sanitizeSpeechText(raw)
  return sanitized
    .replace(/\[(hook|body|cta|intro|outro|scene\s*\d*)\]/gi, " ")
    .replace(/\s+\n/g, "\n")
    .trim()
}

function getSavedGeminiApiKey(): string {
  const fromStore = useUIStore.getState().apiKeys.gemini?.trim()
  if (fromStore) return fromStore
  if (typeof window !== "undefined") {
    try {
      return (
        window.localStorage.getItem("cc_api_key_gemini")?.trim() ||
        window.localStorage.getItem("gemini_api_key")?.trim() ||
        ""
      )
    } catch {
      return ""
    }
  }
  return ""
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function parsePcmSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i)
  if (match && match[1]) {
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return 24000
}

/**
 * Wrap raw 16-bit signed little-endian PCM bytes in a standard 44-byte RIFF/WAV header
 * so browsers can play and decode it natively.
 */
function pcmToWavBlob(
  pcmBytes: Uint8Array,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Blob {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = pcmBytes.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  new Uint8Array(buffer, 44).set(pcmBytes)
  return new Blob([buffer], { type: "audio/wav" })
}

async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new TtsError("Web Audio API is not supported in this browser.")
  }

  const ctx = new AudioCtx()
  try {
    const arrayBuffer = await blob.arrayBuffer()
    return await ctx.decodeAudioData(arrayBuffer)
  } finally {
    await ctx.close().catch(() => {})
  }
}

function getSpeedPromptInstruction(speed: VoiceoverSpeed): string {
  switch (speed) {
    case 0.9:
      return "Speak at a slightly slower, relaxed, clear pace (0.9x speed)."
    case 1.1:
      return "Speak at a slightly brisk, energetic social-media pace (1.1x speed)."
    case 1.2:
      return "Speak at a fast, engaging, punchy TikTok/Reels pace (1.2x speed)."
    default:
      return "Speak at a natural, conversational pace (1.0x speed)."
  }
}

async function synthesizeWithGemini(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  apiKey: string
): Promise<{ blob: Blob; mimeType: string; fileExtension: "wav" | "mp3" }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

  const prompt = [
    "You are a professional Burmese (Myanmar) commercial voiceover artist.",
    `Read ONLY the following Burmese script aloud naturally in Burmese. ${getSpeedPromptInstruction(speed)}`,
    "Do not add any intro, commentary, or extra words.",
    "",
    cleanedText,
  ].join("\n")

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: preset.geminiVoice,
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => "")
    throw new TtsError(`Gemini audio generation failed (${response.status}): ${errText.slice(0, 180)}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string }
        }>
      }
    }>
  }

  const parts = data.candidates?.[0]?.content?.parts ?? []
  const audioPart = parts.find((part) => part.inlineData?.data)
  if (!audioPart?.inlineData?.data) {
    throw new TtsError("Gemini did not return audio data.")
  }

  const rawMime = (audioPart.inlineData.mimeType || "audio/L16;rate=24000").toLowerCase()
  const bytes = base64ToUint8Array(audioPart.inlineData.data)

  if (rawMime.includes("l16") || rawMime.includes("pcm")) {
    const sampleRate = parsePcmSampleRate(rawMime)
    const wavBlob = pcmToWavBlob(bytes, sampleRate, 1, 16)
    return { blob: wavBlob, mimeType: "audio/wav", fileExtension: "wav" }
  }

  if (rawMime.includes("mp3") || rawMime.includes("mpeg")) {
    const mp3Blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" })
    return { blob: mp3Blob, mimeType: "audio/mpeg", fileExtension: "mp3" }
  }

  const wavBlob = new Blob([bytes.buffer as ArrayBuffer], { type: rawMime || "audio/wav" })
  return { blob: wavBlob, mimeType: rawMime || "audio/wav", fileExtension: "wav" }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function formatEdgeRate(speed: VoiceoverSpeed): string {
  const delta = Math.round((speed - 1.0) * 100)
  return delta >= 0 ? `+${delta}%` : `${delta}%`
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "")
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`
}

async function synthesizeWithNeuralTts(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed
): Promise<{ blob: Blob; mimeType: string; fileExtension: "mp3" }> {
  const endpoint =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4"

  return new Promise((resolve, reject) => {
    let settled = false
    const chunks: Uint8Array[] = []
    let ws: WebSocket | null = null

    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      try {
        ws?.close()
      } catch {
        // Ignore close errors
      }
      reject(new TtsError("Neural TTS request timed out."))
    }, 15000)

    const cleanup = () => {
      window.clearTimeout(timeout)
    }

    try {
      ws = new WebSocket(endpoint)
      ws.binaryType = "arraybuffer"
    } catch (err) {
      cleanup()
      reject(new TtsError(err instanceof Error ? err.message : "Failed to connect to Neural TTS."))
      return
    }

    ws.onopen = () => {
      if (!ws) return
      const timestamp = new Date().toISOString()
      const requestId = generateRequestId()

      const configMessage = [
        `X-Timestamp:${timestamp}`,
        "Content-Type:application/json; charset=utf-8",
        "Path:speech.config",
        "",
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        }),
      ].join("\r\n")

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='my-MM'><voice name='${preset.neuralVoice}'><prosody rate='${formatEdgeRate(speed)}' pitch='+0Hz'>${escapeXml(cleanedText)}</prosody></voice></speak>`

      const ssmlMessage = [
        `X-RequestId:${requestId}`,
        "Content-Type:application/ssml+xml",
        `X-Timestamp:${timestamp}`,
        "Path:ssml",
        "",
        ssml,
      ].join("\r\n")

      ws.send(configMessage)
      ws.send(ssmlMessage)
    }

    ws.onmessage = (event) => {
      if (settled) return

      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          settled = true
          cleanup()
          try {
            ws?.close()
          } catch {
            // Ignore close errors
          }
          if (chunks.length === 0) {
            reject(new TtsError("Neural TTS returned empty audio."))
            return
          }
          const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0)
          const merged = new Uint8Array(totalBytes)
          let offset = 0
          for (const chunk of chunks) {
            merged.set(chunk, offset)
            offset += chunk.byteLength
          }
          const blob = new Blob([merged.buffer as ArrayBuffer], { type: "audio/mpeg" })
          resolve({ blob, mimeType: "audio/mpeg", fileExtension: "mp3" })
        }
        return
      }

      if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data)
        if (event.data.byteLength < 2) return
        const headerLength = view.getUint16(0, false)
        const payloadOffset = 2 + headerLength
        if (payloadOffset < event.data.byteLength) {
          chunks.push(new Uint8Array(event.data, payloadOffset))
        }
      }
    }

    ws.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new TtsError("Neural TTS WebSocket connection failed."))
    }

    ws.onclose = () => {
      if (settled) return
      settled = true
      cleanup()
      if (chunks.length === 0) {
        reject(new TtsError("Neural TTS connection closed before audio completed."))
      }
    }
  })
}

/**
 * Generate a playable Burmese AI voiceover from a timed or markdown script.
 * Uses Gemini 2.5 Flash native audio when a Gemini API key is configured,
 * with automatic fallback to free my-MM neural TTS.
 */
export async function generateBurmeseVoiceover(
  scriptText: string,
  voiceType: BurmeseVoiceType = "female",
  speed: VoiceoverSpeed = 1.0
): Promise<VoiceoverResult> {
  const cleanedText = cleanVoiceoverText(scriptText)
  if (!cleanedText) {
    throw new TtsError("Voiceover script is empty after removing timestamps and formatting.")
  }

  const preset = BURMESE_VOICE_PRESETS[voiceType]
  const geminiKey = getSavedGeminiApiKey()

  let synthesisError: unknown = null

  if (geminiKey) {
    try {
      const geminiResult = await synthesizeWithGemini(cleanedText, preset, speed, geminiKey)
      const audioBuffer = await decodeBlobToAudioBuffer(geminiResult.blob)
      const audioUrl = URL.createObjectURL(geminiResult.blob)
      return {
        audioUrl,
        blob: geminiResult.blob,
        audioBuffer,
        mimeType: geminiResult.mimeType,
        fileExtension: geminiResult.fileExtension,
        durationSeconds: audioBuffer.duration,
        voiceName: `${preset.label} · Gemini`,
        provider: "gemini",
        cleanedText,
      }
    } catch (err) {
      synthesisError = err
    }
  }

  try {
    const neuralResult = await synthesizeWithNeuralTts(cleanedText, preset, speed)
    const audioBuffer = await decodeBlobToAudioBuffer(neuralResult.blob)
    const audioUrl = URL.createObjectURL(neuralResult.blob)
    return {
      audioUrl,
      blob: neuralResult.blob,
      audioBuffer,
      mimeType: neuralResult.mimeType,
      fileExtension: neuralResult.fileExtension,
      durationSeconds: audioBuffer.duration,
      voiceName: `${preset.label} · ${preset.neuralVoice}`,
      provider: "neural-tts",
      cleanedText,
    }
  } catch (neuralErr) {
    if (!geminiKey) {
      throw new TtsError(
        "Could not reach free Burmese Neural TTS. Please add your Gemini API Key in Settings for reliable native Burmese AI voiceover."
      )
    }
    const reason =
      synthesisError instanceof Error
        ? synthesisError.message
        : neuralErr instanceof Error
          ? neuralErr.message
          : "Voiceover synthesis failed."
    throw new TtsError(reason)
  }
}
