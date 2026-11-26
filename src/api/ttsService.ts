import { sanitizeSpeechText } from "@/components/shared/read-aloud-button"
import { encodeMonoWav16Bit } from "@/lib/audioProcessor"
import {
  applyStudioVocalEqToPcm16,
  decodeAudioBlob,
  getAudioContextConstructor,
  unlockIosAudio,
} from "@/lib/iosAudio"
import { executeWithGeminiKeyRotation } from "@/api/aiService"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"

export { executeWithGeminiKeyRotation }

export type BurmeseVoiceType = "female" | "male" | "deep_male"
export type VoiceoverSpeed = 0.85 | 0.9 | 1.0 | 1.05 | 1.1 | 1.15 | 1.2
export type VoiceDeliveryTone = "normal" | "promo" | "storytelling" | "educational"
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
  normal: {
    id: "normal",
    label: "Normal Natural",
    labelMy: "ပုံမှန် သဘာဝအသံ",
    styleInstruction:
      "Deliver in a clean, grounded, everyday conversational Burmese narrator tone—like a composed, natural Myanmar presenter. Zero theatrical exaggeration, zero dramatic pitch swings, 100% steady and natural.",
  },
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
  geminiFallbackVoice: string
}

export const BURMESE_VOICE_PRESETS: Record<BurmeseVoiceType, BurmeseVoicePreset> = {
  female: {
    id: "female",
    label: "Female (Nilar)",
    labelMy: "မိန်းကလေးအသံ (Nilar)",
    neuralVoice: "my-MM-NilarNeural",
    geminiVoice: "Zephyr",
    geminiFallbackVoice: "Aoede",
  },
  male: {
    id: "male",
    label: "Male (Thiha)",
    labelMy: "ယောက်ျားလေးအသံ (Thiha)",
    neuralVoice: "my-MM-ThihaNeural",
    geminiVoice: "Puck",
    geminiFallbackVoice: "Fenrir",
  },
  deep_male: {
    id: "deep_male",
    label: "Deep Male (Ko Khant)",
    labelMy: "အသံဩဇာ (ကိုခန့်)",
    neuralVoice: "my-MM-ThihaNeural",
    geminiVoice: "Fenrir",
    geminiFallbackVoice: "Puck",
  },
}

export const VOICEOVER_SPEEDS: VoiceoverSpeed[] = [0.9, 1.0, 1.05, 1.1, 1.2]

export interface VoiceoverSegmentItem {
  id: string
  text: string
  blob: Blob
  audioUrl: string
  durationSeconds: number
  provider: "gemini" | "neural-tts" | "speech-synthesis"
  pcmBytes?: Uint8Array
}

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
  segments?: VoiceoverSegmentItem[]
}

export class TtsError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "TtsError"
    this.status = status
  }
}

const MAX_TTS_AUDIO_CACHE_CLIPS = 15

interface CachedTtsSegmentData {
  text: string
  blob: Blob
  durationSeconds: number
  provider: "gemini" | "neural-tts" | "speech-synthesis"
  pcmBytes?: Uint8Array
}

interface CachedTtsAudioClip {
  blob: Blob
  mimeType: string
  fileExtension: "wav" | "mp3"
  voiceName: string
  provider: "gemini" | "neural-tts" | "speech-synthesis"
  cleanedText: string
  segments: CachedTtsSegmentData[]
}

const ttsAudioCache = new Map<string, CachedTtsAudioClip>()

export function buildTtsCacheKey(
  voiceId: string,
  deliveryStyle: VoiceDeliveryTone,
  speed: VoiceoverSpeed,
  normalizedText: string
): string {
  return `${voiceId}:${deliveryStyle}:${speed}:${normalizedText.trim()}`
}

function getCachedTtsClip(key: string): CachedTtsAudioClip | undefined {
  const cached = ttsAudioCache.get(key)
  if (!cached) return undefined
  // Refresh LRU entry position
  ttsAudioCache.delete(key)
  ttsAudioCache.set(key, cached)
  return cached
}

function setCachedTtsClip(key: string, clip: CachedTtsAudioClip): void {
  if (ttsAudioCache.has(key)) {
    ttsAudioCache.delete(key)
  }
  while (ttsAudioCache.size >= MAX_TTS_AUDIO_CACHE_CLIPS) {
    const oldestKey = ttsAudioCache.keys().next().value
    if (oldestKey === undefined) break
    ttsAudioCache.delete(oldestKey)
  }
  ttsAudioCache.set(key, clip)
}

function cloneSegmentsFromCache(
  cachedSegments: ReadonlyArray<CachedTtsSegmentData>
): VoiceoverSegmentItem[] {
  const ts = Date.now()
  return cachedSegments.map((seg, idx) => ({
    id: `seg-${ts}-${idx}`,
    text: seg.text,
    blob: seg.blob,
    audioUrl: URL.createObjectURL(seg.blob),
    durationSeconds: seg.durationSeconds,
    provider: seg.provider,
    pcmBytes: seg.pcmBytes,
  }))
}

function toCachedSegments(
  segments?: ReadonlyArray<VoiceoverSegmentItem>
): CachedTtsSegmentData[] {
  if (!segments) return []
  return segments.map((seg) => ({
    text: seg.text,
    blob: seg.blob,
    durationSeconds: seg.durationSeconds,
    provider: seg.provider,
    pcmBytes: seg.pcmBytes,
  }))
}

export function clearTtsAudioCache(): void {
  ttsAudioCache.clear()
}

/**
 * Strip markdown symbols, timestamps like [0-3s] or 0:00 - 0:05, and emojis
 * so only clean spoken Burmese/English text is sent to TTS synthesis.
 * Never deletes actual spoken words, parenthetical phrases, or sentences.
 */
export function cleanVoiceoverText(raw: string): string {
  const sanitized = sanitizeSpeechText(raw)
  return sanitized
    .replace(/\s+\n/g, "\n")
    .trim()
}

/**
 * Estimate spoken duration in seconds for Burmese/English voiceover text,
 * accounting for playback speed and any [pause Xs] tags.
 */
export function estimateSpokenDurationSeconds(
  rawText: string,
  speed: number = 1.0
): number {
  if (!rawText || !rawText.trim()) return 0

  let pauseSeconds = 0
  const withoutPauses = rawText.replace(PAUSE_TAG_REGEX, (_m, sec: string) => {
    const parsed = Number.parseFloat(sec)
    if (Number.isFinite(parsed) && parsed > 0) {
      pauseSeconds += parsed
    }
    return " "
  })

  const cleaned = cleanVoiceoverText(withoutPauses)
  const nonSpaceChars = cleaned.replace(/\s+/g, "").length
  if (nonSpaceChars === 0 && pauseSeconds === 0) return 0

  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1.0
  // ~16.5 non-space Burmese chars/sec (~2.8 words/sec) at 1.0x speed
  const speechSeconds = nonSpaceChars / (16.5 * safeSpeed)
  return Math.max(1, Math.round(speechSeconds + pauseSeconds))
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

  return largeParts.join("")
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
    // Remove bracketed timestamps like [0-3s], [0-3s Hook], [0:00 - 0:05] without deleting spoken text
    .replace(
      /\[\s*\d+(?::\d+)?\s*(?:s\b|:\d+|\s*[-–—]\s*\d+(?::\d+)?\s*s?)(?:\s+[a-zA-Z0-9\s,&/-]{1,40})?\s*\]/gi,
      " "
    )
    // Remove standalone unbracketed timestamp ranges like 0:00 - 0:05
    .replace(/(?:^|\s)\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}(?=\s|$)/gm, " ")
    // Remove exact section-only tags like [Hook], [Body], [CTA], [Intro], [Outro], [Scene 1]
    .replace(/\[(hook|body|cta|intro|outro|scene\s*\d*)\]/gi, " ")
    // Remove emojis, pictographs, variation selectors, and ZWJ sequences
    .replace(/(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3)/gu, "")
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

  // Convert Myanmar digits (၀-၉) to Arabic digits (0-9) so unified number parsing handles both
  text = myanmarDigitsToArabic(text)

  // Expand shorthand k/K thousands (e.g. 15k -> 15000, 1.5k -> 1500)
  text = text.replace(/(?<![\d.])(\d+(?:\.\d+)?)\s*[kK]\b/g, (_match, num: string) => {
    const parsed = Number.parseFloat(num)
    if (!Number.isFinite(parsed)) return _match
    return String(Math.round(parsed * 1000))
  })

  // Convert percentages (special case 100% -> ရာနှုန်းပြည့်)
  text = text.replace(/(?<![\d.])(\d[\d,]*(?:\.\d+)?)\s*%/g, (_match, num: string) => {
    if (num.replace(/,/g, "") === "100") {
      return "ရာနှုန်းပြည့်"
    }
    return `${numericStringToBurmeseWords(num)} ရာခိုင်နှုန်း`
  })

  // Convert currency-annotated prices (including သိန်း / lakhs and ကျပ်)
  text = text
    .replace(
      /(?:Ks|MMK|Kyats?|ကျပ်)\s*(\d[\d,]*(?:\.\d+)?)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ကျပ်`
    )
    .replace(
      /(\d[\d,]*(?:\.\d+)?)\s*(?:(?:Ks|MMK|Kyats?)\b|ကျပ်)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ကျပ်`
    )
    .replace(
      /(\d[\d,]*(?:\.\d+)?)\s*သိန်း/g,
      (_match, num: string) => {
        const cleaned = num.replace(/,/g, "")
        const [intStr, decStr] = cleaned.split(".")
        if (decStr === "5" && intStr) {
          const intVal = Number.parseInt(intStr, 10)
          if (Number.isFinite(intVal) && intVal > 0) {
            return `${integerToBurmeseWords(intVal)} သိန်းခွဲ`
          }
        }
        return `${numericStringToBurmeseWords(num)} သိန်း`
      }
    )
    .replace(
      /သိန်း\s*(\d[\d,]*(?:\.\d+)?)/g,
      (_match, num: string) => `သိန်း ${numericStringToBurmeseWords(num)}`
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

  // Convert slashes, pipes, commas, semicolons, and hyphens into natural Burmese breath pauses
  text = text
    .replace(/\.{2,}|…/g, "။ ")
    .replace(/\s*\|\s*/g, "။ ")
    .replace(/\s*\/\s*/g, "၊ ")
    .replace(/\s*[-–—]+\s*/g, "၊ ")
    .replace(/[;,]\s*/g, "၊ ")
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
  const store = useContentStore.getState()
  const pool = store.getGeminiKeyPool()
  if (pool.length > 0) {
    const idx =
      ((store.activeGeminiKeyIndex % pool.length) + pool.length) % pool.length
    if (pool[idx]) return pool[idx]
  }
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

export const TTS_SAMPLE_RATE = 24000
export const TTS_NUM_CHANNELS = 1
export const TTS_BITS_PER_SAMPLE = 16
export const TTS_BYTE_RATE = (TTS_SAMPLE_RATE * TTS_NUM_CHANNELS * TTS_BITS_PER_SAMPLE) / 8

function parsePcmSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i)
  if (match && match[1]) {
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return TTS_SAMPLE_RATE
}

