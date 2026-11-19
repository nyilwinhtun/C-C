import { sanitizeSpeechText } from "@/components/shared/read-aloud-button"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"

export type BurmeseVoiceType = "female" | "male"
export type VoiceoverSpeed = 0.9 | 1.0 | 1.1 | 1.2
export type VoiceDeliveryTone = "promo" | "storytelling" | "educational"
export type SoundEffectType = "none" | "pop" | "whoosh" | "cash_ding"

export interface SoundEffectPreset {
  id: SoundEffectType
  label: string
  labelMy: string
}

export const SOUND_EFFECT_PRESETS: Record<SoundEffectType, SoundEffectPreset> = {
  none: { id: "none", label: "No SFX", labelMy: "မထည့်ပါ" },
  pop: { id: "pop", label: "Pop", labelMy: "Pop" },
  whoosh: { id: "whoosh", label: "Whoosh", labelMy: "Whoosh" },
  cash_ding: { id: "cash_ding", label: "Cash Ding", labelMy: "Cash Ding" },
}

export const PAUSE_TAG_REGEX = /\[pause\s+(\d+(?:\.\d+)?)\s*s?\]/gi

export type ScriptSegment =
  | { kind: "speech"; text: string }
  | { kind: "pause"; seconds: number }

export interface VoiceDeliveryPreset {
  id: VoiceDeliveryTone
  label: string
  labelMy: string
  styleInstruction: string
}

export const VOICE_DELIVERY_PRESETS: Record<VoiceDeliveryTone, VoiceDeliveryPreset> = {
  promo: {
    id: "promo",
    label: "Energetic Promo",
    labelMy: "တက်ကြွသော အရောင်းဟန်",
    styleInstruction:
      "Deliver with an upbeat, energetic, persuasive Myanmar commercial promo tone—crisp articulation, enthusiastic warmth, and punchy emphasis on key offers.",
  },
  storytelling: {
    id: "storytelling",
    label: "Warm Storytelling",
    labelMy: "နွေးထွေးသော စကားပြောဟန်",
    styleInstruction:
      "Deliver with a warm, friendly, conversational Myanmar storytelling tone—natural emotional flow, engaging warmth, and smooth pacing.",
  },
  educational: {
    id: "educational",
    label: "Calm Educational",
    labelMy: "တည်ငြိမ်သော ပညာပေးဟန်",
    styleInstruction:
      "Deliver with a calm, confident, clear Myanmar educational presenter tone—steady measured pacing, articulate pronunciation, and trustworthy clarity.",
  },
}

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
  provider: "gemini" | "neural-tts" | "speech-synthesis"
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

const BURMESE_DIGITS = [
  "သုည",
  "တစ်",
  "နှစ်",
  "သုံး",
  "လေး",
  "ငါး",
  "ခြောက်",
  "ခုနစ်",
  "ရှစ်",
  "ကိုး",
] as const

const BURMESE_PLACE_UNITS: ReadonlyArray<{ value: number; label: string; creakyLabel?: string }> = [
  { value: 10_000_000, label: "ကုဋေ" },
  { value: 100_000, label: "သိန်း" },
  { value: 10_000, label: "သောင်း" },
  { value: 1_000, label: "ထောင်", creakyLabel: "ထောင့်" },
  { value: 100, label: "ရာ", creakyLabel: "ရာ့" },
  { value: 10, label: "ဆယ်", creakyLabel: "ဆယ့်" },
]

function myanmarDigitsToArabic(input: string): string {
  return input.replace(/[၀-၉]/g, (ch) => String(ch.charCodeAt(0) - 0x1040))
}

function integerToBurmeseWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n)
  const intVal = Math.floor(n)
  if (intVal === 0) return BURMESE_DIGITS[0]
  if (intVal < 10) return BURMESE_DIGITS[intVal]

  let remaining = intVal
  const largeParts: string[] = []
  let smallPart = ""

  for (const unit of BURMESE_PLACE_UNITS) {
    if (remaining >= unit.value) {
      const count = Math.floor(remaining / unit.value)
      remaining %= unit.value

      const countWords = count >= 10 ? integerToBurmeseWords(count) : BURMESE_DIGITS[count]
      const unitWord = remaining > 0 && unit.creakyLabel ? unit.creakyLabel : unit.label
      const chunk = `${countWords}${unitWord}`

      if (unit.value >= 100) {
        largeParts.push(chunk)
      } else {
        smallPart += chunk
      }
    }
  }

  if (remaining > 0) {
    smallPart += BURMESE_DIGITS[remaining]
  }

  if (smallPart) {
    largeParts.push(smallPart)
  }

  return largeParts.join(" ")
}