interface ParsedWavPcm {
  pcmBytes: Uint8Array
  sampleRate: number
  numChannels: number
  bitsPerSample: number
}

function isRiffWaveHeader(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 44 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x41 && // A
    bytes[10] === 0x56 && // V
    bytes[11] === 0x45 // E
  )
}

/**
 * Strip the RIFF/WAV header (44 bytes or extended chunks) and extract raw PCM payload
 * along with its format metadata. Returns null if bytes are not a valid PCM WAV.
 */
function extractPcmFromWavBytes(bytes: Uint8Array): ParsedWavPcm | null {
  if (!isRiffWaveHeader(bytes)) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let audioFormat = 1
  let numChannels = TTS_NUM_CHANNELS
  let sampleRate = TTS_SAMPLE_RATE
  let bitsPerSample = TTS_BITS_PER_SAMPLE
  let foundFmt = false
  let pcmBytes: Uint8Array | null = null

  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    )
    const chunkSize = view.getUint32(offset + 4, true)
    const payloadStart = offset + 8

    if (id === "fmt " && payloadStart + 16 <= bytes.byteLength) {
      audioFormat = view.getUint16(payloadStart, true)
      numChannels = view.getUint16(payloadStart + 2, true)
      sampleRate = view.getUint32(payloadStart + 4, true)
      bitsPerSample = view.getUint16(payloadStart + 14, true)
      foundFmt = true
    } else if (id === "data") {
      const payloadEnd =
        chunkSize > 0 ? Math.min(bytes.byteLength, payloadStart + chunkSize) : bytes.byteLength
      pcmBytes = bytes.subarray(payloadStart, payloadEnd)
      break
    }

    const paddedSize = chunkSize + (chunkSize % 2)
    const nextOffset = payloadStart + paddedSize
    if (nextOffset <= offset) break
    offset = nextOffset
  }

  if (!pcmBytes) {
    pcmBytes = bytes.subarray(44)
  }

  if (foundFmt && (audioFormat !== 1 || bitsPerSample !== 16)) {
    return null
  }

  return {
    pcmBytes,
    sampleRate: sampleRate > 0 ? sampleRate : TTS_SAMPLE_RATE,
    numChannels: numChannels > 0 ? numChannels : TTS_NUM_CHANNELS,
    bitsPerSample: bitsPerSample > 0 ? bitsPerSample : TTS_BITS_PER_SAMPLE,
  }
}

/**
 * Normalize raw 16-bit signed LE PCM to consistent 24000Hz mono 16-bit PCM
 * so concatenated chunks never shift pitch/speed mid-audio.
 */
function normalizePcmTo24kMono(
  pcmBytes: Uint8Array,
  sampleRate: number,
  numChannels = 1
): Uint8Array {
  const bytesPerFrame = Math.max(1, numChannels) * 2
  const usableBytes = pcmBytes.byteLength - (pcmBytes.byteLength % bytesPerFrame)
  if (usableBytes <= 0) return new Uint8Array(0)

  const aligned = usableBytes === pcmBytes.byteLength ? pcmBytes : pcmBytes.subarray(0, usableBytes)
  if (sampleRate === TTS_SAMPLE_RATE && numChannels === TTS_NUM_CHANNELS) {
    return aligned
  }

  const view = new DataView(aligned.buffer, aligned.byteOffset, aligned.byteLength)
  const frameCount = usableBytes / bytesPerFrame
  const mono = new Float32Array(frameCount)

  for (let i = 0; i < frameCount; i += 1) {
    let sum = 0
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = view.getInt16((i * numChannels + ch) * 2, true)
      sum += sample / 32768
    }
    mono[i] = sum / numChannels
  }

  if (sampleRate === TTS_SAMPLE_RATE) {
    const outBytes = new Uint8Array(frameCount * 2)
    const outView = new DataView(outBytes.buffer)
    for (let i = 0; i < frameCount; i += 1) {
      const clamped = Math.max(-1, Math.min(1, mono[i]))
      outView.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    }
    return outBytes
  }

  const targetFrames = Math.max(1, Math.round((frameCount * TTS_SAMPLE_RATE) / sampleRate))
  const outBytes = new Uint8Array(targetFrames * 2)
  const outView = new DataView(outBytes.buffer)
  const ratio = sampleRate / TTS_SAMPLE_RATE

  for (let i = 0; i < targetFrames; i += 1) {
    const srcPos = i * ratio
    const idx0 = Math.min(frameCount - 1, Math.floor(srcPos))
    const idx1 = Math.min(frameCount - 1, idx0 + 1)
    const frac = srcPos - idx0
    const interpolated = mono[idx0] * (1 - frac) + mono[idx1] * frac
    const clamped = Math.max(-1, Math.min(1, interpolated))
    outView.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }

  return outBytes
}

/**
 * Wrap raw 16-bit signed little-endian PCM bytes in a standard 44-byte RIFF/WAV header
 * so browsers can play and decode it natively.
 */
function pcmToWavBlob(
  pcmBytes: Uint8Array,
  sampleRate = TTS_SAMPLE_RATE,
  numChannels = TTS_NUM_CHANNELS,
  bitsPerSample = TTS_BITS_PER_SAMPLE
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

/**
 * Concatenate multiple 24kHz 16-bit mono PCM buffers sequentially with a brief
 * silence gap and write a single accurate 44-byte RIFF/WAV header.
 */
function concatenatePcmBuffersToWav(pcmChunks: Uint8Array[], gapMs = 120): Blob {
  const nonEmpty = pcmChunks.filter((c) => c.byteLength > 0)
  if (nonEmpty.length === 0) {
    return pcmToWavBlob(new Uint8Array(0), TTS_SAMPLE_RATE, TTS_NUM_CHANNELS, TTS_BITS_PER_SAMPLE)
  }
  if (nonEmpty.length === 1) {
    return pcmToWavBlob(nonEmpty[0], TTS_SAMPLE_RATE, TTS_NUM_CHANNELS, TTS_BITS_PER_SAMPLE)
  }

  const gapSamples = Math.max(0, Math.floor((TTS_SAMPLE_RATE * gapMs) / 1000))
  const gapBytes = gapSamples * 2
  const totalDataLength =
    nonEmpty.reduce((sum, chunk) => sum + chunk.byteLength, 0) + gapBytes * (nonEmpty.length - 1)

  const buffer = new ArrayBuffer(44 + totalDataLength)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + totalDataLength, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, TTS_NUM_CHANNELS, true)
  view.setUint32(24, TTS_SAMPLE_RATE, true)
  view.setUint32(28, TTS_BYTE_RATE, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, TTS_BITS_PER_SAMPLE, true)
  writeString(36, "data")
  view.setUint32(40, totalDataLength, true)

  const out = new Uint8Array(buffer, 44)
  const boundaryFadeSamples = Math.floor((TTS_SAMPLE_RATE * 15) / 1000)
  let offset = 0
  for (let i = 0; i < nonEmpty.length; i += 1) {
    const chunk = nonEmpty[i]
    out.set(chunk, offset)

    // Apply a gentle 15ms fade-in/fade-out at chunk boundaries to eliminate clicks or pitch jumps
    const chunkSamples = Math.floor(chunk.byteLength / 2)
    const maxFadeSamples = Math.min(boundaryFadeSamples, Math.floor(chunkSamples / 2))
    if (maxFadeSamples > 0) {
      const chunkView = new DataView(buffer, 44 + offset, chunkSamples * 2)
      if (i > 0) {
        for (let s = 0; s < maxFadeSamples; s += 1) {
          const gain = s / maxFadeSamples
          const scaled = Math.round(chunkView.getInt16(s * 2, true) * gain)
          chunkView.setInt16(s * 2, scaled, true)
        }
      }
      if (i < nonEmpty.length - 1) {
        for (let s = 0; s < maxFadeSamples; s += 1) {
          const sampleIdx = chunkSamples - maxFadeSamples + s
          const gain = 1 - (s + 1) / maxFadeSamples
          const scaled = Math.round(chunkView.getInt16(sampleIdx * 2, true) * gain)
          chunkView.setInt16(sampleIdx * 2, scaled, true)
        }
      }
    }

    offset += chunk.byteLength
    if (i < nonEmpty.length - 1) {
      // ArrayBuffer is zero-initialized, so advancing offset leaves clean 16-bit PCM silence
      offset += gapBytes
    }
  }

  return new Blob([buffer], { type: "audio/wav" })
}

async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  try {
    return await decodeAudioBlob(blob)
  } catch (err) {
    if (err instanceof TtsError) throw err
    throw new TtsError(
      err instanceof Error ? err.message : "Could not decode synthesized audio."
    )
  }
}

function getSpeedPromptInstruction(speed: VoiceoverSpeed): string {
  switch (speed) {
    case 0.85:
      return "Speak at a calm, unhurried, deliberate pace (0.85x speed)."
    case 0.9:
      return "Speak at a slightly slower, relaxed, clear pace (0.9x speed)."
    case 1.0:
      return "Speak at a natural, conversational pace (1.0x speed)."
    case 1.05:
      return "Speak at a crisp, natural, lively conversational pace (1.05x baseline speed) so Burmese syllables flow smoothly without dragging."
    case 1.1:
      return "Speak at a slightly brisk, energetic social-media pace (1.1x speed)."
    case 1.15:
      return "Speak at a lively, confident, brisk pace (1.15x speed)."
    case 1.2:
      return "Speak at a fast, engaging, punchy TikTok/Reels pace (1.2x speed)."
    default:
      return "Speak at a crisp, natural, lively conversational pace (1.05x baseline speed) so Burmese syllables flow smoothly without dragging."
  }
}

export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts"
export const GEMINI_TTS_FALLBACK_MODEL = "gemini-2.5-flash"
export const GEMINI_SPEECH_PREP_MODEL = "gemini-2.5-flash"
export const GEMINI_TTS_CHUNK_CHARS = 650

/**
 * Fast speech-normalization pass using Gemini 2.5 Flash (when an API key is configured)
 * to convert numbers, years, currency, abbreviations, and symbols into natural spoken
 * Burmese words and place natural breath pauses (`၊` and `။`) at clause boundaries.
 * Always falls back cleanly to deterministic `normalizeBurmeseForTTS`.
 */