function numericStringToBurmeseWords(rawNum: string): string {
  const cleaned = rawNum.replace(/,/g, "").trim()
  if (!cleaned) return rawNum

  // Read leading-zero multi-digit sequences (e.g. phone numbers like 09...) digit by digit
  if (/^0\d+$/.test(cleaned)) {
    return cleaned
      .split("")
      .map((d) => BURMESE_DIGITS[Number(d)] ?? d)
      .join(" ")
  }

  const [intPart, decPart] = cleaned.split(".")
  const intNum = Number.parseInt(intPart, 10)
  if (!Number.isFinite(intNum)) return rawNum

  const spokenInt = integerToBurmeseWords(intNum)
  if (!decPart) return spokenInt

  const spokenDec = decPart
    .split("")
    .map((d) => BURMESE_DIGITS[Number(d)] ?? d)
    .join(" ")
  return `${spokenInt} ဒသမ ${spokenDec}`
}

const ENGLISH_TO_BURMESE_PHONETICS: ReadonlyArray<[RegExp, string]> = [
  [/\bfree\s+delivery\b/gi, "ဖရီး ဒယ်လီဗာရီ"],
  [/\bfree\s+deli\b/gi, "ဖရီး ဒယ်လီဗာရီ"],
  [/\bpro\s+max\b/gi, "ပရိုမက်စ်"],
  [/\bpre[-\s]?order\b/gi, "ပရီအော်ဒါ"],
  [/\btype[-\s]?c\b/gi, "တိုက်ပ်စီ"],
  [/\bin[-\s]?stock\b/gi, "အင်စတော့ခ်"],
  [/\bsubscribes?\b/gi, "ဆပ်စခရိုက်ဘ်"],
  [/\bfollows?\b/gi, "ဖောလိုး"],
  [/\blikes?\b/gi, "လိုက်ခ်"],
  [/\bshares?\b/gi, "ရှယ်"],
  [/\bcomments?\b/gi, "ကွန်မန့်"],
  [/\btutorials?\b/gi, "ကျူတိုရီရယ်"],
  [/\bcontents?\b/gi, "ကွန်တန့်"],
  [/\bupdates?\b/gi, "အပ်ဒိတ်"],
  [/\blinks?\b/gi, "လင့်ခ်"],
  [/\bapps?\b/gi, "အက်ပ်"],
  [/\bpro\b/gi, "ပရို"],
  [/\bplus\b/gi, "ပလပ်စ်"],
  [/\bpromotions?\b/gi, "ပရိုမိုးရှင်း"],
  [/\bpromo\b/gi, "ပရိုမိုးရှင်း"],
  [/\bdiscounts?\b/gi, "ဒစ်စကောင့်"],
  [/\boriginal\b/gi, "အော်ဂျင်နယ်"],
  [/\bfacebook\b/gi, "ဖေ့စ်ဘွတ်ခ်"],
  [/\btiktok\b/gi, "တစ်တော့ခ်"],
  [/\bquality\b/gi, "ကွာလတီ"],
  [/\breviews?\b/gi, "ရီဗျူး"],
  [/\binbox\b/gi, "အင်ဘောက်စ်"],
  [/\bib\b/gi, "အင်ဘောက်စ်"],
  [/\breels?\b/gi, "ရီးလ်စ်"],
  [/\blive\b/gi, "လိုက်ဖ်"],
  [/\bcod\b/gi, "စီအိုဒီ"],
]

export interface PronunciationRule {
  word: string
  phonetic: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function applyCustomPronunciations(
  text: string,
  rules: ReadonlyArray<PronunciationRule>
): string {
  if (!text || rules.length === 0) return text

  const sorted = [...rules]
    .filter((r) => r.word.trim() && r.phonetic.trim())
    .sort((a, b) => b.word.trim().length - a.word.trim().length)

  let result = text
  for (const rule of sorted) {
    const word = rule.word.trim()
    const phonetic = rule.phonetic.trim()
    const escaped = escapeRegExp(word)
    const isAsciiWord = /^[\x20-\x7E]+$/.test(word) && /[a-zA-Z0-9]/.test(word)
    const pattern = isAsciiWord
      ? new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "gi")
      : new RegExp(escaped, "g")
    result = result.replace(pattern, phonetic)
  }
  return result
}