export async function prepareBurmeseSpeechText(
  rawText: string,
  customRules?: ReadonlyArray<PronunciationRule>,
  useAiSpeechPrep = true,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  const deterministic = normalizeBurmeseForTTS(rawText, customRules)
  if (!deterministic || !useAiSpeechPrep || deterministic.length > 1800) return deterministic

  // Only invoke an extra Gemini speech-prep request if unexpanded digits or symbols remain;
  // otherwise save the user's Free Tier quota so a 30s script uses 1 single TTS API request.
  const needsAiNormalization = /[\d$%฿€£¥]/.test(deterministic)
  if (!needsAiNormalization) return deterministic

  const apiKey = getSavedGeminiApiKey()
  if (!apiKey) return deterministic

  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  signal?.addEventListener("abort", onParentAbort, { once: true })
  const timeoutId =
    typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), 5500)
      : undefined

  try {
    const prepPrompt = [
      "You are a Burmese (Myanmar) speech-normalization preprocessor for Text-to-Speech.",
      "Rewrite the input text ONLY for natural spoken Burmese TTS delivery:",
      "1. Convert any remaining numbers, years, prices, currencies, percentages, and symbols into natural spoken Burmese words (e.g., 2026 -> နှစ်ထောင့်နှစ်ဆယ့်ခြောက်, 100% -> ရာနှုန်းပြည့်, 15,000 -> တစ်သောင်းငါးထောင်).",
      "2. Keep all English brand names, shop names, product names, and code-switched English words/apostrophes (e.g. \"The Brian's Mobile\", \"iPhone\", \"Order\") in their exact original clean English script—do NOT transliterate or abbreviate them.",
      "3. Ensure natural Burmese breath pauses using `၊` (comma pause) and `။` (sentence end pause) at natural clause boundaries so sentences are never rushed or slurred.",
      "4. Keep the exact meaning and words—do NOT summarize, translate, or add intro/commentary. Return ONLY the normalized Burmese speech text.",
      "",
      deterministic,
    ].join("\n")

    const data = await executeWithGeminiKeyRotation(async (activeKey) => {
      const cleanKey = activeKey.trim()
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_SPEECH_PREP_MODEL}:generateContent?key=${encodeURIComponent(cleanKey)}`
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": cleanKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prepPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
      })

      if (response.status === 429) {
        const errText = await response.text().catch(() => "")
        throw buildGeminiTtsError(429, errText)
      }
      if (!response.ok) return null
      return (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> }
        }>
      }
    }, apiKey)

    if (!data) return deterministic

    const output = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim()

    if (!output) return deterministic
    // Run deterministic pass once more to guarantee no stray digits/markdown remain
    const finalClean = normalizeBurmeseForTTS(output, customRules)
    return finalClean || deterministic
  } catch (err) {
    if (signal?.aborted) {
      throw err instanceof DOMException && err.name === "AbortError"
        ? err
        : new DOMException("Aborted", "AbortError")
    }
    return deterministic
  } finally {
    signal?.removeEventListener("abort", onParentAbort)
    if (timeoutId !== undefined && typeof window !== "undefined") {
      window.clearTimeout(timeoutId)
    }
  }
}

/**
 * Segment text into Burmese-syllable-safe clusters so hard splitting
 * never breaks apart a consonant and its vowels/medials/asat/virama stack.
 */
function segmentBurmeseClusters(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("my", { granularity: "grapheme" })
    const clusters: string[] = []
    let pendingVirama = false
    for (const seg of segmenter.segment(text)) {
      const g = seg.segment
      if (pendingVirama && clusters.length > 0) {
        clusters[clusters.length - 1] += g
      } else {
        clusters.push(g)
      }
      // U+1039 MYANMAR SIGN VIRAMA binds the following consonant into the same syllable cluster
      pendingVirama = g.endsWith("\u1039")
    }
    return clusters
  }

  const codePoints = Array.from(text)
  const clusters: string[] = []
  const myanmarCombiningRe =
    /^[\u102B-\u103E\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D\uAA7B-\uAA7D\u200D\uFE0F]$/
  let pendingVirama = false
  for (const ch of codePoints) {
    if (clusters.length > 0 && (pendingVirama || myanmarCombiningRe.test(ch))) {
      clusters[clusters.length - 1] += ch
    } else {
      clusters.push(ch)
    }
    pendingVirama = ch === "\u1039"
  }
  return clusters
}

/**
 * Split long scripts cleanly at sentence boundaries (`။` / `.` / newlines / spaces)
 * into balanced chunks (~650 chars / ~35–40 seconds of Burmese speech) so a typical
 * 30-second script uses only 1 single API request while never splitting inside a
 * Burmese syllable cluster.
 */
export function splitScriptIntoChunks(
  text: string,
  maxChunkChars = GEMINI_TTS_CHUNK_CHARS
): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxChunkChars) return [normalized]

  const lines = normalized
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const pushHardSplit = (segment: string, out: string[]) => {
    const clusters = segmentBurmeseClusters(segment)
    let buf = ""
    for (const cluster of clusters) {
      if (buf && buf.length + cluster.length > maxChunkChars) {
        const trimmed = buf.trim()
        if (trimmed) out.push(trimmed)
        buf = cluster
      } else {
        buf += cluster
      }
    }
    if (buf.trim()) out.push(buf.trim())
  }

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
        const subParts = trimmed.split(/(?<=[၊,])\s*/)
        let subCurrent = ""
        for (const sub of subParts) {
          const subTrimmed = sub.trim()
          if (!subTrimmed) continue
          if (subTrimmed.length > maxChunkChars) {
            if (subCurrent.trim()) {
              sentences.push(subCurrent.trim())
              subCurrent = ""
            }
            const words = subTrimmed.split(/\s+/)
            if (words.length > 1) {
              let wordBuf = ""
              for (const w of words) {
                if (w.length > maxChunkChars) {
                  if (wordBuf.trim()) {
                    sentences.push(wordBuf.trim())
                    wordBuf = ""
                  }
                  pushHardSplit(w, sentences)
                } else if (wordBuf && wordBuf.length + w.length + 1 > maxChunkChars) {
                  sentences.push(wordBuf.trim())
                  wordBuf = w
                } else {
                  wordBuf = wordBuf ? `${wordBuf} ${w}` : w
                }
              }
              if (wordBuf.trim()) {
                sentences.push(wordBuf.trim())
              }
            } else {
              pushHardSplit(subTrimmed, sentences)
            }
            continue
          }

          if (subCurrent && subCurrent.length + subTrimmed.length + 1 > maxChunkChars) {
            sentences.push(subCurrent.trim())
            subCurrent = subTrimmed
          } else {
            subCurrent = subCurrent ? `${subCurrent} ${subTrimmed}` : subTrimmed
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
  // Prevent isolated short trailing chunks (< 140 chars) from wasting an extra API request
  if (chunks.length >= 2) {
    const lastChunk = chunks[chunks.length - 1]
    const prevChunk = chunks[chunks.length - 2]
    const merged = `${prevChunk} ${lastChunk}`
    if (lastChunk.length < 140 && merged.length <= maxChunkChars + 150) {
      chunks.splice(chunks.length - 2, 2, merged)
    }
  }
  return chunks
}

function audioBufferTo24kMonoPcm(audioBuffer: AudioBuffer): Uint8Array {
  const length = audioBuffer.length
  const channelCount = audioBuffer.numberOfChannels
  const mono = new Float32Array(length)

  for (let i = 0; i < length; i += 1) {
    let sample = 0
    for (let ch = 0; ch < channelCount; ch += 1) {
      sample += audioBuffer.getChannelData(ch)[i] ?? 0
    }
    mono[i] = sample / Math.max(1, channelCount)
  }

  const srcRate = audioBuffer.sampleRate
  if (srcRate === TTS_SAMPLE_RATE) {
    const pcmBytes = new Uint8Array(length * 2)
    const view = new DataView(pcmBytes.buffer)
    for (let i = 0; i < length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, mono[i]))
      view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    }
    return pcmBytes
  }

  const targetFrames = Math.max(1, Math.round((length * TTS_SAMPLE_RATE) / srcRate))
  const pcmBytes = new Uint8Array(targetFrames * 2)
  const view = new DataView(pcmBytes.buffer)
  const ratio = srcRate / TTS_SAMPLE_RATE
  for (let i = 0; i < targetFrames; i += 1) {
    const srcPos = i * ratio
    const idx0 = Math.min(length - 1, Math.floor(srcPos))
    const idx1 = Math.min(length - 1, idx0 + 1)
    const frac = srcPos - idx0
    const interpolated = mono[idx0] * (1 - frac) + mono[idx1] * frac
    const clamped = Math.max(-1, Math.min(1, interpolated))
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return pcmBytes
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

export async function concatenateAudioBlobsToWav(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) {
    return pcmToWavBlob(new Uint8Array(0), TTS_SAMPLE_RATE, TTS_NUM_CHANNELS, TTS_BITS_PER_SAMPLE)
  }
  if (blobs.length === 1) return blobs[0]

  const pcmChunks: Uint8Array[] = []
  let ctx: AudioContext | null = null

  try {
    for (const blob of blobs) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const parsedWav = extractPcmFromWavBytes(bytes)
      if (parsedWav) {
        const normalized = normalizePcmTo24kMono(
          parsedWav.pcmBytes,
          parsedWav.sampleRate,
          parsedWav.numChannels
        )
        if (normalized.byteLength > 0) {
          pcmChunks.push(normalized)
        }
        continue
      }

      if (!ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!AudioCtx) {
          throw new TtsError("Web Audio API is not supported in this browser.")
        }
        ctx = new AudioCtx()
      }

      const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0))
      const normalized = audioBufferTo24kMonoPcm(decoded)
      if (normalized.byteLength > 0) {
        pcmChunks.push(normalized)
      }
    }

    return concatenatePcmBuffersToWav(pcmChunks, 120)
  } finally {
    if (ctx) {
      await ctx.close().catch(() => {})
    }
  }
}

interface ParsedGeminiApiError {
  message: string
  statusText?: string
  retryDelay?: string
}

function parseGeminiErrorPayload(errText: string): ParsedGeminiApiError {
  const raw = errText.trim()
  if (!raw) {
    return { message: "" }
  }

  let message = ""
  let statusText: string | undefined
  let retryDelay: string | undefined

  try {
    const parsed = JSON.parse(raw) as
      | {
          error?: {
            code?: number
            message?: string
            status?: string
            details?: Array<{
              "@type"?: string
              retryDelay?: string
              violations?: Array<{ quotaId?: string; quotaMetric?: string }>
            }>
          }
        }
      | Array<{
          error?: {
            code?: number
            message?: string
            status?: string
            details?: Array<{
              "@type"?: string
              retryDelay?: string
              violations?: Array<{ quotaId?: string; quotaMetric?: string }>
            }>
          }
        }>

    const errObj = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error
    if (errObj) {
      if (typeof errObj.message === "string" && errObj.message.trim()) {
        message = errObj.message.trim()
      }
      if (typeof errObj.status === "string" && errObj.status.trim()) {
        statusText = errObj.status.trim()
      }
      if (Array.isArray(errObj.details)) {
        for (const detail of errObj.details) {
          if (typeof detail?.retryDelay === "string" && detail.retryDelay.trim()) {
            retryDelay = detail.retryDelay.trim()
          }
          if (Array.isArray(detail?.violations)) {
            const quotaTags = detail.violations
              .map((v) => v.quotaId || v.quotaMetric || "")
              .filter(Boolean)
              .join(", ")
            if (quotaTags && !message.includes(quotaTags)) {
              message = message ? `${message} [${quotaTags}]` : quotaTags
            }
          }
        }
      }
    }
  } catch {
    // Non-JSON error body; fall back to raw text
  }

  if (!message) {
    message = raw
  }

  if (!retryDelay) {
    const retryMatch =
      message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?s)/i) ||
      raw.match(/"retryDelay"\s*:\s*"([^"]+)"/i)
    if (retryMatch?.[1]) {
      retryDelay = retryMatch[1]
    }
  }

  return { message, statusText, retryDelay }
}

export function buildGeminiTtsError(status: number, errText: string): TtsError {
  const { message, statusText, retryDelay } = parseGeminiErrorPayload(errText)
  const cleanDetail = message.replace(/\s+/g, " ").trim()
  const combinedSource = `${cleanDetail} ${errText}`

  if (status === 429) {
    const isDailyOrQuotaExceeded =
      /PerDay|daily|Quota exceeded|GenerateRequestsPerDay|free_tier_requests|limit:\s*0\b/i.test(
        combinedSource
      )
    if (isDailyOrQuotaExceeded) {
      const detailSuffix = cleanDetail ? ` — [${cleanDetail}]` : ""
      return new TtsError(
        `ယနေ့အတွက် Gemini TTS အခမဲ့ အသုံးပြုခွင့် ပြည့်သွားပါပြီ (Settings တွင် API Key အသစ် ပြောင်းထည့်သုံးနိုင်ပါသည်)${detailSuffix}`,
        429
      )
    }

    const delayNote = retryDelay
      ? `Retry after ${retryDelay}`
      : "Per-minute rate limit reached"
    const detailSuffix = cleanDetail ? ` — ${cleanDetail}` : ""
    return new TtsError(
      `Gemini TTS တစ်မိနစ်အတွင်း အသုံးပြုမှု ကန့်သတ်ချက် ပြည့်သွားပါသည် (${delayNote})${detailSuffix}`,
      429
    )
  }

  if (status === 400 || status === 404 || status === 403 || status === 401) {
    const statusLabel = statusText ? `${status} ${statusText}` : `HTTP ${status}`
    const detail = cleanDetail || "Request rejected by Gemini API (check API Key, model ID, or voiceName)."
    return new TtsError(`Gemini TTS Error (${statusLabel}): ${detail}`, status)
  }

  const fallbackDetail = cleanDetail || `HTTP ${status}`
  return new TtsError(`Gemini TTS Error (HTTP ${status}): ${fallbackDetail}`, status)
}

async function synthesizeGeminiChunk(
  chunkText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  apiKey: string,
  signal?: AbortSignal
): Promise<
  | { kind: "pcm"; pcmBytes: Uint8Array; sampleRate: number }
  | { kind: "blob"; blob: Blob; mimeType: string; fileExtension: "wav" | "mp3" }
> {
  return executeWithGeminiKeyRotation(
    (activeKey) =>
      synthesizeGeminiChunkWithSingleKey(
        chunkText,
        preset,
        speed,
        deliveryTone,
        activeKey,
        signal
      ),
    apiKey
  )
}

async function synthesizeGeminiChunkWithSingleKey(
  chunkText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  apiKey: string,
  signal?: AbortSignal
): Promise<
  | { kind: "pcm"; pcmBytes: Uint8Array; sampleRate: number }
  | { kind: "blob"; blob: Blob; mimeType: string; fileExtension: "wav" | "mp3" }
> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  const cleanKey = apiKey.trim()
  const tonePreset = VOICE_DELIVERY_PRESETS[deliveryTone] ?? VOICE_DELIVERY_PRESETS.normal
  const narratorName =
    preset.id === "deep_male"
      ? "Ko Khant"
      : preset.id === "male"
        ? "Thiha"
        : "Nilar"

  const characterCadenceNote =
    preset.id === "deep_male"
      ? "Speak with a brisk, articulate, confident male narrator cadence—clear and energetic, never slow or flat."
      : ""

  // Send ONLY the exact clean script text to be spoken—never include previous-sentence
  // reference text, which causes Gemini TTS to read it aloud or stutter/repeat syllables.
  const prompt = [
    `You are ${narratorName}, a native Yangon Myanmar (Burmese) professional voiceover narrator.`,
    tonePreset.styleInstruction,
    characterCadenceNote,
    `Maintain a steady, consistent vocal pitch and pace. ${getSpeedPromptInstruction(speed)}`,
    "Pause briefly at Burmese comma marks (၊) for natural breaths and pause clearly at sentence-ending marks (။).",
    "Speak natural Yangon Burmese, and pronounce any English brand or shop names cleanly in natural English.",
    "Read ONLY the exact script below aloud without adding any intro or extra words:",
    "",
    chunkText,
  ]
    .filter((line, idx) => idx >= 4 || line !== "")
    .join("\n")

  const headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": cleanKey,
  }

  const modelCandidates = [GEMINI_TTS_MODEL, GEMINI_TTS_FALLBACK_MODEL]
  const voiceCandidates = Array.from(
    new Set([preset.geminiVoice, preset.geminiFallbackVoice].filter(Boolean))
  )

  let response: Response | null = null
  let lastErrorText = ""
  let lastStatus = 0

  outerLoop: for (let modelIdx = 0; modelIdx < modelCandidates.length; modelIdx += 1) {
    const modelId = modelCandidates[modelIdx]
    const standardUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(cleanKey)}`

    for (let voiceIdx = 0; voiceIdx < voiceCandidates.length; voiceIdx += 1) {
      const voiceName = voiceCandidates[voiceIdx]
      const requestBody = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      })

      const maxAttempts = 2
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError")
        }
        response = null
        if (cleanKey.startsWith("AQ.")) {
          const vertexUrl = `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelId}:generateContent?key=${encodeURIComponent(cleanKey)}`
          try {
            const vertexRes = await fetch(vertexUrl, {
              method: "POST",
              headers,
              body: requestBody,
              signal,
            })
            if (vertexRes.ok) {
              response = vertexRes
            }
          } catch (err) {
            if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
              throw err
            }
            // Fall back to generativelanguage.googleapis.com
          }
        }

        if (!response) {
          try {
            response = await fetch(standardUrl, {
              method: "POST",
              headers,
              body: requestBody,
              signal,
            })
          } catch (err) {
            if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
              throw err
            }
            if (
              attempt === maxAttempts - 1 &&
              voiceIdx === voiceCandidates.length - 1 &&
              modelIdx === modelCandidates.length - 1
            ) {
              throw new TtsError(
                `Network Error: ${err instanceof Error ? err.message : "Failed to reach Gemini TTS endpoint"}`
              )
            }
          }
        }

        if (response?.ok) break outerLoop

        if (response && !response.ok) {
          lastStatus = response.status
          lastErrorText = await response.text().catch(() => "")

          // Immediate throw on 429 or 401/403 so we don't burn extra requests
          if (response.status === 429 || response.status === 401 || response.status === 403) {
            throw buildGeminiTtsError(response.status, lastErrorText)
          }

          // If model returned 404 (or 400 mentioning model/modality unsupported), fall back to next model immediately
          if (response.status === 404 && modelIdx < modelCandidates.length - 1) {
            break
          }

          // If 400 error, try fallback voice or fallback model
          if (response.status === 400) {
            break
          }
        }

        if (attempt < maxAttempts - 1 && (!response || response.status >= 500)) {
          await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(resolve, 600 * (attempt + 1))
            signal?.addEventListener(
              "abort",
              () => {
                window.clearTimeout(timer)
                reject(new DOMException("Aborted", "AbortError"))
              },
              { once: true }
            )
          })
          continue
        }
        break
      }

      // If the current model returned 404, skip remaining voices for this model and try fallback model
      if (lastStatus === 404 && modelIdx < modelCandidates.length - 1) {
        break
      }
    }
  }

  if (!response) {
    throw new TtsError("Network Error: Could not connect to Gemini TTS API.")
  }

  if (!response.ok) {
    throw buildGeminiTtsError(lastStatus || response.status, lastErrorText)
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

  // Strip any 44-byte (or extended) RIFF/WAV header if Gemini returned WAV-wrapped PCM,
  // and normalize to consistent 24000Hz 16-bit mono PCM.
  const parsedWav = extractPcmFromWavBytes(bytes)
  if (parsedWav) {
    const normalizedPcm = normalizePcmTo24kMono(
      parsedWav.pcmBytes,
      parsedWav.sampleRate,
      parsedWav.numChannels
    )
    return { kind: "pcm", pcmBytes: normalizedPcm, sampleRate: TTS_SAMPLE_RATE }
  }

  const sampleRate = parsePcmSampleRate(rawMime)
  const normalizedPcm = normalizePcmTo24kMono(bytes, sampleRate, 1)
  return { kind: "pcm", pcmBytes: normalizedPcm, sampleRate: TTS_SAMPLE_RATE }
}

async function synthesizeWithGemini(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  apiKey: string,
  onChunkProgress?: (currentChunk: number, totalChunks: number) => void,
  signal?: AbortSignal
): Promise<{
  blob: Blob
  mimeType: string
  fileExtension: "wav" | "mp3"
  segments: VoiceoverSegmentItem[]
}> {
  const chunks = splitScriptIntoChunks(cleanedText, GEMINI_TTS_CHUNK_CHARS)
  const chunkResults = []
  for (let i = 0; i < chunks.length; i += 1) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    onChunkProgress?.(i + 1, chunks.length)
    chunkResults.push(
      await synthesizeGeminiChunk(chunks[i], preset, speed, deliveryTone, apiKey, signal)
    )
  }

  const timestamp = Date.now()
  const segments: VoiceoverSegmentItem[] = await Promise.all(
    chunkResults.map(async (res, idx) => {
      const segBlob =
        res.kind === "pcm"
          ? await applyStudioVocalEqToPcm16(res.pcmBytes, TTS_SAMPLE_RATE)
          : res.blob
      const durationSeconds =
        res.kind === "pcm"
          ? res.pcmBytes.byteLength / TTS_BYTE_RATE
          : Math.max(0.5, estimateSpokenDurationSeconds(chunks[idx], speed))
      return {
        id: `seg-${timestamp}-${idx}`,
        text: chunks[idx],
        blob: segBlob,
        audioUrl: URL.createObjectURL(segBlob),
        durationSeconds,
        provider: "gemini" as const,
        pcmBytes: res.kind === "pcm" ? res.pcmBytes : undefined,
      }
    })
  )

  if (chunkResults.length === 1) {
    const single = chunkResults[0]
    if (single.kind === "pcm") {
      return {
        blob: segments[0].blob,
        mimeType: "audio/wav",
        fileExtension: "wav",
        segments,
      }
    }
    return {
      blob: single.blob,
      mimeType: single.mimeType,
      fileExtension: single.fileExtension,
      segments,
    }
  }

  if (chunkResults.every((r) => r.kind === "pcm")) {
    const pcmChunks = chunkResults.map((r) => (r.kind === "pcm" ? r.pcmBytes : new Uint8Array(0)))
    const mergedRawWav = concatenatePcmBuffersToWav(pcmChunks, 120)
    const parsedMerged = extractPcmFromWavBytes(new Uint8Array(await mergedRawWav.arrayBuffer()))
    const studioMergedBlob = parsedMerged
      ? await applyStudioVocalEqToPcm16(parsedMerged.pcmBytes, TTS_SAMPLE_RATE)
      : mergedRawWav
    return {
      blob: studioMergedBlob,
      mimeType: "audio/wav",
      fileExtension: "wav",
      segments,
    }
  }

  const blobs = segments.map((s) => s.blob)
  const mergedWav = await concatenateAudioBlobsToWav(blobs)
  return { blob: mergedWav, mimeType: "audio/wav", fileExtension: "wav", segments }
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
  speed: VoiceoverSpeed,
  signal?: AbortSignal
): Promise<{ blob: Blob; mimeType: string; fileExtension: "mp3" }> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  const endpoint =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4"

  return new Promise((resolve, reject) => {
    let settled = false
    const chunks: Uint8Array[] = []
    let ws: WebSocket | null = null

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      try {
        ws?.close()
      } catch {
        // Ignore close errors
      }
      reject(new DOMException("Aborted", "AbortError"))
    }

    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      try {
        ws?.close()
      } catch {
        // Ignore close errors
      }
      reject(new TtsError("Neural TTS request timed out."))
    }, 15000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
    }

    signal?.addEventListener("abort", onAbort, { once: true })

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

export interface VoiceoverProgress {
  currentChunk: number
  totalChunks: number
}