/**
 * Normalize Burmese script text for clear, natural TTS pronunciation:
 * - Strips markdown, emojis, and bracketed timestamps/section tags
 * - Applies user's custom pronunciation dictionary
 * - Transliterates common English e-commerce/tech terms to phonetic Burmese
 * - Converts Arabic numbers, prices, currencies, and percentages to spoken Burmese
 * - Converts slashes, pipes, and hyphens into natural Burmese pauses
 */
export function normalizeBurmeseForTTS(
  rawText: string,
  customRules?: ReadonlyArray<PronunciationRule>
): string {
  if (!rawText || !rawText.trim()) return ""

  let text = rawText
    // Remove pause tags so single-segment TTS never reads them aloud
    .replace(/\[pause\s+\d+(?:\.\d+)?\s*s?\]/gi, " ")
    // Remove bracketed timestamps and timed/section headers like [0-3s], [0-3s Hook], [Hook]
    .replace(/\[\s*\d+(?::\d+)?\s*s?(?:\s*[-–—]\s*\d+(?::\d+)?\s*s?)?[^\]]*\]/gi, " ")
    .replace(/\[(hook|body|cta|intro|outro|scene\s*\d*)[^\]]*\]/gi, " ")
    // Remove emojis, pictographs, variation selectors, and ZWJ sequences
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, "")
    // Remove markdown headings, bold/italic markers, backticks, underscores, tildes
    .replace(/[*#`_~]/g, "")
    // Remove bullet symbols and leading list dashes
    .replace(/^\s*[-•–—]+\s+/gm, "")
    .replace(/•/g, " ")

  const rulesToApply =
    customRules ?? useContentStore.getState().customPronunciations ?? []
  if (rulesToApply.length > 0) {
    text = applyCustomPronunciations(text, rulesToApply)
  }

  // Transliterate common English e-commerce & tech terms before hyphen-to-pause conversion
  for (const [pattern, phonetic] of ENGLISH_TO_BURMESE_PHONETICS) {
    text = text.replace(pattern, phonetic)
  }

  // Convert Myanmar digits (၀-၉) to Arabic digits (0-9) so unified number parsing handles both
  text = myanmarDigitsToArabic(text)

  // Convert percentages (special case 100% -> ရာနှုန်းပြည့်)
  text = text.replace(/(?<![\d.])(\d[\d,]*(?:\.\d+)?)\s*%/g, (_match, num: string) => {
    if (num.replace(/,/g, "") === "100") {
      return "ရာနှုန်းပြည့်"
    }
    return `${numericStringToBurmeseWords(num)} ရာခိုင်နှုန်း`
  })

  // Convert currency-annotated prices
  text = text
    .replace(
      /(?:Ks|MMK|Kyats?|ကျပ်)\s*(\d[\d,]*(?:\.\d+)?)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ကျပ်`
    )
    .replace(
      /(\d[\d,]*(?:\.\d+)?)\s*(?:Ks|MMK|Kyats?|ကျပ်)\b/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ကျပ်`
    )
    .replace(
      /(?:USD|\$)\s*(\d[\d,]*(?:\.\d+)?)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ဒေါ်လာ`
    )
    .replace(
      /(\d[\d,]*(?:\.\d+)?)\s*(?:USD|\$)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ဒေါ်လာ`
    )
    .replace(
      /(?:THB|฿|Baht)\s*(\d[\d,]*(?:\.\d+)?)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ဘတ်`
    )
    .replace(
      /(\d[\d,]*(?:\.\d+)?)\s*(?:THB|฿|Baht)\b/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ဘတ်`
    )

  // Convert remaining Arabic numbers into spoken Burmese
  text = text.replace(/(?<![\d.])(\d[\d,]*(?:\.\d+)?)(?![\d.])/g, (_match, num: string) =>
    numericStringToBurmeseWords(num)
  )

  // Convert slashes, pipes, commas, and hyphens into natural Burmese pauses
  text = text
    .replace(/\s*\|\s*/g, "။ ")
    .replace(/\s*\/\s*/g, "၊ ")
    .replace(/\s*[-–—]+\s*/g, "၊ ")
    .replace(/,\s*/g, "၊ ")
    .replace(/\s*([၊။])\s*/g, "$1 ")
    .replace(/([၊။])(?:\s*[၊။])+/g, "$1 ")

  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
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

export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts"

/**
 * Split long scripts cleanly at sentence boundaries (`။` / newlines / punctuation)
 * so each TTS chunk synthesizes reliably without timeouts or clipping.
 */
export function splitScriptIntoChunks(text: string, maxChunkChars = 360): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxChunkChars) return [normalized]

  const lines = normalized
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const sentences: string[] = []
  for (const line of lines) {
    // Split on Burmese full stop (။) or standard sentence terminators while keeping delimiter
    const parts = line.split(/(?<=[။.!?])\s*/)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      if (trimmed.length <= maxChunkChars) {
        sentences.push(trimmed)
      } else {
        // Fallback split at Burmese comma (၊), comma, or whitespace
        const subParts = trimmed.split(/(?<=[၊,])\s+/)
        let subCurrent = ""
        for (const sub of subParts) {
          if (subCurrent && subCurrent.length + sub.length + 1 > maxChunkChars) {
            sentences.push(subCurrent.trim())
            subCurrent = sub
          } else {
            subCurrent = subCurrent ? `${subCurrent} ${sub}` : sub
          }
        }
        if (subCurrent.trim()) {
          sentences.push(subCurrent.trim())
        }
      }
    }
  }

  const chunks: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxChunkChars) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }
  if (current.trim()) {
    chunks.push(current.trim())
  }
  return chunks
}

function encodeAudioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = audioBuffer.sampleRate
  const length = audioBuffer.length
  const pcmBytes = new Uint8Array(length * 2)
  const view = new DataView(pcmBytes.buffer)

  // Mix down to mono 16-bit signed PCM
  const channelCount = audioBuffer.numberOfChannels
  for (let i = 0; i < length; i += 1) {
    let sample = 0
    for (let ch = 0; ch < channelCount; ch += 1) {
      sample += audioBuffer.getChannelData(ch)[i] ?? 0
    }
    sample /= Math.max(1, channelCount)
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }

  return pcmToWavBlob(pcmBytes, sampleRate, numChannels, 16)
}

async function concatenateAudioBlobsToWav(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0]

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new TtsError("Web Audio API is not supported in this browser.")
  }

  const ctx = new AudioCtx()
  try {
    const buffers: AudioBuffer[] = []
    for (const blob of blobs) {
      const arrayBuffer = await blob.arrayBuffer()
      buffers.push(await ctx.decodeAudioData(arrayBuffer))
    }

    const sampleRate = buffers[0].sampleRate
    const gapSamples = Math.floor(sampleRate * 0.12)
    const totalLength =
      buffers.reduce((sum, b) => sum + b.length, 0) + gapSamples * Math.max(0, buffers.length - 1)

    const merged = ctx.createBuffer(1, totalLength, sampleRate)
    const out = merged.getChannelData(0)
    let offset = 0

    for (let idx = 0; idx < buffers.length; idx += 1) {
      const buf = buffers[idx]
      const ch0 = buf.getChannelData(0)
      out.set(ch0, offset)
      offset += buf.length
      if (idx < buffers.length - 1) {
        offset += gapSamples
      }
    }

    return encodeAudioBufferToWavBlob(merged)
  } finally {
    await ctx.close().catch(() => {})
  }
}

async function synthesizeGeminiChunk(
  chunkText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  apiKey: string
): Promise<
  | { kind: "pcm"; pcmBytes: Uint8Array; sampleRate: number }
  | { kind: "blob"; blob: Blob; mimeType: string; fileExtension: "wav" | "mp3" }
> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`
  const tonePreset = VOICE_DELIVERY_PRESETS[deliveryTone]

  const prompt = [
    "You are a professional Burmese (Myanmar) commercial voiceover artist.",
    tonePreset.styleInstruction,
    `Read aloud in clear, natural spoken Myanmar with smooth pacing and brief pauses at commas and periods. ${getSpeedPromptInstruction(speed)}`,
    "Read ONLY the following Burmese script aloud. Do not add any intro, commentary, or extra words.",
    "",
    chunkText,
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

  if (rawMime.includes("mp3") || rawMime.includes("mpeg")) {
    const mp3Blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" })
    return { kind: "blob", blob: mp3Blob, mimeType: "audio/mpeg", fileExtension: "mp3" }
  }

  const hasRiffHeader =
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46

  if (hasRiffHeader && rawMime.includes("wav")) {
    const wavBlob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" })
    return { kind: "blob", blob: wavBlob, mimeType: "audio/wav", fileExtension: "wav" }
  }

  const sampleRate = parsePcmSampleRate(rawMime)
  return { kind: "pcm", pcmBytes: bytes, sampleRate }
}

async function synthesizeWithGemini(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  apiKey: string
): Promise<{ blob: Blob; mimeType: string; fileExtension: "wav" | "mp3" }> {
  const chunks = splitScriptIntoChunks(cleanedText, 360)
  const chunkResults = []
  for (const chunk of chunks) {
    chunkResults.push(await synthesizeGeminiChunk(chunk, preset, speed, deliveryTone, apiKey))
  }

  if (chunkResults.length === 1) {
    const single = chunkResults[0]
    if (single.kind === "pcm") {
      return {
        blob: pcmToWavBlob(single.pcmBytes, single.sampleRate, 1, 16),
        mimeType: "audio/wav",
        fileExtension: "wav",
      }
    }
    return { blob: single.blob, mimeType: single.mimeType, fileExtension: single.fileExtension }
  }

  const allPcmSameRate =
    chunkResults.every((r) => r.kind === "pcm") &&
    new Set(chunkResults.map((r) => (r.kind === "pcm" ? r.sampleRate : 0))).size === 1

  if (allPcmSameRate) {
    const sampleRate = chunkResults[0].kind === "pcm" ? chunkResults[0].sampleRate : 24000
    const gapBytes = Math.floor(sampleRate * 0.12) * 2
    const totalBytes =
      chunkResults.reduce((sum, r) => sum + (r.kind === "pcm" ? r.pcmBytes.byteLength : 0), 0) +
      gapBytes * (chunkResults.length - 1)
    const mergedPcm = new Uint8Array(totalBytes)
    let offset = 0
    for (let i = 0; i < chunkResults.length; i += 1) {
      const r = chunkResults[i]
      if (r.kind !== "pcm") continue
      mergedPcm.set(r.pcmBytes, offset)
      offset += r.pcmBytes.byteLength
      if (i < chunkResults.length - 1) {
        offset += gapBytes
      }
    }
    return {
      blob: pcmToWavBlob(mergedPcm, sampleRate, 1, 16),
      mimeType: "audio/wav",
      fileExtension: "wav",
    }
  }

  const blobs = chunkResults.map((r) =>
    r.kind === "pcm" ? pcmToWavBlob(r.pcmBytes, r.sampleRate, 1, 16) : r.blob
  )
  const mergedWav = await concatenateAudioBlobsToWav(blobs)
  return { blob: mergedWav, mimeType: "audio/wav", fileExtension: "wav" }
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

function synthesizeWithSpeechSynthesis(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed
): { blob: Blob; mimeType: string; fileExtension: "wav" } {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new TtsError("Browser speech synthesis is not supported in this environment.")
  }

  const synth = window.speechSynthesis
  synth.cancel()

  const utterance = new SpeechSynthesisUtterance(cleanedText)
  utterance.lang = "my-MM"
  utterance.rate = speed
  utterance.pitch = preset.id === "female" ? 1.05 : 0.95

  const voices = synth.getVoices()
  const burmeseVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("my"))
  if (burmeseVoices.length > 0) {
    const preferred = burmeseVoices.find((v) =>
      preset.id === "female"
        ? /nilar|female|woman/i.test(v.name)
        : /thiha|male|man/i.test(v.name)
    )
    utterance.voice = preferred ?? burmeseVoices[0]
  }

  synth.speak(utterance)

  // Produce a valid 24kHz mono WAV container matching estimated duration so audio players
  // and downstream Video Merger decode cleanly without errors.
  const estimatedSeconds = Math.max(1.5, Math.min(30, (cleanedText.length * 0.08) / speed))
  const sampleRate = 24000
  const sampleCount = Math.floor(sampleRate * estimatedSeconds)
  const silentPcm = new Uint8Array(sampleCount * 2)
  const wavBlob = pcmToWavBlob(silentPcm, sampleRate, 1, 16)
  return { blob: wavBlob, mimeType: "audio/wav", fileExtension: "wav" }
}

export interface GenerateVoiceoverOptions {
  deliveryTone?: VoiceDeliveryTone
  customPronunciations?: ReadonlyArray<PronunciationRule>
  introSfx?: SoundEffectType
}

/**
 * Parse a script containing `[pause 0.5s]`, `[pause 1s]`, `[pause 2s]` markers
 * into ordered speech and pause segments.
 */
export function parseScriptWithPauses(rawText: string): ScriptSegment[] {
  if (!rawText || !rawText.trim()) return []
  const regex = /\[pause\s+(\d+(?:\.\d+)?)\s*s?\]/gi
  const segments: ScriptSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(rawText)) !== null) {
    const preceding = rawText.slice(lastIndex, match.index).trim()
    if (preceding) {
      segments.push({ kind: "speech", text: preceding })
    }
    const parsedSec = Number.parseFloat(match[1])
    if (Number.isFinite(parsedSec) && parsedSec > 0) {
      segments.push({ kind: "pause", seconds: Math.min(5, Math.max(0.1, parsedSec)) })
    }
    lastIndex = match.index + match[0].length
  }

  const trailing = rawText.slice(lastIndex).trim()
  if (trailing) {
    segments.push({ kind: "speech", text: trailing })
  }
  return segments
}

/**
 * Normalize Burmese script for TTS while preserving `[pause Xs]` markers
 * so the user's manual timing tags stay intact in the editor.
 */
export function optimizeScriptPreservingPauses(
  rawText: string,
  customRules?: ReadonlyArray<PronunciationRule>
): string {
  const segments = parseScriptWithPauses(rawText)
  if (segments.length === 0) return ""
  return segments
    .map((seg) => {
      if (seg.kind === "pause") {
        const label = Number.isInteger(seg.seconds) ? `${seg.seconds}` : seg.seconds.toFixed(1)
        return `[pause ${label}s]`
      }
      return normalizeBurmeseForTTS(seg.text, customRules)
    })
    .filter(Boolean)
    .join(" ")
}

/**
 * Generate procedural mono PCM samples for short intro/accent sound effects
 * using Web Audio math (zero external audio files required).
 */
export function synthesizeSfxSamples(sfx: SoundEffectType, sampleRate: number): Float32Array {
  if (sfx === "none") return new Float32Array(0)

  if (sfx === "pop") {
    const duration = 0.11
    const length = Math.floor(sampleRate * duration)
    const out = new Float32Array(length)
    let phase = 0
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate
      const progress = t / duration
      const freq = 580 * Math.pow(0.28, progress)
      phase += (2 * Math.PI * freq) / sampleRate
      const env = Math.sin(Math.min(1, t / 0.008) * (Math.PI / 2)) * Math.exp(-progress * 6.5)
      out[i] = Math.sin(phase) * env * 0.55
    }
    return out
  }

  if (sfx === "whoosh") {
    const duration = 0.34
    const length = Math.floor(sampleRate * duration)
    const out = new Float32Array(length)
    let lp = 0
    let hpPrev = 0
    let hpOut = 0
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate
      const progress = t / duration
      const noise = Math.random() * 2 - 1
      const cutoff = 350 + Math.sin(progress * Math.PI) * 2100
      const alpha = Math.min(0.95, (2 * Math.PI * cutoff) / sampleRate)
      lp = lp + alpha * (noise - lp)
      hpOut = 0.96 * (hpOut + lp - hpPrev)
      hpPrev = lp
      const env = Math.sin(progress * Math.PI)
      out[i] = Math.max(-1, Math.min(1, hpOut * env * 0.65))
    }
    return out
  }

  // cash_ding: bright dual-harmonic bell chime
  const duration = 0.48
  const length = Math.floor(sampleRate * duration)
  const out = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate
    const attack = Math.min(1, t / 0.005)
    const decay1 = Math.exp(-t * 7.5)
    const decay2 = Math.exp(-t * 10.5)
    const tone1 = Math.sin(2 * Math.PI * 1318.5 * t) * 0.45 * decay1
    const tone2 = Math.sin(2 * Math.PI * 1975.5 * t) * 0.32 * decay2
    const tone3 = Math.sin(2 * Math.PI * 2637.0 * t) * 0.18 * decay2
    out[i] = (tone1 + tone2 + tone3) * attack * 0.55
  }
  return out
}

export async function playSoundEffectPreview(sfx: SoundEffectType): Promise<void> {
  if (sfx === "none" || typeof window === "undefined") return
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return

  const ctx = new AudioCtx()
  try {
    if (ctx.state === "suspended") {
      await ctx.resume()
    }
    const samples = synthesizeSfxSamples(sfx, ctx.sampleRate)
    if (samples.length === 0) return
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
    buffer.getChannelData(0).set(samples)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.start(0)
    await new Promise<void>((resolve) => {
      src.onended = () => resolve()
      window.setTimeout(resolve, Math.ceil((samples.length / ctx.sampleRate) * 1000) + 80)
    })
  } finally {
    await ctx.close().catch(() => {})
  }
}

async function synthesizeSpeechSegmentBlob(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone
): Promise<{
  blob: Blob
  mimeType: string
  fileExtension: "wav" | "mp3"
  voiceName: string
  provider: "gemini" | "neural-tts" | "speech-synthesis"
}> {
  const geminiKey = getSavedGeminiApiKey()

  if (geminiKey) {
    try {
      const geminiResult = await synthesizeWithGemini(
        cleanedText,
        preset,
        speed,
        deliveryTone,
        geminiKey
      )
      return {
        ...geminiResult,
        voiceName: `${preset.label} · Gemini`,
        provider: "gemini",
      }
    } catch {
      // Silently fall back to free Myanmar Neural TTS on any Gemini error
    }
  }

  try {
    const neuralChunks = splitScriptIntoChunks(cleanedText, 450)
    let neuralBlob: Blob
    let neuralMime = "audio/mpeg"
    let neuralExt: "mp3" | "wav" = "mp3"

    if (neuralChunks.length <= 1) {
      const single = await synthesizeWithNeuralTts(cleanedText, preset, speed)
      neuralBlob = single.blob
      neuralMime = single.mimeType
      neuralExt = single.fileExtension
    } else {
      const chunkBlobs: Blob[] = []
      for (const chunk of neuralChunks) {
        const res = await synthesizeWithNeuralTts(chunk, preset, speed)
        chunkBlobs.push(res.blob)
      }
      neuralBlob = await concatenateAudioBlobsToWav(chunkBlobs)
      neuralMime = "audio/wav"
      neuralExt = "wav"
    }

    return {
      blob: neuralBlob,
      mimeType: neuralMime,
      fileExtension: neuralExt,
      voiceName: `${preset.label} · ${preset.neuralVoice}`,
      provider: "neural-tts",
    }
  } catch {
    const speechResult = synthesizeWithSpeechSynthesis(cleanedText, preset, speed)
    return {
      ...speechResult,
      voiceName: `${preset.label} · Browser Speech`,
      provider: "speech-synthesis",
    }
  }
}

async function assembleSegmentsWithPausesAndSfx(
  timeline: Array<
    | { kind: "speech"; blob: Blob }
    | { kind: "pause"; seconds: number }
  >,
  introSfx: SoundEffectType
): Promise<{ blob: Blob; audioBuffer: AudioBuffer }> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new TtsError("Web Audio API is not supported in this browser.")
  }

  const ctx = new AudioCtx()
  try {
    const decodedItems: Array<
      | { kind: "speech"; buffer: AudioBuffer }
      | { kind: "pause"; seconds: number }
    > = []
    let sampleRate = 24000

    for (const item of timeline) {
      if (item.kind === "pause") {
        decodedItems.push(item)
      } else {
        const buf = await ctx.decodeAudioData(await item.blob.arrayBuffer())
        sampleRate = buf.sampleRate
        decodedItems.push({ kind: "speech", buffer: buf })
      }
    }

    const sfxSamples = synthesizeSfxSamples(introSfx, sampleRate)
    const sfxLeadSamples = sfxSamples.length > 0 ? Math.floor(sampleRate * 0.16) : 0

    let speechTotalSamples = 0
    for (const item of decodedItems) {
      if (item.kind === "pause") {
        speechTotalSamples += Math.floor(item.seconds * sampleRate)
      } else {
        speechTotalSamples += item.buffer.length
      }
    }

    const totalSamples = Math.max(
      sfxSamples.length,
      sfxLeadSamples + speechTotalSamples
    )
    const merged = ctx.createBuffer(1, Math.max(1, totalSamples), sampleRate)
    const out = merged.getChannelData(0)

    if (sfxSamples.length > 0) {
      for (let i = 0; i < sfxSamples.length && i < out.length; i += 1) {
        out[i] = Math.max(-1, Math.min(1, out[i] + sfxSamples[i]))
      }
    }

    let offset = sfxLeadSamples
    for (const item of decodedItems) {
      if (item.kind === "pause") {
        offset += Math.floor(item.seconds * sampleRate)
        continue
      }
      const ch0 = item.buffer.getChannelData(0)
      for (let i = 0; i < ch0.length && offset + i < out.length; i += 1) {
        out[offset + i] = Math.max(-1, Math.min(1, out[offset + i] + ch0[i]))
      }
      offset += item.buffer.length
    }

    const wavBlob = encodeAudioBufferToWavBlob(merged)
    return { blob: wavBlob, audioBuffer: merged }
  } finally {
    await ctx.close().catch(() => {})
  }
}

/**
 * Generate a playable Burmese AI voiceover from a timed or markdown script.
 * Supports `[pause 0.5s]`, `[pause 1s]`, `[pause 2s]` markers and optional
 * Web Audio intro sound effects (`pop`, `whoosh`, `cash_ding`).
 * Tier 1: Gemini dedicated TTS (`gemini-2.5-flash-preview-tts`) when an API key is configured.
 * Tier 2: Free Myanmar Neural TTS (`my-MM-NilarNeural` / `my-MM-ThihaNeural`).
 * Tier 3: Browser Speech Synthesis fallback.
 */
export async function generateBurmeseVoiceover(
  scriptText: string,
  voiceType: BurmeseVoiceType = "female",
  speed: VoiceoverSpeed = 1.0,
  options: GenerateVoiceoverOptions = {}
): Promise<VoiceoverResult> {
  const deliveryTone = options.deliveryTone ?? "storytelling"
  const introSfx = options.introSfx ?? "none"
  const preset = BURMESE_VOICE_PRESETS[voiceType]

  const rawSegments = parseScriptWithPauses(scriptText)
  const normalizedTimeline: Array<
    | { kind: "speech"; text: string }
    | { kind: "pause"; seconds: number }
  > = []

  for (const seg of rawSegments) {
    if (seg.kind === "pause") {
      if (normalizedTimeline.length > 0) {
        normalizedTimeline.push(seg)
      }
    } else {
      const normalized = normalizeBurmeseForTTS(seg.text, options.customPronunciations)
      if (normalized) {
        normalizedTimeline.push({ kind: "speech", text: normalized })
      }
    }
  }

  // Trim trailing pauses
  while (
    normalizedTimeline.length > 0 &&
    normalizedTimeline[normalizedTimeline.length - 1].kind === "pause"
  ) {
    normalizedTimeline.pop()
  }

  const speechSegments = normalizedTimeline.filter(
    (item): item is { kind: "speech"; text: string } => item.kind === "speech"
  )
  if (speechSegments.length === 0) {
    throw new TtsError("Voiceover script is empty after removing timestamps and formatting.")
  }

  const combinedCleanedText = speechSegments.map((s) => s.text).join(" ")
  const hasPauses = normalizedTimeline.some((item) => item.kind === "pause")

  // Fast path: single speech segment and no SFX
  if (!hasPauses && introSfx === "none" && speechSegments.length === 1) {
    const single = await synthesizeSpeechSegmentBlob(
      speechSegments[0].text,
      preset,
      speed,
      deliveryTone
    )
    const audioBuffer = await decodeBlobToAudioBuffer(single.blob)
    const audioUrl = URL.createObjectURL(single.blob)
    return {
      audioUrl,
      blob: single.blob,
      audioBuffer,
      mimeType: single.mimeType,
      fileExtension: single.fileExtension,
      durationSeconds: audioBuffer.duration,
      voiceName: single.voiceName,
      provider: single.provider,
      cleanedText: combinedCleanedText,
    }
  }

  // Multi-segment (with pauses) and/or intro SFX path
  const audioTimeline: Array<
    | { kind: "speech"; blob: Blob }
    | { kind: "pause"; seconds: number }
  > = []

  let lastVoiceName = `${preset.label} · ${preset.neuralVoice}`
  let lastProvider: VoiceoverResult["provider"] = "neural-tts"

  for (const item of normalizedTimeline) {
    if (item.kind === "pause") {
      audioTimeline.push(item)
    } else {
      const res = await synthesizeSpeechSegmentBlob(item.text, preset, speed, deliveryTone)
      lastVoiceName = res.voiceName
      lastProvider = res.provider
      audioTimeline.push({ kind: "speech", blob: res.blob })
    }
  }

  const assembled = await assembleSegmentsWithPausesAndSfx(audioTimeline, introSfx)
  const audioUrl = URL.createObjectURL(assembled.blob)
  return {
    audioUrl,
    blob: assembled.blob,
    audioBuffer: assembled.audioBuffer,
    mimeType: "audio/wav",
    fileExtension: "wav",
    durationSeconds: assembled.audioBuffer.duration,
    voiceName: lastVoiceName,
    provider: lastProvider,
    cleanedText: combinedCleanedText,
  }
}