export interface GenerateVoiceoverOptions {
  deliveryTone?: VoiceDeliveryTone
  customPronunciations?: ReadonlyArray<PronunciationRule>
  introSfx?: SoundEffectType
  useAiSpeechPrep?: boolean
  signal?: AbortSignal
  onStageChange?: (stage: "preparing" | "generating") => void
  onProgress?: (progress: VoiceoverProgress) => void
}

const MYANMAR_DIGIT_MAP = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"] as const

export function toBurmeseDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => MYANMAR_DIGIT_MAP[Number(d)] ?? d)
}

export function formatAudioClockDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`
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
  const unlocked = unlockIosAudio()
  const AudioCtx = getAudioContextConstructor()
  if (!AudioCtx && !unlocked) return

  const ctx = unlocked && unlocked.state !== "closed" ? unlocked : new AudioCtx!()
  const shouldClose = ctx !== unlocked
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
    if (shouldClose) {
      await ctx.close().catch(() => {})
    }
  }
}

async function synthesizeSpeechSegmentBlob(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  onChunkProgress?: (currentChunk: number, totalChunks: number) => void,
  signal?: AbortSignal
): Promise<{
  blob: Blob
  mimeType: string
  fileExtension: "wav" | "mp3"
  voiceName: string
  provider: "gemini" | "neural-tts" | "speech-synthesis"
  segments: VoiceoverSegmentItem[]
}> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  const cacheKey = buildTtsCacheKey(preset.id, deliveryTone, speed, cleanedText)
  const cachedSeg = getCachedTtsClip(cacheKey)
  if (cachedSeg) {
    onChunkProgress?.(1, 1)
    return {
      blob: cachedSeg.blob,
      mimeType: cachedSeg.mimeType,
      fileExtension: cachedSeg.fileExtension,
      voiceName: cachedSeg.voiceName,
      provider: cachedSeg.provider,
      segments: cloneSegmentsFromCache(cachedSeg.segments),
    }
  }

  const geminiKey = getSavedGeminiApiKey()

  if (geminiKey) {
    try {
      const geminiResult = await synthesizeWithGemini(
        cleanedText,
        preset,
        speed,
        deliveryTone,
        geminiKey,
        onChunkProgress,
        signal
      )
      const voiceName = `${preset.label} · Gemini`
      setCachedTtsClip(cacheKey, {
        blob: geminiResult.blob,
        mimeType: geminiResult.mimeType,
        fileExtension: geminiResult.fileExtension,
        voiceName,
        provider: "gemini",
        cleanedText,
        segments: toCachedSegments(geminiResult.segments),
      })
      return {
        ...geminiResult,
        voiceName,
        provider: "gemini",
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        throw err
      }
      if (err instanceof TtsError) {
        throw err
      }
      throw new TtsError(
        err instanceof Error
          ? err.message
          : "Gemini အသံထုတ်ရာတွင် အဆင်မပြေပါ — ခဏစောင့်ပြီး ပြန်နှိပ်ပါ"
      )
    }
  }

  try {
    const neuralChunks = splitScriptIntoChunks(cleanedText, 200)
    let neuralBlob: Blob
    let neuralMime = "audio/mpeg"
    let neuralExt: "mp3" | "wav" = "mp3"
    const timestamp = Date.now()
    const segments: VoiceoverSegmentItem[] = []

    if (neuralChunks.length <= 1) {
      onChunkProgress?.(1, 1)
      const single = await synthesizeWithNeuralTts(cleanedText, preset, speed, signal)
      neuralBlob = single.blob
      neuralMime = single.mimeType
      neuralExt = single.fileExtension
      segments.push({
        id: `seg-${timestamp}-0`,
        text: neuralChunks[0] ?? cleanedText,
        blob: single.blob,
        audioUrl: URL.createObjectURL(single.blob),
        durationSeconds: Math.max(0.5, estimateSpokenDurationSeconds(cleanedText, speed)),
        provider: "neural-tts",
      })
    } else {
      const chunkBlobs: Blob[] = []
      for (let i = 0; i < neuralChunks.length; i += 1) {
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError")
        }
        onChunkProgress?.(i + 1, neuralChunks.length)
        const res = await synthesizeWithNeuralTts(neuralChunks[i], preset, speed, signal)
        chunkBlobs.push(res.blob)
        segments.push({
          id: `seg-${timestamp}-${i}`,
          text: neuralChunks[i],
          blob: res.blob,
          audioUrl: URL.createObjectURL(res.blob),
          durationSeconds: Math.max(0.5, estimateSpokenDurationSeconds(neuralChunks[i], speed)),
          provider: "neural-tts",
        })
      }
      neuralBlob = await concatenateAudioBlobsToWav(chunkBlobs)
      neuralMime = "audio/wav"
      neuralExt = "wav"
    }

    const voiceName = `${preset.label} · ${preset.neuralVoice}`
    setCachedTtsClip(cacheKey, {
      blob: neuralBlob,
      mimeType: neuralMime,
      fileExtension: neuralExt,
      voiceName,
      provider: "neural-tts",
      cleanedText,
      segments: toCachedSegments(segments),
    })

    return {
      blob: neuralBlob,
      mimeType: neuralMime,
      fileExtension: neuralExt,
      voiceName,
      provider: "neural-tts",
      segments,
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw err
    }
    onChunkProgress?.(1, 1)
    const speechResult = synthesizeWithSpeechSynthesis(cleanedText, preset, speed)
    return {
      ...speechResult,
      voiceName: `${preset.label} · Browser Speech`,
      provider: "speech-synthesis",
      segments: [
        {
          id: `seg-${Date.now()}-0`,
          text: cleanedText,
          blob: speechResult.blob,
          audioUrl: URL.createObjectURL(speechResult.blob),
          durationSeconds: Math.max(0.5, estimateSpokenDurationSeconds(cleanedText, speed)),
          provider: "speech-synthesis",
        },
      ],
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
  const deliveryTone = options.deliveryTone ?? "normal"
  const introSfx = options.introSfx ?? "none"
  const useAiSpeechPrep = options.useAiSpeechPrep ?? true
  const signal = options.signal
  const preset = BURMESE_VOICE_PRESETS[voiceType]

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  const deterministicNormalized = optimizeScriptPreservingPauses(
    scriptText,
    options.customPronunciations
  )
  const fullVoiceId =
    introSfx === "none" ? voiceType : `${voiceType}:${introSfx}`
  const preNormCacheKey = deterministicNormalized
    ? buildTtsCacheKey(fullVoiceId, deliveryTone, speed, deterministicNormalized)
    : ""

  if (preNormCacheKey) {
    const cachedFull = getCachedTtsClip(preNormCacheKey)
    if (cachedFull) {
      options.onStageChange?.("generating")
      options.onProgress?.({ currentChunk: 1, totalChunks: 1 })
      const audioBuffer = await decodeBlobToAudioBuffer(cachedFull.blob)
      const audioUrl = URL.createObjectURL(cachedFull.blob)
      return {
        audioUrl,
        blob: cachedFull.blob,
        audioBuffer,
        mimeType: cachedFull.mimeType,
        fileExtension: cachedFull.fileExtension,
        durationSeconds: audioBuffer.duration,
        voiceName: cachedFull.voiceName,
        provider: cachedFull.provider,
        cleanedText: cachedFull.cleanedText,
        segments: cloneSegmentsFromCache(cachedFull.segments),
      }
    }
  }

  options.onStageChange?.("preparing")

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
      const normalized = await prepareBurmeseSpeechText(
        seg.text,
        options.customPronunciations,
        useAiSpeechPrep,
        signal
      )
      if (normalized) {
        normalizedTimeline.push({ kind: "speech", text: normalized })
      }
    }
  }

  options.onStageChange?.("generating")

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
  const onProgress = options.onProgress

  // Fast path: single speech segment and no SFX
  if (!hasPauses && introSfx === "none" && speechSegments.length === 1) {
    const single = await synthesizeSpeechSegmentBlob(
      speechSegments[0].text,
      preset,
      speed,
      deliveryTone,
      onProgress
        ? (currentChunk, totalChunks) => onProgress({ currentChunk, totalChunks })
        : undefined,
      signal
    )
    const audioBuffer = await decodeBlobToAudioBuffer(single.blob)
    const audioUrl = URL.createObjectURL(single.blob)
    if (preNormCacheKey) {
      setCachedTtsClip(preNormCacheKey, {
        blob: single.blob,
        mimeType: single.mimeType,
        fileExtension: single.fileExtension,
        voiceName: single.voiceName,
        provider: single.provider,
        cleanedText: combinedCleanedText,
        segments: toCachedSegments(single.segments),
      })
    }
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
      segments: single.segments,
    }
  }

  // Multi-segment (with pauses) and/or intro SFX path
  const segmentChunkCounts = speechSegments.map(
    (seg) => splitScriptIntoChunks(seg.text, GEMINI_TTS_CHUNK_CHARS).length
  )
  const totalChunksAllSegments = Math.max(
    1,
    segmentChunkCounts.reduce((sum, count) => sum + count, 0)
  )
  let completedChunksBeforeSegment = 0

  const audioTimeline: Array<
    | { kind: "speech"; blob: Blob }
    | { kind: "pause"; seconds: number }
  > = []

  let lastVoiceName = `${preset.label} · ${preset.neuralVoice}`
  let lastProvider: VoiceoverResult["provider"] = "neural-tts"
  let speechIdx = 0
  const allSegments: VoiceoverSegmentItem[] = []

  for (const item of normalizedTimeline) {
    if (item.kind === "pause") {
      audioTimeline.push(item)
    } else {
      const segBase = completedChunksBeforeSegment
      const segChunksCount = segmentChunkCounts[speechIdx] ?? 1
      const res = await synthesizeSpeechSegmentBlob(
        item.text,
        preset,
        speed,
        deliveryTone,
        onProgress
          ? (currentChunk, totalChunks) => {
              const scaled =
                totalChunks === segChunksCount
                  ? segBase + currentChunk
                  : segBase + Math.min(segChunksCount, Math.ceil((currentChunk / Math.max(1, totalChunks)) * segChunksCount))
              onProgress({
                currentChunk: Math.min(totalChunksAllSegments, Math.max(1, scaled)),
                totalChunks: totalChunksAllSegments,
              })
            }
          : undefined,
        signal
      )
      completedChunksBeforeSegment += segChunksCount
      speechIdx += 1
      lastVoiceName = res.voiceName
      lastProvider = res.provider
      allSegments.push(...res.segments)
      audioTimeline.push({ kind: "speech", blob: res.blob })
    }
  }

  const assembled = await assembleSegmentsWithPausesAndSfx(audioTimeline, introSfx)
  const audioUrl = URL.createObjectURL(assembled.blob)
  if (preNormCacheKey) {
    setCachedTtsClip(preNormCacheKey, {
      blob: assembled.blob,
      mimeType: "audio/wav",
      fileExtension: "wav",
      voiceName: lastVoiceName,
      provider: lastProvider,
      cleanedText: combinedCleanedText,
      segments: toCachedSegments(allSegments),
    })
  }
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
    segments: allSegments,
  }
}

export interface DialogueTurn {
  speaker: BurmeseVoiceType
  text: string
}

const FEMALE_LABEL_RE = /^(?:nilar|နီလာ|female|speaker\s*1|a)\s*[:：]\s*/i
const MALE_LABEL_RE = /^(?:thiha|သီဟ|male|speaker\s*2|b)\s*[:：]\s*/i

export function parseDialogueTurns(rawScript: string): DialogueTurn[] {
  const lines = rawScript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const turns: DialogueTurn[] = []
  let nextAlternating: BurmeseVoiceType = "female"

  for (const line of lines) {
    let speaker: BurmeseVoiceType
    let text: string
    if (FEMALE_LABEL_RE.test(line)) {
      speaker = "female"
      text = line.replace(FEMALE_LABEL_RE, "").trim()
    } else if (MALE_LABEL_RE.test(line)) {
      speaker = "male"
      text = line.replace(MALE_LABEL_RE, "").trim()
    } else {
      speaker = nextAlternating
      text = line
    }
    if (!text) continue
    turns.push({ speaker, text })
    nextAlternating = speaker === "female" ? "male" : "female"
  }

  return turns
}

/**
 * Dual-Voice Dialogue Mode: alternates between Nilar (Female) and Thiha (Male)
 * for conversational scripts, inserting natural 0.35s pauses between turns.
 */
export async function generateBurmeseDialogueVoiceover(
  scriptText: string,
  speed: VoiceoverSpeed = 1.0,
  options: GenerateVoiceoverOptions = {}
): Promise<VoiceoverResult> {
  const turns = parseDialogueTurns(scriptText)
  if (turns.length === 0) {
    throw new TtsError("Dialogue script is empty.")
  }

  const deliveryTone = options.deliveryTone ?? "normal"
  const introSfx = options.introSfx ?? "none"
  const useAiSpeechPrep = options.useAiSpeechPrep ?? true
  const onProgress = options.onProgress

  const dialogueNormalizedKey = turns
    .map((t) => `${t.speaker}:${normalizeBurmeseForTTS(t.text, options.customPronunciations)}`)
    .join("|")
  const dialogueVoiceId =
    introSfx === "none" ? "dialogue" : `dialogue:${introSfx}`
  const dialogueCacheKey = dialogueNormalizedKey
    ? buildTtsCacheKey(dialogueVoiceId, deliveryTone, speed, dialogueNormalizedKey)
    : ""

  if (dialogueCacheKey) {
    const cachedDialogue = getCachedTtsClip(dialogueCacheKey)
    if (cachedDialogue) {
      options.onStageChange?.("generating")
      onProgress?.({ currentChunk: turns.length, totalChunks: turns.length })
      const audioBuffer = await decodeBlobToAudioBuffer(cachedDialogue.blob)
      const audioUrl = URL.createObjectURL(cachedDialogue.blob)
      return {
        audioUrl,
        blob: cachedDialogue.blob,
        audioBuffer,
        mimeType: cachedDialogue.mimeType,
        fileExtension: cachedDialogue.fileExtension,
        durationSeconds: audioBuffer.duration,
        voiceName: cachedDialogue.voiceName,
        provider: cachedDialogue.provider,
        cleanedText: cachedDialogue.cleanedText,
      }
    }
  }

  options.onStageChange?.("preparing")

  const timeline: Array<
    | { kind: "speech"; blob: Blob }
    | { kind: "pause"; seconds: number }
  > = []

  const cleanedParts: string[] = []
  let lastProvider: VoiceoverResult["provider"] = "neural-tts"

  options.onStageChange?.("generating")
  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i]
    onProgress?.({ currentChunk: i + 1, totalChunks: turns.length })
    const res = await generateBurmeseVoiceover(turn.text, turn.speaker, speed, {
      deliveryTone,
      introSfx: "none",
      customPronunciations: options.customPronunciations,
      useAiSpeechPrep,
      signal: options.signal,
    })
    lastProvider = res.provider
    cleanedParts.push(`${turn.speaker === "female" ? "Nilar" : "Thiha"}: ${res.cleanedText}`)
    timeline.push({ kind: "speech", blob: res.blob })
    URL.revokeObjectURL(res.audioUrl)
    if (i < turns.length - 1) {
      timeline.push({ kind: "pause", seconds: 0.35 })
    }
  }

  const assembled = await assembleSegmentsWithPausesAndSfx(timeline, introSfx)
  const audioUrl = URL.createObjectURL(assembled.blob)
  const joinedCleanedText = cleanedParts.join("\n")
  if (dialogueCacheKey) {
    setCachedTtsClip(dialogueCacheKey, {
      blob: assembled.blob,
      mimeType: "audio/wav",
      fileExtension: "wav",
      voiceName: "Nilar + Thiha (Dialogue)",
      provider: lastProvider,
      cleanedText: joinedCleanedText,
      segments: [],
    })
  }
  return {
    audioUrl,
    blob: assembled.blob,
    audioBuffer: assembled.audioBuffer,
    mimeType: "audio/wav",
    fileExtension: "wav",
    durationSeconds: assembled.audioBuffer.duration,
    voiceName: "Nilar + Thiha (Dialogue)",
    provider: lastProvider,
    cleanedText: joinedCleanedText,
  }
}

export type StandaloneBgMusicPreset =
  | "none"
  | "lofi_chill"
  | "calm_lofi"
  | "upbeat_promo"
  | "soft_piano"
  | "soft_vlog"

function synthesizeAmbientLoopBuffer(
  ctx: BaseAudioContext,
  preset: Exclude<StandaloneBgMusicPreset, "none">,
  durationSeconds: number
): AudioBuffer {
  const normalizedPreset: "lofi_chill" | "upbeat_promo" | "soft_piano" =
    preset === "calm_lofi"
      ? "lofi_chill"
      : preset === "soft_vlog"
        ? "soft_piano"
        : preset

  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.ceil(durationSeconds * sampleRate))
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  const chords: Record<"lofi_chill" | "upbeat_promo" | "soft_piano", number[][]> = {
    lofi_chill: [
      [220, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 349.23],
      [164.81, 196.0, 246.94, 293.66],
    ],
    upbeat_promo: [
      [261.63, 329.63, 392.0],
      [293.66, 369.99, 440.0],
      [220.0, 261.63, 329.63],
      [246.94, 311.13, 392.0],
    ],
    soft_piano: [
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 349.23],
      [196.0, 246.94, 293.66, 392.0],
    ],
  }

  const progression = chords[normalizedPreset]
  const barSec = normalizedPreset === "upbeat_promo" ? 1.5 : 2.5

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate
    const chordIdx = Math.floor(t / barSec) % progression.length
    const chord = progression[chordIdx]
    const barPos = (t % barSec) / barSec
    const env = Math.sin(Math.min(1, barPos * 4) * (Math.PI / 2)) * (1 - 0.35 * barPos)
    let sample = 0
    for (let n = 0; n < chord.length; n += 1) {
      sample += Math.sin(2 * Math.PI * chord[n] * t) / chord.length
    }
    data[i] = sample * env * 0.35
  }

  return buffer
}

/**
 * Mix a voiceover Blob with optional background music using Web Audio API GainNode
 * auto-ducking so music smoothly lowers during speech and rises during pauses.
 */
export async function mixVoiceoverWithAutoDuckingMusic(params: {
  voiceoverBlob: Blob
  musicPreset: StandaloneBgMusicPreset | "custom"
  customMusicFile?: File | null
  musicVolume?: number
}): Promise<{
  audioUrl: string
  blob: Blob
  audioBuffer: AudioBuffer
  durationSeconds: number
}> {
  const voiceBuffer = await decodeBlobToAudioBuffer(params.voiceoverBlob)
  const sampleRate = voiceBuffer.sampleRate
  const totalSamples = voiceBuffer.length
  const durationSeconds = voiceBuffer.duration

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext
  if (!OfflineCtx) {
    throw new Error("OfflineAudioContext is not supported in this browser.")
  }

  const offlineCtx = new OfflineCtx(1, totalSamples, sampleRate)

  const voiceSrc = offlineCtx.createBufferSource()
  voiceSrc.buffer = voiceBuffer
  voiceSrc.connect(offlineCtx.destination)

  let musicBuffer: AudioBuffer
  if (params.musicPreset === "custom" && params.customMusicFile) {
    musicBuffer = await decodeBlobToAudioBuffer(params.customMusicFile)
  } else {
    const preset =
      params.musicPreset === "none" || params.musicPreset === "custom"
        ? "lofi_chill"
        : params.musicPreset
    musicBuffer = synthesizeAmbientLoopBuffer(offlineCtx, preset, durationSeconds + 0.5)
  }

  const musicSrc = offlineCtx.createBufferSource()
  musicSrc.buffer = musicBuffer
  musicSrc.loop = true

  const musicGain = offlineCtx.createGain()
  const baseVol = Math.max(0.05, Math.min(0.8, params.musicVolume ?? 0.3))
  const duckedVol = baseVol * 0.22

  // Compute 100ms RMS speech envelope for GainNode auto-ducking
  const voiceChannel = voiceBuffer.getChannelData(0)
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.1))
  musicGain.gain.setValueAtTime(baseVol, 0)

  for (let start = 0; start < voiceChannel.length; start += windowSize) {
    const end = Math.min(voiceChannel.length, start + windowSize)
    let sumSq = 0
    for (let i = start; i < end; i += 1) {
      sumSq += voiceChannel[i] * voiceChannel[i]
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start))
    const targetGain = rms > 0.015 ? duckedVol : baseVol
    const timeSec = Math.min(durationSeconds, (start + windowSize * 0.5) / sampleRate)
    musicGain.gain.linearRampToValueAtTime(targetGain, timeSec)
  }

  musicSrc.connect(musicGain)
  musicGain.connect(offlineCtx.destination)

  voiceSrc.start(0)
  musicSrc.start(0)
  musicSrc.stop(durationSeconds)

  const rendered = await offlineCtx.startRendering()
  const wavBlob = encodeMonoWav16Bit(rendered.getChannelData(0), rendered.sampleRate)
  const audioUrl = URL.createObjectURL(wavBlob)

  return {
    audioUrl,
    blob: wavBlob,
    audioBuffer: rendered,
    durationSeconds: rendered.duration,
  }
}

/**
 * Regenerate a single voiceover segment (passing the previous segment's text as
 * non-spoken context when available so pitch, warmth, and cadence match seamlessly).
 */
export async function regenerateSingleVoiceoverSegment(params: {
  text: string
  voiceType: BurmeseVoiceType
  speed: VoiceoverSpeed
  deliveryTone?: VoiceDeliveryTone
  customPronunciations?: ReadonlyArray<PronunciationRule>
  signal?: AbortSignal
}): Promise<VoiceoverSegmentItem> {
  if (params.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  const trimmed = params.text.trim()
  if (!trimmed) {
    throw new TtsError("Segment text cannot be empty.")
  }

  const normalized = normalizeBurmeseForTTS(trimmed, params.customPronunciations) || trimmed
  const preset = BURMESE_VOICE_PRESETS[params.voiceType]
  const deliveryTone = params.deliveryTone ?? "normal"
  const id = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const segCacheKey = buildTtsCacheKey(preset.id, deliveryTone, params.speed, normalized)
  const cachedSeg = getCachedTtsClip(segCacheKey)
  if (cachedSeg) {
    const firstCachedSeg = cachedSeg.segments[0]
    const blob = firstCachedSeg?.blob ?? cachedSeg.blob
    const durationSeconds =
      firstCachedSeg?.durationSeconds ??
      Math.max(0.5, estimateSpokenDurationSeconds(normalized, params.speed))
    return {
      id,
      text: trimmed,
      blob,
      audioUrl: URL.createObjectURL(blob),
      durationSeconds,
      provider: cachedSeg.provider,
      pcmBytes: firstCachedSeg?.pcmBytes,
    }
  }

  const geminiKey = getSavedGeminiApiKey()

  if (geminiKey) {
    try {
      const res = await synthesizeGeminiChunk(
        normalized,
        preset,
        params.speed,
        deliveryTone,
        geminiKey,
        params.signal
      )
      const blob =
        res.kind === "pcm"
          ? await applyStudioVocalEqToPcm16(res.pcmBytes, TTS_SAMPLE_RATE)
          : res.blob
      const durationSeconds =
        res.kind === "pcm"
          ? res.pcmBytes.byteLength / TTS_BYTE_RATE
          : Math.max(0.5, estimateSpokenDurationSeconds(normalized, params.speed))
      const segItem: VoiceoverSegmentItem = {
        id,
        text: trimmed,
        blob,
        audioUrl: URL.createObjectURL(blob),
        durationSeconds,
        provider: "gemini",
        pcmBytes: res.kind === "pcm" ? res.pcmBytes : undefined,
      }
      setCachedTtsClip(segCacheKey, {
        blob,
        mimeType: "audio/wav",
        fileExtension: "wav",
        voiceName: `${preset.label} · Gemini`,
        provider: "gemini",
        cleanedText: normalized,
        segments: toCachedSegments([segItem]),
      })
      return segItem
    } catch (err) {
      if (params.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        throw err
      }
      if (err instanceof TtsError) {
        throw err
      }
      throw new TtsError(
        err instanceof Error
          ? err.message
          : "Gemini အသံထုတ်ရာတွင် အဆင်မပြေပါ — ခဏစောင့်ပြီး ပြန်နှိပ်ပါ"
      )
    }
  }

  try {
    const res = await synthesizeWithNeuralTts(normalized, preset, params.speed, params.signal)
    return {
      id,
      text: trimmed,
      blob: res.blob,
      audioUrl: URL.createObjectURL(res.blob),
      durationSeconds: Math.max(0.5, estimateSpokenDurationSeconds(normalized, params.speed)),
      provider: "neural-tts",
    }
  } catch (err) {
    if (params.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw err
    }
    const speechResult = synthesizeWithSpeechSynthesis(normalized, preset, params.speed)
    return {
      id,
      text: trimmed,
      blob: speechResult.blob,
      audioUrl: URL.createObjectURL(speechResult.blob),
      durationSeconds: Math.max(0.5, estimateSpokenDurationSeconds(normalized, params.speed)),
      provider: "speech-synthesis",
    }
  }
}

/**
 * Re-merge edited/regenerated segments into a single cohesive WAV audio file
 * (using lossless 15ms-faded PCM stitching when all segments have PCM bytes),
 * optionally applying background music auto-ducking.
 */
export async function mergeVoiceoverSegments(params: {
  segments: ReadonlyArray<VoiceoverSegmentItem>
  musicPreset?: StandaloneBgMusicPreset | "custom"
  customMusicFile?: File | null
}): Promise<{
  blob: Blob
  audioUrl: string
  audioBuffer: AudioBuffer
  durationSeconds: number
  mimeType: "audio/wav"
  fileExtension: "wav"
}> {
  if (params.segments.length === 0) {
    throw new TtsError("No segments to merge.")
  }

  let mergedBlob: Blob
  if (params.segments.every((seg) => seg.pcmBytes && seg.pcmBytes.byteLength > 0)) {
    mergedBlob = concatenatePcmBuffersToWav(
      params.segments.map((seg) => seg.pcmBytes as Uint8Array),
      120
    )
  } else {
    mergedBlob = await concatenateAudioBlobsToWav(params.segments.map((seg) => seg.blob))
  }

  if (params.musicPreset && params.musicPreset !== "none") {
    const mixed = await mixVoiceoverWithAutoDuckingMusic({
      voiceoverBlob: mergedBlob,
      musicPreset: params.musicPreset,
      customMusicFile: params.customMusicFile,
      musicVolume: 0.34,
    })
    return {
      blob: mixed.blob,
      audioUrl: mixed.audioUrl,
      audioBuffer: mixed.audioBuffer,
      durationSeconds: mixed.durationSeconds,
      mimeType: "audio/wav",
      fileExtension: "wav",
    }
  }

  const audioBuffer = await decodeBlobToAudioBuffer(mergedBlob)
  const audioUrl = URL.createObjectURL(mergedBlob)
  return {
    blob: mergedBlob,
    audioUrl,
    audioBuffer,
    durationSeconds: audioBuffer.duration,
    mimeType: "audio/wav",
    fileExtension: "wav",
  }
}

