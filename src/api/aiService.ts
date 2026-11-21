import { DEFAULT_MODELS, useUIStore } from "@/store/useUIStore"
import { extractTextFromEpub } from "@/features/audiobook/epubExtractor"
import {
  normalizeBusinessCategory,
  normalizeSalesAngle,
  type BusinessCategory,
  type SalesAngle,
} from "@/types"

export const GEMINI_MODEL = "gemini-2.5-flash"
export const GEMINI_VISION_MODEL = "gemini-2.5-flash"
export const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash"

const DEPRECATED_GEMINI_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-pro-vision",
  "gemini-3.5-flash-lite",
])
export const QUOTA_EXCEEDED_MESSAGE =
  "Daily/minute API quota exceeded. Please switch model in Settings or wait a moment."
export const OPENROUTER_BUSY_MESSAGE =
  "OpenRouter free models are busy right now. Please try again in 30 seconds or switch to Gemini with VPN."

export class ApiError extends Error {
  status: number
  isQuotaExceeded: boolean

  constructor(status: number, message: string, isQuotaExceeded = false) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.isQuotaExceeded = isQuotaExceeded
  }
}

function parseApiError(provider: string, status: number, rawText: string): ApiError {
  let extractedMessage = ""
  let isQuota = status === 429

  if (rawText) {
    try {
      const parsed = JSON.parse(rawText)
      const err = parsed.error ?? parsed

      if (typeof err === "string") {
        extractedMessage = err
      } else if (err && typeof err === "object") {
        if (typeof err.message === "string") {
          extractedMessage = err.message
        } else if (typeof parsed.message === "string") {
          extractedMessage = parsed.message
        } else if (Array.isArray(parsed.errors) && parsed.errors[0]?.message) {
          extractedMessage = String(parsed.errors[0].message)
        }

        if (
          err.status === "RESOURCE_EXHAUSTED" ||
          err.code === 429 ||
          err.code === "rate_limit_exceeded" ||
          err.type === "rate_limit_exceeded"
        ) {
          isQuota = true
        }
      }
    } catch {
      // Not JSON
      if (rawText.includes("<html") || rawText.includes("<!DOCTYPE")) {
        extractedMessage = `Server error (${status})`
      } else {
        extractedMessage = rawText.trim()
      }
    }
  }

  const lower = (extractedMessage + " " + rawText).toLowerCase()
  if (
    status === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("tokens per minute") ||
    lower.includes("requests per minute") ||
    lower.includes("requests per day")
  ) {
    isQuota = true
  }

  if (isQuota) {
    return new ApiError(status || 429, QUOTA_EXCEEDED_MESSAGE, true)
  }

  if (
    status === 401 ||
    lower.includes("api key not valid") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key")
  ) {
    return new ApiError(
      status,
      `Invalid API key for ${provider}. Please check your API key in Settings.`,
      false
    )
  }

  const cleanMessage = extractedMessage ? extractedMessage.replace(/\s+/g, " ").trim() : ""
  const finalMessage = cleanMessage
    ? `${provider} error (${status}): ${cleanMessage}`
    : `${provider} error (${status}): Request failed`

  return new ApiError(status, finalMessage, false)
}

export type AIProvider = "gemini" | "groq" | "openrouter"

export interface GenerateContentRequest {
  topic: string
  platform: string
  contentType: string
  tone: string
  salesAngle?: SalesAngle
  businessCategory?: BusinessCategory
  customNiche?: string
  language: string
  includeHashtags: boolean
  targetDurationSeconds?: number
  creativeAngleHint?: string
  instruction?: string
  currentContent?: string
}

export interface GeneratedContent {
  id: string
  topic: string
  platform: string
  contentType: string
  tone: string
  content: string
  createdAt: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const CATEGORY_PERSONA_GUIDANCE: Record<BusinessCategory, string> = {
  general:
    "General Creator / All-Purpose — relatable, engaging, and versatile creator voice. Focus on clear storytelling, audience connection, and valuable takeaways without forcing sales pitches.",
  education:
    "Education & How-To Tips — clear, helpful, and structured mentor/educator voice. Break down concepts into actionable steps, memorable analogies, and practical value.",
  vlog:
    "Vlog, Travel & Lifestyle — authentic, warm, diary-like storyteller voice. Capture mood, sensory details, behind-the-scenes moments, and genuine personal reflections.",
  tech_review:
    "Tech & Product Review — sharp, honest, and insightful reviewer voice. Highlight real-world pros and cons, practical user experience, and clear comparisons without dry jargon or pushy sales hype.",
  motivation:
    "Motivation & Storytelling — inspiring, empathetic, and thought-provoking voice. Open with an emotional hook, share a meaningful perspective or lesson, and end with an uplifting reflection.",
  online_shop:
    "Online Shop & E-Commerce — warm, trustworthy retail copywriter voice. Highlight practical product benefits, real-life value, quality assurance, and a clear order/inbox CTA.",
  custom:
    "Custom Creator Niche — adapt vocabulary, examples, and audience tone authentically to the creator's specific niche.",
}

function getCategoryPersonaGuidance(
  category?: BusinessCategory,
  customNiche?: string
): string {
  const normalized = normalizeBusinessCategory(category)
  if (normalized === "custom" && customNiche?.trim()) {
    return `Custom Niche (${customNiche.trim()}) — speak authentically as an experienced creator in "${customNiche.trim()}". Use natural domain-relevant insights and vocabulary tailored to this audience without forcing unrelated sales language.`
  }
  return CATEGORY_PERSONA_GUIDANCE[normalized]
}

const SALES_ANGLE_GUIDANCE: Record<SalesAngle, string> = {
  viral_story:
    "Viral Hook & Story (Vlog / General) — open with an irresistible curiosity or relatable story hook, keep pacing conversational and human, and end with an engaging question for comments.",
  quick_tips:
    "3 Quick Tips / Educational — deliver 3 crisp, high-value actionable tips or takeaways that viewers can save, share, and apply immediately.",
  honest_review:
    "Honest Review / Comparison — give a balanced, trustworthy breakdown (what stands out, who it's best for, and honest pros/cons) like a trusted friend sharing real experience.",
  promo_showcase:
    "Promo / Product Showcase — spotlight standout features, real-life value, limited-time offer or key highlight, and a clear action-driving CTA.",
  short_reel:
    "Short Punchy Reel (10–15s) — ultra-snappy 10–15s pacing, immediate 2-second scroll-stopper hook, crisp visual/spoken beats, and a fast memorable closer.",
}

const SYSTEM_PROMPT = `You are Myanmar's #1 social media content strategist and creative copywriter for creators of every niche—including educators, vloggers, tech reviewers, lifestyle creators, motivational storytellers, and online shops.
You create engaging, platform-native content in English, Myanmar (Burmese), or bilingual (Myanmar + English).

Rules:
- Write naturally for the selected platform (Facebook, TikTok, YouTube, Instagram, Telegram).
- Match the requested tone, Creator / Business Category, and Content Angle.
- IMPORTANT: Adapt your persona to the niche and angle. NEVER force sales pitch language, pricing, or shopping CTAs onto educational, vlog, review, or storytelling content unless the user's topic or chosen Online Shop / Promo angle explicitly calls for it.
- If the language is "myanmar" or "my":
  - Write 100% in natural spoken Myanmar (Burmese) Unicode script (မြန်မာစကားပြော), even if the Topic is written in English.
  - Keep the Burmese tone warm, engaging, and conversational using natural everyday particles tailored to the niche (e.g., "ဗျာ", "နော်", "တကယ်တမ်း", "မိုက်တယ်နော်", "သိထားသင့်တယ်နော်", "အားလုံးပဲ").
  - STRICTLY AVOID stiff, formal textbook/literary endings such as "ဖြစ်ပါသည်", "ပြုလုပ်နိုင်ပါသည်", "ဝယ်ယူရရှိနိုင်ပါသည်", "ဖော်ပြပေးလိုက်ပါတယ်", "ပါဝင်ပါသည်", or "ရှိပါသည်". Always use natural spoken endings like "ပါတယ်ဗျာ", "လုပ်လို့ရတယ်နော်", "ကြည့်ကြည့်ရအောင်နော်".
  - Write ALL video script labels and stage directions in Burmese (use "မြင်ကွင်း:", "အသံ:", "ဖန်သားပြင်စာသား:", "ပြောစကား:" instead of English "(Visual - ...)", "(Sound - ...)", "(Audio - ...)", or "[Visual Cue]").
  - Keep international brand, product, and platform names (e.g., Zara, Laneige, Sony, Dyson, Nike, Apple, TikTok, Facebook, Instagram, YouTube, Telegram) in their original English spelling rather than phonetic Burmese transliteration.
- If the language is "bilingual", blend natural spoken Myanmar and English seamlessly while keeping international brand names in English.
- When includeHashtags is true, append relevant hashtags at the end.
- NEVER use raw Markdown formatting symbols such as *, **, ***, # headings, or backticks. Output clean plain text ready to copy-paste directly onto Facebook or TikTok.
- Keep formatting clean with short paragraphs, line breaks, and at most 1-2 subtle emojis in the entire post (never start every line or bullet with emojis like 🚀🔥✨💡).
- NEVER use overused AI hype words or stiff English-to-Burmese translationese such as "အံ့မခန်း", "မယုံနိုင်လောက်အောင်", "တစ်မူထူးခြားတဲ့", "ယနေ့ခေတ်တွင်".
- Output only the final content, no preamble or meta commentary.`

function sanitizePlainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "• ")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function buildDurationGuidance(
  targetDurationSeconds?: number,
  isMyanmar?: boolean
): string {
  if (!targetDurationSeconds || !Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0) {
    return ""
  }
  const d = Math.max(5, Math.min(180, Math.round(targetDurationSeconds)))
  const minWords = Math.round(d * 3.2)
  const maxWords = Math.round(minWords * 1.15)
  const minChars = Math.round(minWords * 5.8)
  const maxChars = Math.round(minWords * 7.1)

  if (isMyanmar) {
    return `\nTarget Spoken Duration: ${d} seconds. Strict Minimum Length: AT LEAST ${minWords}–${maxWords} rich spoken Burmese words (~${minChars}–${maxChars} characters across 4–6 rich, natural spoken sentences for 20s+ videos). STRICTLY DO NOT write a short 1–2 sentence summary! Write a full, naturally paced ${d}-second script/post so the voiceover fills the entire ${d} seconds from start to finish.`
  }
  return `\nTarget Spoken Duration: ${d} seconds. Strict Minimum Length: AT LEAST ${minWords}–${maxWords} spoken words. STRICTLY DO NOT write a short 1–2 sentence summary! Write a full, naturally paced ${d}-second script/post so the voiceover fills the entire ${d} seconds from start to finish.`
}

function buildUserPrompt(request: GenerateContentRequest): string {
  const hashtagInstruction = request.includeHashtags
    ? "Include relevant hashtags at the end."
    : "Do not include hashtags."
  const categoryGuide = getCategoryPersonaGuidance(
    request.businessCategory,
    request.customNiche
  )
  const angleGuide =
    SALES_ANGLE_GUIDANCE[normalizeSalesAngle(request.salesAngle)]
  const isMyanmarOnly = request.language === "myanmar" || request.language === "my"
  const durationGuidance = buildDurationGuidance(
    request.targetDurationSeconds,
    isMyanmarOnly || request.language === "bilingual"
  )
  const creativeHint = request.creativeAngleHint?.trim()
    ? `\nCreative Direction: ${request.creativeAngleHint.trim()}`
    : ""
  const myanmarRules = isMyanmarOnly
    ? '\nStrict Myanmar Rules: Write 100% in natural conversational spoken Burmese (မြန်မာစကားပြော) using warm particles like "ဗျာ", "နော်", "တကယ်တမ်း". NEVER use stiff textbook endings like "ဖြစ်ပါသည်" or "ပါဝင်ပါသည်". Use Burmese script labels like မြင်ကွင်း:, အသံ:, ဖန်သားပြင်စာသား:, ပြောစကား: instead of English stage directions. Keep international brand names (e.g., Apple, Sony, Zara, TikTok, Facebook) in English spelling. Do NOT use Markdown symbols (*, **, # headings).'
    : "\nFormatting Rule: Output clean plain text with no Markdown symbols (*, **, # headings)."

  if (request.instruction && request.currentContent) {
    return `Task: ${request.instruction}
Creator / Business Category: ${categoryGuide}
Content Format / Angle: ${angleGuide}
Target Platform: ${request.platform}
Target Content Type: ${request.contentType}
Tone: ${request.tone}
Output Language: ${request.language}
${hashtagInstruction}${durationGuidance}${myanmarRules}

Current content to transform:
"""
${request.currentContent}
"""

Output only the final transformed content now.`
  }

  return `Creator / Business Category: ${categoryGuide}
Content Format / Angle: ${angleGuide}
Platform: ${request.platform}
Content type: ${request.contentType}
Tone: ${request.tone}
Language: ${request.language}
Topic: ${request.topic}
${hashtagInstruction}${durationGuidance}${creativeHint}${myanmarRules}
Write the content now.`
}

function mockGenerate(request: GenerateContentRequest): GeneratedContent {
  const category = normalizeBusinessCategory(request.businessCategory)
  const angle = normalizeSalesAngle(request.salesAngle)
  const isMyanmar = request.language === "myanmar" || request.language === "bilingual"

  const angleLeadMy: Record<SalesAngle, string> = {
    viral_story: "ဒီနေ့တော့ တကယ်တမ်း ရင်ဖွင့်ပြောပြချင်တဲ့ အကြောင်းအရာလေးတစ်ခု ရှိတယ်ဗျာ။",
    quick_tips: "ဒီနေ့အတွက် လက်တွေ့အသုံးဝင်မယ့် အချက် ၃ ချက်ကို မျှဝေပေးလိုက်တယ်နော်။",
    honest_review: "တကယ်သုံးကြည့်ပြီးမှ ရိုးရိုးသားသား ပြန်လည်မျှဝေပေးလိုက်ပါတယ်ဗျာ။",
    promo_showcase: "ဒီတစ်ခုကတော့ လက်တွေ့သုံးကြည့်ရသလောက် တကယ်တန်တယ်လို့ မြင်မိတယ်နော်။",
    short_reel: "၁၀-၁၅ စက္ကန့်အတွင်း ကြည့်လိုက် — အနှစ်ချုပ်လေးပါ။",
  }

  const categoryTagMy: Record<BusinessCategory, string> = {
    general: "#ContentCreatorMyanmar #DailyShare #CreatorLife",
    education: "#LearnMyanmar #TipsAndTricks #KnowledgeSharing",
    vlog: "#MyanmarVlog #LifestyleMyanmar #DailyVlog",
    tech_review: "#TechMyanmar #HonestReview #GadgetReview",
    motivation: "#MotivationMyanmar #Storytelling #Mindset",
    online_shop: "#OnlineShopMyanmar #QualityProduct #ShopNow",
    custom: `#${(request.customNiche || "Creator").replace(/[^a-zA-Z0-9]/g, "")} #MyanmarCreator`,
  }

  if (isMyanmar) {
    const closingMy =
      category === "online_shop" || angle === "promo_showcase"
        ? "👉 စိတ်ဝင်စားရင် အခုပဲ Inbox မှာ လာမေးမြန်းနိုင်ပါတယ်ဗျာ!"
        : "👉 ဒီအကြောင်းအရာနဲ့ ပတ်သက်ပြီး ဘယ်လိုမြင်လဲ? Comment မှာ ဝင်ဆွေးနွေးသွားကြပါဦးနော်!"
    const content =
      `${angleLeadMy[angle]}\n\n` +
      `တကယ်တမ်း "${request.topic}" အကြောင်းကို ပြောရမယ်ဆိုရင် လက်တွေ့မှာ အရမ်းအသုံးဝင်ပြီး သတိထားမိသင့်တဲ့ အချက်လေးတွေ အများကြီးရှိတယ်ဗျာ။\n\n` +
      `${closingMy} (Mock Mode — Settings မှာ API Key ထည့်ပြီး AI အစစ်နဲ့ သုံးနိုင်ပါတယ်)` +
      (request.includeHashtags ? `\n\n${categoryTagMy[category]}` : "")
    return {
      id: crypto.randomUUID(),
      topic: request.topic,
      platform: request.platform,
      contentType: request.contentType,
      tone: request.tone,
      content,
      createdAt: new Date().toISOString(),
    }
  }

  const nicheLabel =
    category === "custom" && request.customNiche?.trim()
      ? request.customNiche.trim()
      : category.replace("_", " ")

  const body =
    `${request.topic}\n\n` +
    `Tailored for ${nicheLabel} creators (${angle.replace("_", " ")} angle): engaging hook, authentic voice, and clear takeaways.\n\n` +
    `This is a mock response. Add your API key in Settings to connect to a real provider.` +
    (request.includeHashtags ? `\n\n#${request.platform} #CreatorStudio #ContentCreator` : "")

  return {
    id: crypto.randomUUID(),
    topic: request.topic,
    platform: request.platform,
    contentType: request.contentType,
    tone: request.tone,
    content: body,
    createdAt: new Date().toISOString(),
  }
}

const PREFERRED_OPENROUTER_FREE_VISION_MODELS = [
  "google/gemma-3-27b-it:free",
  "google/gemma-3-12b-it:free",
  "qwen/qwen2.5-vl-72b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
] as const

const OPENROUTER_MODELS_CACHE_TTL_MS = 10 * 60 * 1000
let openRouterFreeVisionCache: {
  models: string[]
  fetchedAt: number
} | null = null
let openRouterFreeVisionInFlight: Promise<string[]> | null = null

interface OpenRouterModelEntry {
  id?: unknown
  architecture?: {
    modality?: unknown
    input_modalities?: unknown
  }
}

function isFreeVisionModel(entry: OpenRouterModelEntry): entry is OpenRouterModelEntry & { id: string } {
  if (typeof entry.id !== "string" || !entry.id.endsWith(":free")) {
    return false
  }
  const inputModalities = entry.architecture?.input_modalities
  if (
    Array.isArray(inputModalities) &&
    inputModalities.some((m) => typeof m === "string" && m.toLowerCase() === "image")
  ) {
    return true
  }
  const modality = entry.architecture?.modality
  return typeof modality === "string" && modality.toLowerCase().includes("image")
}

function prioritizeOpenRouterVisionModels(models: string[]): string[] {
  const unique = Array.from(new Set(models))
  const preferredOrder = new Map<string, number>(
    PREFERRED_OPENROUTER_FREE_VISION_MODELS.map((id, idx) => [id, idx])
  )
  return unique.sort((a, b) => {
    const aRank = preferredOrder.get(a)
    const bRank = preferredOrder.get(b)
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank
    if (aRank !== undefined) return -1
    if (bRank !== undefined) return 1
    return 0
  })
}

async function getActiveOpenRouterFreeVisionModels(): Promise<string[]> {
  const now = Date.now()
  if (
    openRouterFreeVisionCache &&
    now - openRouterFreeVisionCache.fetchedAt < OPENROUTER_MODELS_CACHE_TTL_MS
  ) {
    return openRouterFreeVisionCache.models
  }

  if (openRouterFreeVisionInFlight) {
    return openRouterFreeVisionInFlight
  }

  openRouterFreeVisionInFlight = (async () => {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
      })
      if (!res.ok) {
        throw new Error(`OpenRouter models fetch failed (${res.status})`)
      }
      const payload = (await res.json()) as { data?: OpenRouterModelEntry[] }
      const discovered = Array.isArray(payload.data)
        ? payload.data.filter(isFreeVisionModel).map((entry) => entry.id)
        : []
      const prioritized = prioritizeOpenRouterVisionModels(discovered)
      if (prioritized.length > 0) {
        openRouterFreeVisionCache = {
          models: prioritized,
          fetchedAt: Date.now(),
        }
        return prioritized
      }
    } catch (err) {
      console.warn("Failed to discover live OpenRouter free vision models; using defaults.", err)
    } finally {
      openRouterFreeVisionInFlight = null
    }
    return [...PREFERRED_OPENROUTER_FREE_VISION_MODELS]
  })()

  return openRouterFreeVisionInFlight
}

function shouldFallbackOpenRouterModel(err: unknown): boolean {
  if (err instanceof ApiError) {
    return (
      err.status === 402 ||
      err.status === 404 ||
      err.status === 429 ||
      err.status === 502 ||
      err.status === 503 ||
      err.isQuotaExceeded
    )
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return (
      msg.includes("402") ||
      msg.includes("insufficient credits") ||
      msg.includes("404") ||
      msg.includes("429") ||
      msg.includes("502") ||
      msg.includes("503")
    )
  }
  return false
}

const GROQ_VISION_FALLBACK_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
const GROQ_TEXT_ONLY_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
])

function resolveGroqVisionModel(model: string): string {
  const trimmed = model.trim()
  if (!trimmed || GROQ_TEXT_ONLY_MODELS.has(trimmed)) {
    return GROQ_VISION_FALLBACK_MODEL
  }
  return trimmed
}
function isRateLimitError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 429 || err.isQuotaExceeded
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes("429") || msg.includes("rate limit") || msg.includes("quota")
  }
  return false
}

async function callOpenRouterWithFallback<T>(
  primaryModel: string,
  callFn: (model: string) => Promise<T>,
  options?: { isTextOnly?: boolean }
): Promise<T> {
  const normalizedPrimary = primaryModel.trim()
  const liveVisionModels = await getActiveOpenRouterFreeVisionModels()
  const fallbackPool = options?.isTextOnly
    ? [...liveVisionModels, "openrouter/free"]
    : liveVisionModels

  const rawCandidates =
    !normalizedPrimary || normalizedPrimary === "openrouter/auto"
      ? fallbackPool
      : [normalizedPrimary, ...fallbackPool]
  const modelsToTry = Array.from(new Set(rawCandidates))

  let lastError: unknown
  let sawRateLimit = false
  for (const candidateModel of modelsToTry) {
    try {
      return await callFn(candidateModel)
    } catch (err) {
      lastError = err
      if (isRateLimitError(err)) {
        sawRateLimit = true
      }
      if (!shouldFallbackOpenRouterModel(err)) {
        throw err
      }
      console.warn(
        `OpenRouter model "${candidateModel}" failed (${err instanceof ApiError ? err.status : "error"}). Retrying with next free fallback model...`
      )
    }
  }
  if (sawRateLimit) {
    throw new ApiError(429, OPENROUTER_BUSY_MESSAGE, true)
  }
  throw lastError
}

function isLocationUnsupportedError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.toLowerCase().includes("user location is not supported") &&
    (err instanceof ApiError ? err.status === 400 : true)
  )
}

function getAiConfig() {
  const { aiProvider, apiKeys, models } = useUIStore.getState()
  const envGeminiKey =
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""
  const envOpenRouterKey =
    (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim() ?? ""

  const resolvedApiKeys = {
    gemini: apiKeys.gemini.trim() || envGeminiKey,
    openrouter: apiKeys.openrouter.trim() || envOpenRouterKey,
    groq: apiKeys.groq.trim(),
  }

  const rawModel = models[aiProvider]?.trim() || ""
  const resolvedModel =
    aiProvider === "gemini" && DEPRECATED_GEMINI_MODELS.has(rawModel)
      ? GEMINI_MODEL
      : rawModel || DEFAULT_MODELS[aiProvider]

  return {
    provider: aiProvider,
    apiKey: resolvedApiKeys[aiProvider],
    apiKeys: resolvedApiKeys,
    model: resolvedModel,
    models: {
      ...models,
      [aiProvider]: resolvedModel,
    },
  }
}

async function fetchGeminiGenerateContent(
  model: string,
  apiKey: string,
  body: unknown
): Promise<Response> {
  const cleanKey = apiKey.trim()
  const trimmedModel = model.trim()
  const resolvedModel =
    !trimmedModel || DEPRECATED_GEMINI_MODELS.has(trimmedModel)
      ? GEMINI_MODEL
      : trimmedModel
  const headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": cleanKey,
  }
  const payload = JSON.stringify(body)
  const standardUrl = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${encodeURIComponent(cleanKey)}`

  if (cleanKey.startsWith("AQ.")) {
    const vertexUrl = `https://aiplatform.googleapis.com/v1/publishers/google/models/${resolvedModel}:generateContent?key=${encodeURIComponent(cleanKey)}`
    try {
      const vertexRes = await fetch(vertexUrl, {
        method: "POST",
        headers,
        body: payload,
      })
      if (vertexRes.ok) {
        return vertexRes
      }
      console.warn(
        `Vertex AI Express endpoint returned ${vertexRes.status} for "${resolvedModel}". Falling back to generativelanguage.googleapis.com...`
      )
    } catch (err) {
      console.warn(
        `Vertex AI Express endpoint request failed for "${resolvedModel}". Falling back to generativelanguage.googleapis.com...`,
        err
      )
    }
  }

  return fetch(standardUrl, {
    method: "POST",
    headers,
    body: payload,
  })
}

async function generateWithGemini(
  request: GenerateContentRequest,
  apiKey: string,
  model: string
): Promise<GeneratedContent> {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: buildUserPrompt(request) }] }],
    generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096 },
  }

  const res = await fetchGeminiGenerateContent(model, apiKey, body)

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, text)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const content = sanitizePlainText(
    parts
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
  )

  if (!content) {
    const finishReason = data.candidates?.[0]?.finishReason
    throw new Error(
      finishReason
        ? `No content returned from Gemini API (finishReason: ${finishReason}).`
        : "No content returned from Gemini API."
    )
  }

  return {
    id: crypto.randomUUID(),
    topic: request.topic,
    platform: request.platform,
    contentType: request.contentType,
    tone: request.tone,
    content,
    createdAt: new Date().toISOString(),
  }
}

async function generateWithOpenAICompatible(
  request: GenerateContentRequest,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<GeneratedContent> {
  const baseUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions"

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(request) },
    ],
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 2048,
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin
    headers["X-Title"] = "Content Creator SaaS"
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const providerName = provider === "groq" ? "Groq" : "OpenRouter"
    throw parseApiError(providerName, res.status, text)
  }

  const data = await res.json()
  const content = sanitizePlainText(
    data.choices?.[0]?.message?.content ?? ""
  )

  if (!content) {
    throw new Error(`No content returned from ${provider} API.`)
  }

  return {
    id: crypto.randomUUID(),
    topic: request.topic,
    platform: request.platform,
    contentType: request.contentType,
    tone: request.tone,
    content,
    createdAt: new Date().toISOString(),
  }
}

export async function generateContent(
  request: GenerateContentRequest
): Promise<GeneratedContent> {
  const { provider, apiKey, apiKeys, model, models } = getAiConfig()
  const trimmedKey = apiKey.trim()

  if (!trimmedKey) {
    await delay(1000)
    return mockGenerate(request)
  }

  try {
    if (provider === "gemini") {
      const primaryModel = model || GEMINI_MODEL
      try {
        return await generateWithGemini(request, trimmedKey, primaryModel)
      } catch (err) {
        if (isLocationUnsupportedError(err) && apiKeys.openrouter) {
          console.warn("Gemini location unsupported. Falling back to OpenRouter...")
          return await callOpenRouterWithFallback(
            models.openrouter || DEFAULT_MODELS.openrouter,
            (candidateModel) =>
              generateWithOpenAICompatible(request, "openrouter", apiKeys.openrouter, candidateModel),
            { isTextOnly: true }
          )
        }
        const isQuota =
          (err instanceof ApiError && err.isQuotaExceeded) ||
          (err instanceof Error &&
            (err.message === QUOTA_EXCEEDED_MESSAGE ||
              err.message.includes("429") ||
              err.message.includes("RESOURCE_EXHAUSTED") ||
              err.message.toLowerCase().includes("quota")))

        if (isQuota && primaryModel !== GEMINI_FALLBACK_MODEL) {
          console.warn(
            `Gemini quota exceeded for "${primaryModel}". Automatically falling back to "${GEMINI_FALLBACK_MODEL}"...`
          )
          return await generateWithGemini(request, trimmedKey, GEMINI_FALLBACK_MODEL)
        }
        throw err
      }
    }

    if (provider === "openrouter") {
      return await callOpenRouterWithFallback(
        model || DEFAULT_MODELS.openrouter,
        (candidateModel) =>
          generateWithOpenAICompatible(request, "openrouter", trimmedKey, candidateModel),
        { isTextOnly: true }
      )
    }

    return await generateWithOpenAICompatible(
      request,
      provider,
      trimmedKey,
      model || "llama-3.3-70b-versatile"
    )
  } catch (err) {
    console.error(`AI generation failed via ${provider}`, err)
    throw err
  }
}

export type PhotoCategoryKey =
  | "tech"
  | "flash_sale"
  | "new_arrival"
  | "fashion"
  | "food"

export interface PhotoSuggestionRequest {
  imageBase64: string
  mimeType: string
  language: "en" | "my"
  category?: PhotoCategoryKey
}

export interface PhotoSuggestionResult {
  headline: string
  spec1: string
  spec2: string
  spec3: string
  suggestedPrice: string
  caption: string
}

function stripMarkdownArtifacts(text: string, allowHashtags = false): string {
  let cleaned = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1").replace(/\*/g, "")
  if (allowHashtags) {
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, "")
  } else {
    cleaned = cleaned.replace(/#/g, "")
  }
  return cleaned.trim()
}

function parsePhotoSuggestionResponse(raw: string): PhotoSuggestionResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as {
      headline?: string
      spec1?: string
      spec2?: string
      spec3?: string
      suggestedPrice?: string
      caption?: string
    }
    if (typeof parsed.headline === "string" || typeof parsed.caption === "string") {
      return {
        headline: stripMarkdownArtifacts(parsed.headline ?? ""),
        spec1: stripMarkdownArtifacts(parsed.spec1 ?? ""),
        spec2: stripMarkdownArtifacts(parsed.spec2 ?? ""),
        spec3: stripMarkdownArtifacts(parsed.spec3 ?? ""),
        suggestedPrice: stripMarkdownArtifacts(parsed.suggestedPrice ?? ""),
        caption: stripMarkdownArtifacts(parsed.caption ?? "", true),
      }
    }
  } catch {
    // Fallback if model returned plain text instead of JSON
  }

  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean)
  const headline = stripMarkdownArtifacts(lines[0] ?? "")
  const caption = stripMarkdownArtifacts(lines.slice(1).join("\n") || cleaned, true)
  return {
    headline,
    spec1: "",
    spec2: "",
    spec3: "",
    suggestedPrice: "",
    caption,
  }
}

const PHOTO_CATEGORY_GUIDANCE: Record<PhotoCategoryKey, string> = {
  tech: "Electronics & Gadgets (audio, smart accessories, laptops, devices). Focus spec1, spec2, spec3 on concise specs (e.g., '40h Battery', 'Fast Charge', '1 Year Warranty').",
  flash_sale:
    "Flash Sale & Discount (limited-time promotion). Emphasize urgency and savings in headline and specs (e.g., 'Save 30%', 'Today Only', 'Free Delivery').",
  new_arrival:
    "New Arrival (newly launched product showcase). Highlight freshness, key feature, and availability.",
  fashion:
    "Fashion & Beauty (apparel, skincare, cosmetics, lifestyle). Highlight style, texture/material, or skin/fit benefits.",
  food: "Food & Drink (cafes, restaurants, snacks, beverages). Highlight taste, freshness, and fast delivery.",
}

function buildPhotoPrompt(
  language: "en" | "my",
  category: PhotoCategoryKey = "new_arrival"
): string {
  const categoryGuide = PHOTO_CATEGORY_GUIDANCE[category]

  if (language === "my") {
    return `You are a Myanmar social media marketing expert. Look at this product photo carefully.
Selected Business Category: ${categoryGuide}

Generate a JSON object with these exact 6 keys:
1. "headline": A short, punchy poster headline (3 to 7 words max) in natural Myanmar (Burmese) Unicode script.
2. "spec1": Short highlight pill #1 (2 to 4 words, max 22 characters).
3. "spec2": Short highlight pill #2 (2 to 4 words, max 22 characters).
4. "spec3": Short highlight pill #3 (2 to 4 words, max 22 characters).
5. "suggestedPrice": A realistic price tag string for Myanmar market (e.g., "45,000 Ks") or "" if unclear.
6. "caption": A ready-to-post Facebook/Instagram caption in natural Myanmar (Burmese) Unicode script with relevant emojis and 3-5 hashtags at the end.

CRITICAL RULES:
- When writing in Burmese, keep ALL international brand names, model names, and technical terms (e.g., Zara, Laneige, Sony, Dyson, SPF, Pro, Wireless, Latte) in their original English spelling. NEVER transliterate brand or model names phonetically into Burmese.
- Do NOT use raw Markdown symbols (* or #) in headline, spec1, spec2, spec3, or suggestedPrice.
- Do NOT use Markdown * or # heading syntax in caption (only normal #hashtags at the end).
- Return ONLY valid JSON.`
  }

  return `You are a social media marketing expert. Look at this product photo carefully.
Selected Business Category: ${categoryGuide}

Generate a JSON object with these exact 6 keys:
1. "headline": A short, punchy poster headline (3 to 7 words max) in English.
2. "spec1": Short highlight pill #1 (2 to 4 words, max 22 characters).
3. "spec2": Short highlight pill #2 (2 to 4 words, max 22 characters).
4. "spec3": Short highlight pill #3 (2 to 4 words, max 22 characters).
5. "suggestedPrice": A realistic price tag string (e.g., "45,000 Ks" or "$29.99") or "" if unclear.
6. "caption": A ready-to-post Facebook/Instagram caption in English with relevant emojis and 3-5 hashtags at the end.

CRITICAL RULES:
- Do NOT use raw Markdown symbols (* or #) in headline, spec1, spec2, spec3, or suggestedPrice.
- Do NOT use Markdown * or # heading syntax in caption (only normal #hashtags at the end).
- Return ONLY valid JSON.`
}

async function suggestPhotoWithGemini(
  request: PhotoSuggestionRequest,
  apiKey: string,
  model: string
): Promise<PhotoSuggestionResult> {
  const base64Data = request.imageBase64.replace(/^data:[^;]+;base64,/, "")
  const body = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: request.mimeType || "image/jpeg",
              data: base64Data,
            },
          },
          { text: buildPhotoPrompt(request.language, request.category) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  }

  const res = await fetchGeminiGenerateContent(model, apiKey, body)

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, text)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const content = sanitizePlainText(
    parts
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
  )

  if (!content) {
    throw new Error("No content returned from Gemini Vision API.")
  }

  return parsePhotoSuggestionResponse(content)
}

async function suggestPhotoWithOpenAICompatible(
  request: PhotoSuggestionRequest,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<PhotoSuggestionResult> {
  const base64Data = request.imageBase64.replace(/^data:[^;]+;base64,/, "")
  const dataUrl = `data:${request.mimeType || "image/jpeg"};base64,${base64Data}`
  const baseUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions"

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin
    headers["X-Title"] = "Content Creator SaaS"
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPhotoPrompt(request.language, request.category) },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const providerName = provider === "groq" ? "Groq" : "OpenRouter"
    throw parseApiError(providerName, res.status, text)
  }

  const data = await res.json()
  const content = sanitizePlainText(
    data.choices?.[0]?.message?.content ?? ""
  )
  if (!content) {
    throw new Error(`No content returned from ${provider} Vision API.`)
  }

  return parsePhotoSuggestionResponse(content)
}

export async function suggestFromPhoto(
  request: PhotoSuggestionRequest
): Promise<PhotoSuggestionResult> {
  const { provider, apiKey, apiKeys, model, models } = getAiConfig()
  const trimmedKey = apiKey.trim()

  if (!trimmedKey) {
    await delay(900)
    const cat = request.category ?? "new_arrival"
    if (request.language === "my") {
      const mockByCategory: Record<PhotoCategoryKey, PhotoSuggestionResult> = {
        tech: {
          headline: "Wireless Noise-Canceling Headphones",
          spec1: "40h Battery",
          spec2: "Fast Charge",
          spec3: "1 Year Warranty",
          suggestedPrice: "185,000 Ks",
          caption:
            "🎧 အသံကြည်လင်ပြီး နေ့တိုင်းသုံးဖို့ အရမ်းမိုက်တဲ့ Wireless Headphones လေး ရောက်ရှိပါပြီဗျာ!\n\nBattery 40 နာရီအထိ ခံပြီး Official Warranty ၁ နှစ် အပြည့်အဝ ပါဝင်တယ်နော်။\n\n📩 မှာယူလိုပါက Inbox မှတစ်ဆင့် ဆက်သွယ်နိုင်ပါတယ်ဗျာ။\n\n#TechMyanmar #Gadgets #NewArrival",
        },
        flash_sale: {
          headline: "ယနေ့တစ်ရက်တည်း အထူးလျှော့ဈေး!",
          spec1: "Save 30%",
          spec2: "Today Only",
          spec3: "Fast Delivery",
          suggestedPrice: "35,000 Ks",
          caption:
            "⚡ Flash Sale! ယနေ့တစ်ရက်တည်းသာ ရရှိမယ့် အထူးလျှော့ဈေး!\n\nပစ္စည်းအရေအတွက် ကန့်သတ်ထားတာမို့ မြန်မြန်လေး မှာယူလိုက်ပါနော်။ 🛍️\n\n#FlashSale #SpecialOffer #OnlineShopMyanmar",
        },
        new_arrival: {
          headline: "အရည်အသွေးမြင့် ပစ္စည်းသစ် ရောက်ရှိပါပြီ",
          spec1: "Premium Quality",
          spec2: "Ready Stock",
          spec3: "Cash on Delivery",
          suggestedPrice: "45,000 Ks",
          caption:
            "✨ သင့်အတွက် အကောင်းဆုံး ရွေးချယ်မှု!\n\nအရည်အသွေးကောင်းမွန်ပြီး စိတ်ချရတဲ့ ပစ္စည်းလေးကို အခုပဲ မှာယူလိုက်ပါ။ 🛍️\n\n📩 မှာယူလိုပါက Inbox မှတစ်ဆင့် ဆက်သွယ်နိုင်ပါတယ်ခင်ဗျာ။\n\n#NewArrival #OnlineShopMyanmar #QualityFirst",
        },
        fashion: {
          headline: "စတိုင်ကျလှပတဲ့ Fashion Collection အသစ်",
          spec1: "Soft Fabric",
          spec2: "Free Size / S-XL",
          spec3: "Limited Edition",
          suggestedPrice: "38,000 Ks",
          caption:
            "🌸 နေ့စဉ် စတိုင်ကျကျ ဝတ်ဆင်နိုင်မယ့် Collection အသစ် ရောက်ရှိပါပြီ!\n\nအရောင်အသွေး လှပပြီး ဝတ်ဆင်ရတာ သက်တောင့်သက်သာရှိပါတယ်။\n\n#FashionMyanmar #BeautyStyle #NewCollection",
        },
        food: {
          headline: "လတ်ဆတ်အရသာရှိတဲ့ အထူးမီနူး",
          spec1: "Freshly Made",
          spec2: "100% Halal",
          spec3: "Fast Delivery",
          suggestedPrice: "6,500 Ks",
          caption:
            "☕ နေ့တိုင်း လတ်လတ်ဆတ်ဆတ် ဖန်တီးပေးထားတဲ့ အရသာကောင်းမွန်သော မီနူး!\n\nအိမ်တိုင်ရာရောက် ပို့ဆောင်ပေးနေပါပြီ။ 🛵\n\n#FoodMyanmar #CafeStyle #FreshDelivery",
        },
      }
      return mockByCategory[cat]
    }

    const mockEnByCategory: Record<PhotoCategoryKey, PhotoSuggestionResult> = {
      tech: {
        headline: "Wireless Noise-Canceling Headphones",
        spec1: "40h Battery",
        spec2: "Fast Charge",
        spec3: "1 Year Warranty",
        suggestedPrice: "$89",
        caption:
          "🎧 Upgrade your everyday audio with our Wireless Noise-Canceling Headphones!\n\nEnjoy up to 40h battery life, fast charging, and a full 1 Year Warranty. Message us to order today!\n\n#TechDeals #Gadgets #NewArrival",
      },
      flash_sale: {
        headline: "24-Hour Flash Sale — Save Big",
        spec1: "Up to 30% Off",
        spec2: "Limited Stock",
        spec3: "Fast Shipping",
        suggestedPrice: "35,000 Ks",
        caption:
          "⚡ Don't miss today's Flash Sale! Grab this deal before stock runs out.\n\nSend us a DM to lock in your promo price! 🛍️\n\n#FlashSale #LimitedOffer #ShopNow",
      },
      new_arrival: {
        headline: "Premium Quality Just Arrived",
        spec1: "Premium Finish",
        spec2: "In Stock Now",
        spec3: "Fast Delivery",
        suggestedPrice: "45,000 Ks",
        caption:
          "✨ Upgrade your everyday style with our latest arrival!\n\nCrafted with care and ready to order today. Limited stock available—send us a message to grab yours! 🛍️\n\n#NewArrival #ShopNow #FeaturedProduct",
      },
      fashion: {
        headline: "Effortless Style New Collection",
        spec1: "Breathable Fit",
        spec2: "All Sizes",
        spec3: "Gift Ready",
        suggestedPrice: "38,000 Ks",
        caption:
          "🌸 Elevate your wardrobe with our latest collection! Soft, comfortable, and effortlessly chic.\n\nDM us to order your favorite shade today! ✨\n\n#FashionStyle #Beauty #NewCollection",
      },
      food: {
        headline: "Freshly Crafted Daily Special",
        spec1: "Fresh Ingredients",
        spec2: "Made to Order",
        spec3: "30 Min Delivery",
        suggestedPrice: "6,500 Ks",
        caption:
          "☕ Treat yourself to our freshly made daily special! Crafted to order and delivered hot & fresh right to your door. 🛵\n\n#FreshFood #CafeVibes #OrderNow",
      },
    }
    return mockEnByCategory[cat]
  }

  if (provider === "gemini") {
    const primaryModel = model || GEMINI_VISION_MODEL
    try {
      return await suggestPhotoWithGemini(request, trimmedKey, primaryModel)
    } catch (err) {
      if (isLocationUnsupportedError(err) && apiKeys.openrouter) {
        console.warn("Gemini location unsupported for vision. Falling back to OpenRouter...")
        return await callOpenRouterWithFallback(
          models.openrouter || DEFAULT_MODELS.openrouter,
          (candidateModel) =>
            suggestPhotoWithOpenAICompatible(request, "openrouter", apiKeys.openrouter, candidateModel)
        )
      }
      const isQuota =
        (err instanceof ApiError && err.isQuotaExceeded) ||
        (err instanceof Error &&
          (err.message === QUOTA_EXCEEDED_MESSAGE ||
            err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.toLowerCase().includes("quota")))

      if (
        (isQuota || (err instanceof ApiError && err.status === 404)) &&
        primaryModel !== GEMINI_FALLBACK_MODEL
      ) {
        return await suggestPhotoWithGemini(request, trimmedKey, GEMINI_FALLBACK_MODEL)
      }
      throw err
    }
  }

  if (provider === "openrouter") {
    return await callOpenRouterWithFallback(
      model || DEFAULT_MODELS.openrouter,
      (candidateModel) =>
        suggestPhotoWithOpenAICompatible(request, "openrouter", trimmedKey, candidateModel)
    )
  }

  return await suggestPhotoWithOpenAICompatible(
    request,
    provider,
    trimmedKey,
    resolveGroqVisionModel(model)
  )
}

export type VideoPlatformOption = "TikTok / Reels" | "Facebook Video" | "YouTube Shorts"

export interface GenerateVideoContentParams {
  file: File
  productNote?: string
  platform: VideoPlatformOption | string
  language: "en" | "my"
  brandSignature?: string
  businessCategory?: BusinessCategory
  customNiche?: string
  targetDurationSeconds?: number
  creativeAngleHint?: string
  expandFromScript?: string
  onProgress?: (stage: "extracting" | "analyzing") => void
}

export interface VideoContentResult {
  hooks: string[]
  voiceoverScript: string
  caption: string
  coverTitle: string
  coverTitles?: string[]
  analysisMode: "direct" | "keyframes"
  frameCount?: number
}

const VIDEO_DIRECT_MAX_BYTES = 15 * 1024 * 1024

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".3gp", ".mkv"]

const EXTENSION_MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".3gp": "video/3gpp",
  ".mkv": "video/x-matroska",
}

export function isSupportedVideoFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase()
  if (mime.startsWith("video/")) {
    return true
  }
  const name = (file.name || "").toLowerCase()
  return VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function inferVideoMimeType(file: File): string {
  const mime = (file.type || "").toLowerCase()
  if (mime.startsWith("video/")) {
    return file.type
  }
  const name = (file.name || "").toLowerCase()
  const matchedExt = VIDEO_EXTENSIONS.find((ext) => name.endsWith(ext))
  return (matchedExt && EXTENSION_MIME_MAP[matchedExt]) || "video/mp4"
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read video file as base64."))
        return
      }
      const base64 = reader.result.replace(/^data:[^;]+;base64,/, "")
      resolve(base64)
    }
    reader.onerror = () => reject(new Error("Failed to read video file."))
    reader.readAsDataURL(file)
  })
}

async function extractKeyframesFromVideo(
  file: File,
  frameCount = 5,
  maxWidth = 720,
  quality = 0.75
): Promise<string[]> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.crossOrigin = "anonymous"
  video.src = objectUrl

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        cleanup()
        if (err) reject(err)
        else resolve()
      }

      // 5-second timeout fallback so mobile recordings with slow/missing metadata never hang
      const timer = window.setTimeout(() => {
        finish()
      }, 5000)

      const onLoaded = () => finish()
      const onError = () => finish(new Error("Could not decode video file in browser."))
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoaded)
        video.removeEventListener("loadeddata", onLoaded)
        video.removeEventListener("error", onError)
      }

      if (video.readyState >= 1) {
        finish()
        return
      }
      video.addEventListener("loadedmetadata", onLoaded)
      video.addEventListener("loadeddata", onLoaded)
      video.addEventListener("error", onError)
    })

    const hasValidDuration = Number.isFinite(video.duration) && video.duration > 0
    const timestamps = hasValidDuration
      ? Array.from({ length: frameCount }, (_, i) => ((i + 0.5) / frameCount) * video.duration)
      : [0.5, 1.5, 2.5]

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Canvas 2D context is not available.")
    }

    const frames: string[] = []
    for (const time of timestamps) {
      await new Promise<void>((resolve) => {
        const seekTimer = window.setTimeout(() => {
          video.removeEventListener("seeked", onSeeked)
          resolve()
        }, 5000)

        const onSeeked = () => {
          window.clearTimeout(seekTimer)
          video.removeEventListener("seeked", onSeeked)
          resolve()
        }

        video.addEventListener("seeked", onSeeked)
        try {
          video.currentTime = hasValidDuration
            ? Math.min(Math.max(0, time), video.duration)
            : Math.max(0, time)
        } catch {
          window.clearTimeout(seekTimer)
          video.removeEventListener("seeked", onSeeked)
          resolve()
        }
      })

      const srcWidth = video.videoWidth || 720
      const srcHeight = video.videoHeight || 1280
      const scale = Math.min(1, maxWidth / srcWidth)
      canvas.width = Math.max(1, Math.round(srcWidth * scale))
      canvas.height = Math.max(1, Math.round(srcHeight * scale))
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL("image/jpeg", quality)
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "")
      if (base64) {
        frames.push(base64)
      }
    }

    if (frames.length === 0) {
      throw new Error("Failed to extract keyframes from video.")
    }

    return frames
  } finally {
    video.pause()
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

function appendBrandSignature(caption: string, brandSignature?: string): string {
  const trimmedCap = caption.trim()
  const trimmedSig = brandSignature?.trim()
  if (!trimmedSig) return trimmedCap
  if (!trimmedCap) return trimmedSig
  if (trimmedCap.endsWith(trimmedSig)) return trimmedCap
  return `${trimmedCap}\n\n${trimmedSig}`
}

function buildVideoPrompt(params: {
  platform: string
  language: "en" | "my"
  productNote?: string
  analysisMode: "direct" | "keyframes"
  businessCategory?: BusinessCategory
  customNiche?: string
  targetDurationSeconds?: number
  creativeAngleHint?: string
  expandFromScript?: string
}): string {
  const categoryGuide = getCategoryPersonaGuidance(
    params.businessCategory,
    params.customNiche
  )
  const isShop = normalizeBusinessCategory(params.businessCategory) === "online_shop"
  const noteBlock = params.productNote?.trim()
    ? `Additional Topic / Context / Note from creator: "${params.productNote.trim()}"`
    : "No extra note provided; infer context and key moments from the visuals."
  const mediaContext =
    params.analysisMode === "direct"
      ? "Watch this short video carefully from start to finish."
      : "Review these 5 evenly spaced keyframes from a short video in chronological order."

  const d =
    params.targetDurationSeconds &&
    Number.isFinite(params.targetDurationSeconds) &&
    params.targetDurationSeconds > 0
      ? Math.max(5, Math.min(180, Math.round(params.targetDurationSeconds)))
      : 15
  const minWords = Math.round(d * 3.2)
  const maxWords = Math.round(minWords * 1.15)
  const minChars = Math.round(minWords * 5.8)
  const maxChars = Math.round(minWords * 7.1)
  const hookEnd = Math.min(3, Math.max(2, Math.round(d * 0.2)))
  const midEnd = d === 15 ? 10 : Math.max(hookEnd + 2, Math.round(d * 0.7))

  const creativeBlock = params.creativeAngleHint?.trim()
    ? `\nCREATIVE DIRECTION: ${params.creativeAngleHint.trim()}`
    : ""
  const expandBlock = params.expandFromScript?.trim()
    ? `\nEXPAND & ENRICH TASK: Expand the following previous voiceoverScript to ROUGHLY 2X ITS CURRENT LENGTH with richer visual storytelling, clear product/content benefits, and a strong Burmese call-to-action (or English CTA if English), keeping every scene natural and engaging without filler:\n"""\n${params.expandFromScript.trim()}\n"""`
    : ""

  if (params.language === "my") {
    const endingInstruction = isShop
      ? `   [${midEnd}-${d}s Price & Call-to-Action]\n   (State the price/promo and CTA using natural spoken Burmese phrasing for all numbers, prices, percentages, and tricky English words—e.g. "လေးသောင်းငါးထောင် ကျပ်", "နှစ်ဆယ် ရာခိုင်နှုန်း", "ဖရီး ဒယ်လီဗာရီ", "စီအိုဒီ", "အခုပဲ အင်ဘောက်စ် မှာ လာမှာလိုက်နော်!"—for effortless reading)`
      : `   [${midEnd}-${d}s Key Takeaway & Call-to-Action]\n   (Deliver the punchy takeaway, lesson, or engaging question for viewers—e.g. Follow/Save/Comment CTA—in natural spoken Burmese without forcing a sales pitch)`

    return `You are Myanmar's #1 short-form video strategist and spoken Burmese copywriter (TikTok, Facebook Reels, YouTube Shorts) for creators of all niches.
${mediaContext}
Exact Video Duration: ${d} seconds.
Strict Minimum Spoken Script Length: AT LEAST ${minWords}–${maxWords} rich spoken Burmese words (~${minChars}–${maxChars} characters across 4–6 rich, natural spoken sentences).
CRITICAL LENGTH RULE: STRICTLY DO NOT write a short 1–2 sentence summary! The voiceoverScript MUST be at least ${minWords} Burmese words, rich, detailed, and long enough to fill the entire ${d}-second video naturally from start to finish at normal speaking pace.
Creator / Business Category: ${categoryGuide}
Target Platform: ${params.platform}
${noteBlock}${creativeBlock}${expandBlock}

Analyze the visual scenes, details, and pacing, then return ONLY a valid JSON object with these exact 4 keys:

1. "hooks": An array of 3 scroll-stopping spoken Burmese hook strings for the first ${hookEnd} seconds, covering these 3 distinct angles:
   - Hook 1 (Curiosity / သိချင်စိတ်နှိုးဆွ): Makes viewers stop and wonder what happens next.
   - Hook 2 (Value / Key Insight / တန်ဖိုးပေါ်လွင်): Highlights the main takeaway, surprising fact, or standout value.
   - Hook 3 (Relatable Problem / Story / ပြဿနာနှင့် ဇာတ်လမ်း): Calls out a relatable everyday moment or pain point.

2. "voiceoverScript": A high-energy, natural spoken Burmese voiceover script strictly broken down into these 3 timed sections (AT LEAST ${minWords}–${maxWords} words total):
   [0-${hookEnd}s Hook]
   (Punchy opening line that grabs attention immediately)

   [${hookEnd}-${midEnd}s Story, Demo & Core Point]
   (Describe what is happening on screen and the #1 insight or benefit in rich, natural conversational Burmese—do NOT rush or summarize in 1 sentence)

${endingInstruction}

3. "coverTitles": An array of 2 short, punchy 3 to 5 word On-Screen Cover Text headlines in Burmese (ready to paste straight into CapCut).

4. "caption": A ready-to-post ${params.platform} social caption in energetic spoken Burmese with natural emojis and 4-6 relevant hashtags at the end.

CRITICAL LANGUAGE & STYLE RULES:
- Write in AUTHENTIC, ENERGETIC, CONVERSATIONAL SPOKEN BURMESE (မြန်မာစကားပြော) using natural everyday particles like "ဗျာ", "နော်", "တကယ်တမ်း", "အခုပဲ", "မိုက်တယ်နော်", "လုံးဝတန်တယ်".
- STRICTLY AVOID stiff, formal, bookish/literary endings such as "ဖြစ်ပါသည်", "ပြုလုပ်နိုင်ပါသည်", "ဝယ်ယူရရှိနိုင်ပါသည်", "ဖော်ပြပေးလိုက်ပါတယ်", "ပါဝင်ပါသည်", or "ရှိပါသည်". Always use natural spoken endings like "ပါတယ်ဗျာ", "လုပ်လို့ရတယ်နော်", "ဝယ်လို့ရပြီနော်".
- Keep international brand, product, and platform names (e.g., Zara, Laneige, Sony, Dyson, CapCut, TikTok, Reels, Facebook, YouTube) in their original English spelling.
- Do NOT use raw Markdown symbols (*, **, # headings) in hooks, voiceoverScript, or coverTitles. Only normal #hashtags are allowed at the end of caption.
- Return ONLY valid JSON.`
  }

  return `You are a top short-form video sales strategist and social media copywriter.
${mediaContext}
Exact Video Duration: ${d} seconds.
Strict Minimum Spoken Script Length: AT LEAST ${minWords}–${maxWords} spoken words.
CRITICAL LENGTH RULE: STRICTLY DO NOT write a short 1–2 sentence summary! The voiceoverScript MUST be at least ${minWords} words, detailed, and long enough to fill the entire ${d}-second video naturally from start to finish.
Target Platform: ${params.platform}
${noteBlock}${creativeBlock}${expandBlock}

Analyze the visual scenes, product details, and pacing, then return ONLY a valid JSON object with these exact 4 keys:
1. "hooks": An array of 3 scroll-stopping hook strings for the first ${hookEnd} seconds covering 3 angles: (1) Curiosity, (2) Price/Value, and (3) Problem-Solution.
2. "voiceoverScript": A punchy spoken English voiceover script (AT LEAST ${minWords}–${maxWords} words total) strictly broken down into [0-${hookEnd}s Hook], [${hookEnd}-${midEnd}s Demo & Key Benefit], and [${midEnd}-${d}s Price & Call-to-Action].
3. "coverTitles": An array of 2 short, punchy 3 to 5 word On-Screen Cover Text headlines ready to paste into CapCut.
4. "caption": A ready-to-copy-paste ${params.platform} caption in English with relevant emojis and 4-6 hashtags at the end.

CRITICAL RULES:
- Do NOT use raw Markdown symbols (*, **, # headings) in hooks, voiceoverScript, or coverTitles. Only normal #hashtags are allowed at the end of caption.
- Return ONLY valid JSON.`
}

function parseVideoContentResponse(
  raw: string,
  analysisMode: "direct" | "keyframes",
  frameCount?: number,
  brandSignature?: string
): VideoContentResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as {
      hooks?: unknown
      voiceoverScript?: unknown
      caption?: unknown
      coverTitle?: unknown
      coverTitles?: unknown
    }

    const hooks = Array.isArray(parsed.hooks)
      ? parsed.hooks
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => stripMarkdownArtifacts(item))
          .slice(0, 3)
      : []

    const voiceoverScript =
      typeof parsed.voiceoverScript === "string"
        ? stripMarkdownArtifacts(parsed.voiceoverScript)
        : Array.isArray(parsed.voiceoverScript)
          ? parsed.voiceoverScript
              .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              .map((item) => stripMarkdownArtifacts(item))
              .join("\n\n")
          : ""
    const rawCaption =
      typeof parsed.caption === "string"
        ? stripMarkdownArtifacts(parsed.caption, true)
        : ""
    const caption = appendBrandSignature(rawCaption, brandSignature)

    const parsedCoverTitles = Array.isArray(parsed.coverTitles)
      ? parsed.coverTitles
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => stripMarkdownArtifacts(item))
          .slice(0, 2)
      : []

    const singleCoverTitle =
      typeof parsed.coverTitle === "string"
        ? stripMarkdownArtifacts(parsed.coverTitle)
        : ""

    const coverTitles =
      parsedCoverTitles.length > 0
        ? parsedCoverTitles
        : singleCoverTitle
          ? [singleCoverTitle]
          : []
    const coverTitle = coverTitles[0] ?? singleCoverTitle

    if (hooks.length > 0 || voiceoverScript || caption || coverTitle) {
      return {
        hooks,
        voiceoverScript,
        caption,
        coverTitle,
        coverTitles,
        analysisMode,
        frameCount,
      }
    }
  } catch {
    // Fallback if model returned plain text
  }

  return {
    hooks: [],
    voiceoverScript: sanitizePlainText(cleaned),
    caption: appendBrandSignature("", brandSignature),
    coverTitle: "",
    coverTitles: [],
    analysisMode,
    frameCount,
  }
}

async function generateVideoWithGemini(
  mediaParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  prompt: string,
  apiKey: string,
  model: string,
  analysisMode: "direct" | "keyframes",
  frameCount?: number,
  brandSignature?: string
): Promise<VideoContentResult> {
  const body = {
    contents: [
      {
        parts: [...mediaParts, { text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  }

  const res = await fetchGeminiGenerateContent(model, apiKey, body)

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, text)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const content = parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim()

  if (!content) {
    const finishReason = data.candidates?.[0]?.finishReason
    throw new Error(
      finishReason
        ? `No content returned from Gemini Video API (finishReason: ${finishReason}).`
        : "No content returned from Gemini Video API."
    )
  }

  return parseVideoContentResponse(content, analysisMode, frameCount, brandSignature)
}

function mockGenerateVideoContent(
  params: GenerateVideoContentParams,
  analysisMode: "direct" | "keyframes",
  frameCount?: number
): VideoContentResult {
  const note = params.productNote?.trim()
  if (params.language === "my") {
    const captionBody = `✨ ${note ? note + " — " : ""}တကယ်တမ်း နေ့တိုင်းသုံးဖို့ အရမ်းမိုက်ပြီး စိတ်ချရတဲ့ ပစ္စည်းလေးပါဗျာ!\n\n📩 လိုချင်ရင် အခုပဲ Inbox မှာ လာမှာလိုက်နော်!\n\n#ProductShowcase #MyanmarOnlineShop #ReelsMyanmar #Trending`
    const coverTitles = [
      "မဝယ်ခင် ဒါအရင်ကြည့်!",
      "တကယ်တန်တဲ့ ပစ္စည်းကောင်း",
    ]
    return {
      hooks: [
        note ? `ဒီ ${note} လေး ဘာကြောင့် လူကြိုက်များနေလဲ ကြည့်လိုက်ဗျာ!` : "ဒါလေး မဝယ်ခင် ဒီဗီဒီယိုကို အရင်ကြည့်လိုက်နော်!",
        "ဒီဈေးနဲ့ ဒီလိုအရည်အသွေး တကယ်တမ်း ဘယ်မှာမှ မရဘူးဗျာ 🔥",
        "နေ့တိုင်း စိတ်ညစ်နေရတဲ့ ပြဿနာကို ဒါလေးတစ်ခုတည်းနဲ့ ရှင်းလိုက်!",
      ],
      voiceoverScript:
        "[0-3s Hook]\nဟေ့! ဒီပစ္စည်းလေးကို မဝယ်ခင် ဒီဗီဒီယိုကို အရင်ကြည့်လိုက်နော်!\n\n[3-10s Demo & Key Benefit]\nတကယ်တမ်း လက်တွေ့သုံးကြည့်တော့ ဒီဇိုင်းလည်း သပ်ရပ်သလို နေ့တိုင်းသုံးရတာ အရမ်းအဆင်ပြေတယ်ဗျာ။" +
        (note ? ` (${note})` : "") +
        "\n\n[10-15s Price & Call-to-Action]\nဈေးနှုန်းလေးကလည်း အရမ်းတန်နေတုန်း ပစ္စည်းကုန်သွားမှာစိုးလို့ အခုပဲ Inbox မှာ လာမှာလိုက်နော်!",
      caption: appendBrandSignature(captionBody, params.brandSignature),
      coverTitle: coverTitles[0],
      coverTitles,
      analysisMode,
      frameCount,
    }
  }

  const enCaptionBody = `✨ ${note ? note + " — " : ""}Clean design, everyday performance, ready to order today!\n\n📩 DM us or check the link in bio to get yours.\n\n#ProductShowcase #ShortVideo #MustHave #ShopNow`
  const enCoverTitles = [
    "Must-See Everyday Upgrade",
    "Worth Every Penny!",
  ]
  return {
    hooks: [
      note ? `Stop scrolling — wait until you see ${note}!` : "Wait until you see this detail!",
      "Unbeatable value at this price point 🔥",
      "The everyday fix you didn't know you needed",
    ],
    voiceoverScript:
      "[0-3s Hook]\nIf you've been looking for an everyday upgrade, take a quick look at this.\n\n[3-10s Demo & Key Benefit]\nNotice the clean finish and practical design built for daily use." +
      (note ? ` Plus: ${note}.` : "") +
      "\n\n[10-15s Price & Call-to-Action]\nStock is limited — tap the link or message us to grab yours today!",
    caption: appendBrandSignature(enCaptionBody, params.brandSignature),
    coverTitle: enCoverTitles[0],
    coverTitles: enCoverTitles,
    analysisMode,
    frameCount,
  }
}

async function generateVideoWithOpenAICompatible(
  mediaParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  prompt: string,
  provider: "openrouter" | "groq",
  apiKey: string,
  model: string,
  analysisMode: "direct" | "keyframes",
  frameCount?: number,
  brandSignature?: string
): Promise<VideoContentResult> {
  const imageContentParts = mediaParts.map((part) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
    },
  }))

  const baseUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions"
  const providerName = provider === "groq" ? "Groq" : "OpenRouter"

  const sendRequest = async (candidateModel: string): Promise<VideoContentResult> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = window.location.origin
      headers["X-Title"] = "Content Creator SaaS"
    }

    const res = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: candidateModel,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }, ...imageContentParts],
          },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw parseApiError(providerName, res.status, text)
    }

    const data = await res.json()
    const content = String(data.choices?.[0]?.message?.content ?? "").trim()
    if (!content) {
      throw new Error(`No content returned from ${providerName} Video API.`)
    }

    return parseVideoContentResponse(content, analysisMode, frameCount, brandSignature)
  }

  if (provider === "openrouter") {
    return await callOpenRouterWithFallback(
      model || DEFAULT_MODELS.openrouter,
      sendRequest
    )
  }

  return await sendRequest(resolveGroqVisionModel(model))
}

async function extractKeyframeMedia(params: GenerateVideoContentParams): Promise<{
  mediaParts: Array<{ inlineData: { mimeType: string; data: string } }>
  frameCount: number
  analysisMode: "keyframes"
}> {
  params.onProgress?.("extracting")
  const frames = await extractKeyframesFromVideo(params.file, 5, 720, 0.75)
  params.onProgress?.("analyzing")
  return {
    mediaParts: frames.map((data) => ({
      inlineData: {
        mimeType: "image/jpeg",
        data,
      },
    })),
    frameCount: frames.length,
    analysisMode: "keyframes",
  }
}

export async function generateVideoContent(
  params: GenerateVideoContentParams
): Promise<VideoContentResult> {
  const { provider, apiKey, apiKeys, model, models } = getAiConfig()
  const openRouterKey = apiKeys.openrouter.trim()
  const geminiKey = apiKeys.gemini.trim()
  const groqKey = apiKeys.groq.trim()
  const openRouterModel = models.openrouter || DEFAULT_MODELS.openrouter
  const groqModel = models.groq || DEFAULT_MODELS.groq
  const geminiModel = model || GEMINI_VISION_MODEL

  const useKeyframesOnly = provider !== "gemini"
  const isDirectMode =
    !useKeyframesOnly && params.file.size <= VIDEO_DIRECT_MAX_BYTES
  let analysisMode: "direct" | "keyframes" = isDirectMode ? "direct" : "keyframes"

  let mediaParts: Array<{ inlineData: { mimeType: string; data: string } }> = []
  let frameCount: number | undefined

  if (isDirectMode) {
    params.onProgress?.("analyzing")
    const base64 = await fileToBase64(params.file)
    mediaParts = [
      {
        inlineData: {
          mimeType: inferVideoMimeType(params.file),
          data: base64,
        },
      },
    ]
  } else {
    const extracted = await extractKeyframeMedia(params)
    mediaParts = extracted.mediaParts
    frameCount = extracted.frameCount
    analysisMode = extracted.analysisMode
  }

  const routeViaOpenAICompatible = async (
    targetProvider: "openrouter" | "groq",
    key: string,
    targetModel: string
  ): Promise<VideoContentResult> => {
    if (mediaParts.some((part) => !part.inlineData.mimeType.startsWith("image/"))) {
      const extracted = await extractKeyframeMedia(params)
      mediaParts = extracted.mediaParts
      frameCount = extracted.frameCount
      analysisMode = extracted.analysisMode
    }
    const prompt = buildVideoPrompt({
      platform: params.platform,
      language: params.language,
      productNote: params.productNote,
      analysisMode,
      businessCategory: params.businessCategory,
      customNiche: params.customNiche,
      targetDurationSeconds: params.targetDurationSeconds,
      creativeAngleHint: params.creativeAngleHint,
      expandFromScript: params.expandFromScript,
    })
    return await generateVideoWithOpenAICompatible(
      mediaParts,
      prompt,
      targetProvider,
      key,
      targetModel,
      analysisMode,
      frameCount,
      params.brandSignature
    )
  }

  const runDirectGemini = async (): Promise<VideoContentResult> => {
    const prompt = buildVideoPrompt({
      platform: params.platform,
      language: params.language,
      productNote: params.productNote,
      analysisMode,
      businessCategory: params.businessCategory,
      customNiche: params.customNiche,
      targetDurationSeconds: params.targetDurationSeconds,
      creativeAngleHint: params.creativeAngleHint,
      expandFromScript: params.expandFromScript,
    })
    try {
      return await generateVideoWithGemini(
        mediaParts,
        prompt,
        geminiKey,
        geminiModel,
        analysisMode,
        frameCount,
        params.brandSignature
      )
    } catch (err) {
      const isQuota =
        (err instanceof ApiError && err.isQuotaExceeded) ||
        (err instanceof Error &&
          (err.message === QUOTA_EXCEEDED_MESSAGE ||
            err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.toLowerCase().includes("quota")))

      if (
        (isQuota || (err instanceof ApiError && err.status === 404)) &&
        geminiModel !== GEMINI_FALLBACK_MODEL
      ) {
        console.warn(
          `Gemini quota/model fallback for "${geminiModel}". Retrying with "${GEMINI_FALLBACK_MODEL}"...`
        )
        return await generateVideoWithGemini(
          mediaParts,
          prompt,
          geminiKey,
          GEMINI_FALLBACK_MODEL,
          analysisMode,
          frameCount,
          params.brandSignature
        )
      }
      throw err
    }
  }

  if (provider === "openrouter") {
    if (!openRouterKey) {
      await delay(900)
      return mockGenerateVideoContent(params, analysisMode, frameCount)
    }
    return await routeViaOpenAICompatible("openrouter", openRouterKey, openRouterModel)
  }

  if (provider === "groq") {
    if (!groqKey) {
      await delay(900)
      return mockGenerateVideoContent(params, analysisMode, frameCount)
    }
    return await routeViaOpenAICompatible("groq", groqKey, groqModel)
  }

  // Active provider is Gemini
  if (!apiKey.trim()) {
    await delay(900)
    return mockGenerateVideoContent(params, analysisMode, frameCount)
  }

  try {
    return await runDirectGemini()
  } catch (err) {
    if (isLocationUnsupportedError(err) && openRouterKey) {
      console.warn(
        "Gemini location unsupported (400). Routing video analysis through OpenRouter..."
      )
      return await routeViaOpenAICompatible("openrouter", openRouterKey, openRouterModel)
    }
    throw err
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      const base64 = result.includes(",") ? result.split(",")[1] : result
      if (!base64) {
        reject(new Error("Failed to encode file data."))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error("Failed to read file."))
    reader.readAsDataURL(blob)
  })
}

function readTextFileWithReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      resolve(text)
    }
    reader.onerror = () => reject(new Error("Failed to read text file."))
    reader.readAsText(file, "UTF-8")
  })
}

async function callGeminiMultimodalText(params: {
  mimeType: string
  base64Data: string
  prompt: string
  maxOutputTokens?: number
  temperature?: number
  allowEmpty?: boolean
}): Promise<string> {
  const { apiKeys } = getAiConfig()
  const geminiKey = apiKeys.gemini.trim()
  if (!geminiKey) {
    throw new ApiError(
      401,
      "Gemini API key is required in Settings for PDF extraction and audio transcription."
    )
  }

  const body = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: params.base64Data,
            },
          },
          { text: params.prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: params.temperature ?? 0.2,
      topP: 0.95,
      maxOutputTokens: params.maxOutputTokens ?? 8192,
    },
  }

  const res = await fetchGeminiGenerateContent(GEMINI_VISION_MODEL, geminiKey, body)

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, text)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const content = parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim()

  if (!content) {
    if (params.allowEmpty) {
      return ""
    }
    const finishReason = data.candidates?.[0]?.finishReason
    throw new Error(
      finishReason
        ? `No text returned from Gemini (finishReason: ${finishReason}).`
        : "No text returned from Gemini."
    )
  }

  return content
}

/**
 * Extract readable text from `.txt`, `.md`, `.epub`, or `.pdf` files
 * (PDF uses Gemini 2.5 Flash multimodal inlineData for scanned & Zawgyi docs).
 */
export async function extractTextFromDocument(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf")
  const isEpub = file.type === "application/epub+zip" || name.endsWith(".epub")
  const isTxt =
    file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")

  if (!isPdf && !isTxt && !isEpub) {
    throw new Error("Unsupported file type. Please upload a .txt, .md, .pdf, or .epub file.")
  }

  if (isTxt) {
    const text = await readTextFileWithReader(file)
    if (!text.trim()) {
      throw new Error("The uploaded text file is empty.")
    }
    return text.trim()
  }

  if (isEpub) {
    return await extractTextFromEpub(file)
  }

  const maxPdfBytes = 18 * 1024 * 1024
  if (file.size > maxPdfBytes) {
    throw new Error("PDF file is too large (max 18 MB).")
  }

  const base64Data = await blobToBase64(file)
  return await callGeminiMultimodalText({
    mimeType: "application/pdf",
    base64Data,
    prompt:
      "Extract all readable body text from this PDF document verbatim in natural reading order. If the document is scanned or contains legacy Zawgyi Burmese font encoding, accurately convert and output clean, standard Burmese Unicode (Myanmar Unicode) text. Preserve chapter/section headings and paragraph breaks. Do not summarize, translate, or add commentary. Output plain text only.",
    maxOutputTokens: 8192,
  })
}

const PDF_VISION_EXTRACTION_PROMPT = [
  "You are a Burmese (Myanmar) & English OCR and Unicode normalization specialist.",
  "Examine the attached PDF page images in exact page order and transcribe EVERY visible Burmese and English body word accurately.",
  "STRICT RULES:",
  "1. Output 100% clean, standard Myanmar Unicode (မြန်မာယူနီကုဒ်). Automatically fix any legacy Zawgyi, WinInnwa, or non-standard font glyph ordering into valid Unicode.",
  "2. Strip running headers, footers, and standalone page numbers.",
  "3. Normalize numbers, dates, currencies, and symbols into natural spoken Burmese words (e.g., 2026 -> နှစ်ထောင့်နှစ်ဆယ့်ခြောက်, 100% -> ရာနှုန်းပြည့်) and place proper Burmese punctuation (`၊` and `။`) at natural clause and sentence boundaries for smooth voiceover reading.",
  "4. Preserve paragraph breaks and natural reading order. Do NOT summarize, translate, or add any commentary, markdown headings, or page labels. Output plain text only.",
].join("\n")

/**
 * Extract 100% clean, standard Myanmar Unicode text from rendered PDF page images
 * via Gemini 2.5 Flash Vision—completely bypassing broken raw PDF text/Zawgyi layers.
 */
export async function extractCleanUnicodeFromPdfImages(
  pages: ReadonlyArray<{ pageNumber: number; mimeType: string; base64Data: string }>
): Promise<string> {
  if (pages.length === 0) {
    throw new Error("No PDF page images provided for extraction.")
  }

  const { apiKeys } = getAiConfig()
  const geminiKey = apiKeys.gemini.trim()
  if (!geminiKey) {
    throw new ApiError(
      401,
      "Gemini API key is required in Settings for PDF Vision extraction."
    )
  }

  const batchSize = 5
  const extractedBatches: string[] = []

  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize)
    const imageParts = batch.map((page) => ({
      inlineData: {
        mimeType: page.mimeType,
        data: page.base64Data,
      },
    }))

    const body = {
      contents: [
        {
          parts: [...imageParts, { text: PDF_VISION_EXTRACTION_PROMPT }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    }

    const res = await fetchGeminiGenerateContent(GEMINI_VISION_MODEL, geminiKey, body)
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw parseApiError("Gemini", res.status, text)
    }

    const data = await res.json()
    const parts: Array<{ text?: string; thought?: boolean }> =
      data.candidates?.[0]?.content?.parts ?? []
    const content = parts
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim()

    if (content) {
      extractedBatches.push(content)
    }
  }

  const combined = extractedBatches.join("\n\n").trim()
  if (!combined) {
    throw new Error("Could not extract readable text from the selected PDF pages.")
  }
  return combined
}

export type AudioTranscriptionLanguage = "auto" | "my" | "en"
export type AudioTopicHint = "general" | "tech" | "sales" | "storytelling"

const TOPIC_HINT_INSTRUCTIONS: Record<AudioTopicHint, string> = {
  general: "Topic context: General conversation / everyday content.",
  tech: "Topic context: Technology, mobile phones, apps, gadgets, and software. Preserve tech brand names, model numbers, specs, and English terms accurately.",
  sales: "Topic context: E-commerce, online shop sales, product promotion, pricing, and customer CTA. Preserve prices, discounts, and product names accurately.",
  storytelling: "Topic context: Storytelling, book recap, vlog narration, or personal experience. Preserve emotional flow and natural sentence pauses.",
}

function normalizeAudioMimeType(mimeType: string, fileName?: string): string {
  const clean = mimeType.split(";")[0].trim().toLowerCase()
  if (clean && clean !== "application/octet-stream") {
    if (clean === "audio/x-m4a") return "audio/mp4"
    return clean
  }
  const lowerName = (fileName ?? "").toLowerCase()
  if (lowerName.endsWith(".mp3")) return "audio/mp3"
  if (lowerName.endsWith(".m4a")) return "audio/mp4"
  if (lowerName.endsWith(".wav")) return "audio/wav"
  if (lowerName.endsWith(".ogg")) return "audio/ogg"
  if (lowerName.endsWith(".webm")) return "audio/webm"
  return "audio/webm"
}

/**
 * Transcribe spoken Burmese and/or English audio directly via Gemini 2.5 Flash (`inlineData`).
 */
export async function transcribeAudioWithGemini(
  audioBlob: Blob,
  mimeType?: string,
  languageHint: AudioTranscriptionLanguage = "auto",
  fileName?: string,
  cleanScript = false,
  topicHint: AudioTopicHint = "general"
): Promise<string> {
  const maxAudioBytes = 19 * 1024 * 1024
  if (audioBlob.size > maxAudioBytes) {
    throw new Error("Audio file is too large (max 19 MB).")
  }

  const resolvedMime = normalizeAudioMimeType(
    mimeType || audioBlob.type || "",
    fileName
  )
  const base64Data = await blobToBase64(audioBlob)

  const langInstruction =
    languageHint === "my"
      ? "The speaker is speaking primarily in Burmese (Myanmar Unicode). Transcribe accurately in natural Myanmar Unicode script, while preserving any code-switched English words in proper English spelling."
      : languageHint === "en"
        ? "The speaker is speaking primarily in English. Transcribe accurately in clean English."
        : "The speaker may speak Burmese (Myanmar), English, or a mix of both (code-switching). Transcribe each word accurately in its spoken language (Myanmar Unicode for Burmese, proper English spelling for English)."

  const topicInstruction = TOPIC_HINT_INSTRUCTIONS[topicHint]

  const fillerInstruction =
    "Automatically strip Burmese and English filler hesitations (such as 'အဲ...', 'အင်း...', 'ပေါ့နော်...', 'ဟိုဟာ...', 'um', 'uh', 'er') while keeping the speaker's exact meaning."

  const cleanupInstruction = cleanScript
    ? ` ${fillerInstruction} Also polish false starts into smooth, natural, ready-to-read voiceover script text.`
    : ` ${fillerInstruction}`

  const rawText = await callGeminiMultimodalText({
    mimeType: resolvedMime,
    base64Data,
    prompt: `Transcribe ONLY the actual spoken words clearly heard in this audio into clean, readable text with proper punctuation. ${langInstruction} ${topicInstruction}${cleanupInstruction}

STRICT ANTI-REPETITION & ACCURACY RULES:
1. Transcribe ONLY actual spoken words. Do NOT invent, guess, or hallucinate words during quiet parts or background noise.
2. NEVER repeat filler syllables or phrases such as "ဟို ဟာ", "ဟု ဟာ", "ဟိုဟာ", "ပေါ့နော်", "အဲ", "အင်း", "um", or "uh" in a loop.
3. If the audio is silent, contains only background noise/breathing, or has no clearly intelligible speech, return "" (empty string) and nothing else.
4. Do not include timestamps, speaker labels unless clearly multiple speakers, or any extra commentary—output only the transcribed text.`,
    maxOutputTokens: 4096,
    temperature: 0.1,
    allowEmpty: true,
  })

  const trimmed = rawText.trim()
  if (!trimmed || trimmed === '""' || trimmed === "''") {
    return ""
  }

  // Guard against residual Burmese filler hallucination loops
  const withoutRepeatedFillers = trimmed
    .replace(/(?:ဟု\s*ဟာ|ဟို\s*ဟာ|ဟိုဟာ)[\s။,.!?\u200B]*/g, " ")
    .trim()
  if (!withoutRepeatedFillers && /(?:ဟု\s*ဟာ|ဟို\s*ဟာ|ဟိုဟာ)/.test(trimmed)) {
    return ""
  }

  return trimmed
}

/**
 * Rewrite a book chapter or article into engaging conversational Burmese
 * YouTube Recap Storytelling narration with natural pauses (၊, ။).
 */
export async function rewriteChapterAsRecap(
  chapterText: string,
  language: "my" | "en" = "my"
): Promise<string> {
  const { apiKeys } = getAiConfig()
  const geminiKey = apiKeys.gemini.trim()
  if (!geminiKey) {
    throw new ApiError(401, "Gemini API key is required in Settings.")
  }

  const trimmed = chapterText.trim()
  if (!trimmed) {
    throw new Error("Chapter text is empty.")
  }

  const prompt =
    language === "en"
      ? `Rewrite the following book/article excerpt into an engaging YouTube Recap storytelling narration script in natural conversational English. Keep all key plot points, insights, and emotional beats, add a gripping opening hook, and use clear sentence punctuation for smooth voiceover pacing. Output ONLY the narration script.\n\n---\n${trimmed.slice(0, 12000)}`
      : `Rewrite the following book/article excerpt into an engaging YouTube Book Recap / Movie Recap storytelling narration in natural conversational Burmese (Myanmar Unicode).
Rules:
1. Start with a captivating storytelling hook (e.g., "ဒီအခန်းမှာတော့...").
2. Keep all key events, lessons, and emotional turning points faithful to the source text.
3. Write in natural spoken Burmese storytelling style suitable for a YouTube narrator, using proper Burmese punctuation (၊ and ။) for natural breathing pauses.
4. Spell out numbers and dates naturally in Burmese or clean digits, and keep output plain text only (no markdown headings, no stage directions).

Source text:
${trimmed.slice(0, 12000)}`

  const res = await fetchGeminiGenerateContent(GEMINI_MODEL, geminiKey, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.55,
      topP: 0.95,
      maxOutputTokens: 4096,
    },
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, errText)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const output = parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim()

  if (!output) {
    throw new Error("Gemini returned an empty recap script.")
  }
  return output
}

export interface VideoClipSuggestion {
  startTime: string
  endTime: string
  title: string
  reason: string
  hookScore: number
}

export interface VideoCaptionSegment {
  startTime: string
  endTime: string
  text: string
}

export interface VideoClipsAndCaptionsResult {
  clips: VideoClipSuggestion[]
  captions: VideoCaptionSegment[]
}

/**
 * Analyze a video with Gemini 2.5 Flash to suggest viral ~30s highlight timestamps
 * (Smart Clip Finder) and generate timestamped Burmese-English subtitles (Auto-Captions).
 */
export async function analyzeVideoClipsAndCaptions(
  file: File,
  language: "my" | "en" = "my"
): Promise<VideoClipsAndCaptionsResult> {
  const { apiKeys } = getAiConfig()
  const geminiKey = apiKeys.gemini.trim()
  if (!geminiKey) {
    throw new ApiError(401, "Gemini API key is required in Settings for video clip & caption analysis.")
  }

  let mediaPart: { inlineData: { mimeType: string; data: string } }
  if (file.size <= VIDEO_DIRECT_MAX_BYTES) {
    const base64 = await fileToBase64(file)
    mediaPart = {
      inlineData: {
        mimeType: inferVideoMimeType(file),
        data: base64,
      },
    }
  } else {
    const extracted = await extractKeyframeMedia({
      file,
      platform: "TikTok / Reels",
      language,
    })
    if (extracted.mediaParts.length === 0) {
      throw new Error("Could not extract frames from video.")
    }
    mediaPart = extracted.mediaParts[0]
  }

  const langPrompt =
    language === "en"
      ? "Write clip titles/reasons and captions in clean English."
      : "Write clip titles/reasons and captions in natural Burmese (Myanmar Unicode) with proper English spelling for any code-switched English terms."

  const prompt = `Analyze this video and return ONLY valid JSON (no markdown fences) with two arrays:
1. "clips": Suggest 2 to 4 viral ~30-second highlight segments for TikTok/Reels/Shorts ("Smart Clip Finder"). Each item: { "startTime": "MM:SS", "endTime": "MM:SS", "title": string, "reason": string, "hookScore": number (1-100) }.
2. "captions": Generate timestamped subtitles/captions covering the spoken or visual narrative ("Auto-Captions"). Each item: { "startTime": "MM:SS", "endTime": "MM:SS", "text": string }.
${langPrompt}`

  const res = await fetchGeminiGenerateContent(GEMINI_VISION_MODEL, geminiKey, {
    contents: [
      {
        parts: [mediaPart, { text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, errText)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const rawJson = parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim()

  const cleaned = rawJson.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
  const parsed = JSON.parse(cleaned) as Partial<VideoClipsAndCaptionsResult>

  return {
    clips: Array.isArray(parsed.clips) ? parsed.clips : [],
    captions: Array.isArray(parsed.captions) ? parsed.captions : [],
  }
}

// ============================================================================
// Human-Centric Editorial Writing Studio (Anti-AI Burmese Copywriting Engine)
// ============================================================================

export type EditorialFormatOption =
  | "fb_sales"
  | "tiktok_script"
  | "product_review"
  | "personal_story"

export type EditorialToneOption =
  | "warm_friend"
  | "calm_clear"
  | "light_humorous"

export type EditorialLengthOption = "short" | "medium" | "detailed"

export interface EditorialShopProfile {
  name: string
  phone: string
  address: string
  autoAppend: boolean
}

export interface EditorialDualRequest {
  rawNotes: string
  format: EditorialFormatOption
  tone: EditorialToneOption
  length: EditorialLengthOption
  voiceDnaSamples?: string[]
  shopProfile?: EditorialShopProfile
}

export interface EditorialDualResponse {
  optionA: string
  optionB: string
}

export interface EditorialPolishRequest {
  currentDraft: string
  mode: "shorten" | "humanize"
  tone: EditorialToneOption
  voiceDnaSamples?: string[]
}

export interface EditorialHooksRequest {
  currentDraft: string
  rawNotes: string
  format: EditorialFormatOption
  tone: EditorialToneOption
  voiceDnaSamples?: string[]
}

const EDITORIAL_FORMAT_GUIDE: Record<EditorialFormatOption, string> = {
  fb_sales:
    "Facebook Sales Post (Facebook အရောင်းပို့စ်): Trustworthy, helpful product/service post for Myanmar Facebook readers. Highlight real-life usefulness and clear pricing/order info if mentioned in notes, without pushy hype.",
  tiktok_script:
    "TikTok Video Script (TikTok ဗီဒီယိုစာသား): Natural spoken script ready to read aloud on camera. Short, punchy spoken sentences with natural pauses and Burmese labels (မြင်ကွင်း:, ပြောစကား:) only where genuinely helpful.",
  product_review:
    "Product Review (Product Review): Honest, grounded first-hand review like telling a close friend what actually works, what stands out, and who it suits.",
  personal_story:
    "Personal Story Post (ကိုယ်တွေ့မျှဝေပို့စ်): Authentic diary-like reflection or experience sharing. Warm, relatable, and conversational without sounding preachy.",
}

const EDITORIAL_TONE_GUIDE: Record<EditorialToneOption, string> = {
  warm_friend:
    "မိတ်ဆွေလို နွေးထွေးစွာ (Warm & Friendly): Write like a genuine friend chatting over coffee. Use natural everyday Burmese particles softly (e.g., နော်, ဗျာ/ရှင့်, တကယ်တော့).",
  calm_clear:
    "ရိုးရှင်းတည်ငြိမ်စွာ (Calm, Simple & Clear): Clean, understated, calm editorial tone. Minimal particles, clear sentences, zero exaggeration.",
  light_humorous:
    "ပေါ့ပေါ့ပါးပါး ဟာသနှော၍ (Light & Playful): Relaxed everyday humor, witty relatable observations, never forced or cringey.",
}

const EDITORIAL_LENGTH_GUIDE: Record<EditorialLengthOption, string> = {
  short:
    "တိုတိုကျစ်ကျစ် (Short & Tight): 2–4 crisp short paragraphs (~60–110 words / ~350–650 Burmese characters). Every sentence earns its place.",
  medium:
    "အနေတော် (Medium): 3–5 balanced mobile-friendly paragraphs (~110–180 words / ~650–1,050 Burmese characters) with clean breathing room.",
  detailed:
    "အသေးစိတ် (Detailed): 5–7 well-paced short paragraphs (~180–280 words / ~1,050–1,650 Burmese characters) preserving rich details and story flow.",
}

const ANTI_AI_BURMESE_SYSTEM_PROMPT = `You are a quiet, thoughtful Myanmar human co-writer and editor—NOT a robotic marketing AI.
Your job is to take the user's raw thoughts, voice notes, or product details and polish them into natural, human-sounding Burmese writing.

STRICT ANTI-AI BURMESE RULES (NON-NEGOTIABLE):
1. Co-Writer Philosophy: Treat the user's input as authentic raw human experience. Preserve their core facts, prices, personal details, and real intent. Never invent fake specs or exaggerated claims.
2. Ban Emoji Spam: STRICTLY FORBID starting every bullet or line with emojis like 🚀, 🔥, ✨, 💡, 🎯, 💥. Use AT MOST 1–2 subtle emojis in the entire post (or 0 emojis if the tone is calm/clean). Never use emoji bullet lists.
3. Ban AI Clichés & Translationese: STRICTLY FORBID overused AI hype words and stiff English-to-Burmese translationese, including:
   - "အံ့မခန်း"
   - "မယုံနိုင်လောက်အောင်"
   - "တစ်မူထူးခြားတဲ့"
   - "ယနေ့ခေတ်တွင်"
   - "အဆင့်မြင့်မားသော"
   - "ပြီးပြည့်စုံသော"
   - Stiff textbook endings: "ဖြစ်ပါသည်", "ပြုလုပ်နိုင်ပါသည်", "ဝယ်ယူရရှိနိုင်ပါသည်", "ဖော်ပြပေးလိုက်ပါတယ်", "ပါဝင်ပါသည်", "ရှိပါသည်".
4. Natural Spoken Burmese Flow: Write in natural everyday spoken Burmese (မြန်မာစကားပြော) with clean mobile line spacing (short 1–3 sentence paragraphs separated by blank lines so it reads effortlessly on a phone screen).
5. International Names: Keep international brand names, product models, and platforms (e.g., Apple, Sony, Zara, Laneige, TikTok, Facebook) in their original English spelling.
6. Plain Text Only: NEVER use Markdown symbols (*, **, ***, # headings, or backticks).`

function buildVoiceDnaBlock(samples?: string[]): string {
  const valid = (samples ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3)
  if (valid.length === 0) return ""
  const formatted = valid
    .map((sample, idx) => `Sample ${idx + 1}:\n"""\n${sample}\n"""`)
    .join("\n\n")
  return `\n\nPERSONAL VOICE DNA (Mirror this writer's exact vocabulary, sentence rhythm, punctuation, and how they address readers):\n${formatted}`
}

export function formatShopFooter(profile?: EditorialShopProfile): string {
  if (!profile || !profile.autoAppend) return ""
  const lines = [
    profile.name.trim(),
    profile.phone.trim() ? `ဖုန်း - ${profile.phone.trim()}` : "",
    profile.address.trim(),
  ].filter(Boolean)
  return lines.join("\n")
}

function appendShopFooterIfNeeded(text: string, profile?: EditorialShopProfile): string {
  const footer = formatShopFooter(profile)
  if (!footer) return text.trim()
  const trimmed = text.trim()
  if (trimmed.includes(footer)) return trimmed
  return `${trimmed}\n\n${footer}`
}

async function runEditorialModelCall(
  systemPrompt: string,
  userPrompt: string,
  expectJson: boolean
): Promise<string> {
  const { provider, apiKey, apiKeys, model, models } = getAiConfig()
  const trimmedKey = apiKey.trim()

  const callGemini = async (targetModel: string, key: string): Promise<string> => {
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.72,
        topP: 0.92,
        maxOutputTokens: 4096,
        ...(expectJson ? { responseMimeType: "application/json" } : {}),
      },
    }
    const res = await fetchGeminiGenerateContent(targetModel, key, body)
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      throw parseApiError("Gemini", res.status, errText)
    }
    const data = await res.json()
    const parts: Array<{ text?: string; thought?: boolean }> =
      data.candidates?.[0]?.content?.parts ?? []
    const text = parts
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim()
    if (!text) throw new Error("No content returned from Gemini API.")
    return text
  }

  const callOpenAICompatible = async (
    targetProvider: AIProvider,
    key: string,
    targetModel: string
  ): Promise<string> => {
    const baseUrl =
      targetProvider === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions"
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    }
    if (targetProvider === "openrouter") {
      headers["HTTP-Referer"] = window.location.origin
      headers["X-Title"] = "Content Creator SaaS"
    }
    const res = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.72,
        top_p: 0.92,
        max_tokens: 2048,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      throw parseApiError(targetProvider === "groq" ? "Groq" : "OpenRouter", res.status, errText)
    }
    const data = await res.json()
    const text = (data.choices?.[0]?.message?.content ?? "").trim()
    if (!text) throw new Error(`No content returned from ${targetProvider} API.`)
    return text
  }

  if (provider === "gemini") {
    const primaryModel = model || GEMINI_MODEL
    try {
      return await callGemini(primaryModel, trimmedKey)
    } catch (err) {
      if (isLocationUnsupportedError(err) && apiKeys.openrouter) {
        return await callOpenRouterWithFallback(
          models.openrouter || DEFAULT_MODELS.openrouter,
          (candidate) => callOpenAICompatible("openrouter", apiKeys.openrouter, candidate),
          { isTextOnly: true }
        )
      }
      const isQuota = err instanceof ApiError && err.isQuotaExceeded
      if (isQuota && primaryModel !== GEMINI_FALLBACK_MODEL) {
        return await callGemini(GEMINI_FALLBACK_MODEL, trimmedKey)
      }
      throw err
    }
  }

  if (provider === "openrouter") {
    return await callOpenRouterWithFallback(
      model || DEFAULT_MODELS.openrouter,
      (candidate) => callOpenAICompatible("openrouter", trimmedKey, candidate),
      { isTextOnly: true }
    )
  }

  return await callOpenAICompatible(
    provider,
    trimmedKey,
    model || "llama-3.3-70b-versatile"
  )
}

function parseJsonPayload<T>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const firstBrace = cleaned.indexOf("{")
    const lastBrace = cleaned.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T
      } catch {
        return null
      }
    }
    return null
  }
}

export async function generateEditorialDualAngles(
  request: EditorialDualRequest
): Promise<EditorialDualResponse> {
  const { apiKey } = getAiConfig()
  const rawNotes = request.rawNotes.trim()

  if (!apiKey.trim()) {
    await delay(800)
    const optionA = appendShopFooterIfNeeded(
      `${rawNotes}\n\nလက်တွေ့သုံးကြည့်ရသလောက် ရိုးရိုးရှင်းရှင်းနဲ့ အသုံးတည့်တဲ့အတွက် မျှဝေပေးလိုက်ပါတယ်နော်။ စိတ်ဝင်စားရင် မေးမြန်းနိုင်ပါတယ်ဗျာ။`,
      request.shopProfile
    )
    const optionB = appendShopFooterIfNeeded(
      `ဒီအကြောင်းလေးကို အရင်ကတည်းက မျှဝေချင်နေတာ ကြာပါပြီ။\n\n"${rawNotes}" ဆိုတဲ့အတိုင်း တကယ်တမ်း ကိုယ်တိုင်ကြုံတွေ့ပြီးမှ ပြောပြဖြစ်တာပါ။ သေချာလေး စဉ်းစားကြည့်ရင် တကယ်အသုံးဝင်တယ်နော်။`,
      request.shopProfile
    )
    return { optionA, optionB }
  }

  const voiceDna = buildVoiceDnaBlock(request.voiceDnaSamples)
  const systemPrompt = `${ANTI_AI_BURMESE_SYSTEM_PROMPT}${voiceDna}`

  const userPrompt = `Transform the user's raw draft notes into TWO distinct, natural human-written Burmese versions.

Format: ${EDITORIAL_FORMAT_GUIDE[request.format]}
Tone: ${EDITORIAL_TONE_GUIDE[request.tone]}
Length: ${EDITORIAL_LENGTH_GUIDE[request.length]}

User's Raw Notes / Thoughts:
"""
${rawNotes}
"""

Return ONLY valid JSON with these exact two keys:
{
  "optionA": "Option A — ရိုးရှင်းတိုက်ရိုက်ဟန် (Direct & Clear): Straight to the point, crisp, practical, easy to scan on mobile.",
  "optionB": "Option B — ဇာတ်ကြောင်းပြောဟန် (Warm Storytelling): Opens with a relatable human moment or story, flows warmly like a real person sharing experience."
}

Remember:
- NO emoji spam (max 1-2 subtle emojis total, or 0).
- NO banned AI hype words (အံ့မခန်း, မယုံနိုင်လောက်အောင်, တစ်မူထူးခြားတဲ့, ယနေ့ခေတ်တွင်).
- NO Markdown (*, **, # headings).`

  const raw = await runEditorialModelCall(systemPrompt, userPrompt, true)
  const parsed = parseJsonPayload<{ optionA?: string; optionB?: string }>(raw)

  if (parsed?.optionA && parsed?.optionB) {
    return {
      optionA: appendShopFooterIfNeeded(sanitizePlainText(parsed.optionA), request.shopProfile),
      optionB: appendShopFooterIfNeeded(sanitizePlainText(parsed.optionB), request.shopProfile),
    }
  }

  const fallbackText = appendShopFooterIfNeeded(sanitizePlainText(raw), request.shopProfile)
  return {
    optionA: fallbackText,
    optionB: fallbackText,
  }
}

export async function polishEditorialDraft(
  request: EditorialPolishRequest
): Promise<string> {
  const { apiKey } = getAiConfig()
  const current = request.currentDraft.trim()

  if (!apiKey.trim()) {
    await delay(600)
    return current
  }

  const voiceDna = buildVoiceDnaBlock(request.voiceDnaSamples)
  const systemPrompt = `${ANTI_AI_BURMESE_SYSTEM_PROMPT}${voiceDna}`

  const taskInstruction =
    request.mode === "shorten"
      ? "Tighten and condense this Burmese post so it is noticeably shorter, cleaner, and punchier while keeping its human warmth, core facts, and any contact info at the bottom."
      : "Rewrite this Burmese post to sound 100% like a real Myanmar person wrote it casually and naturally. Remove any remaining formal, stiff, or AI-like phrasing, and remove excess emojis."

  const userPrompt = `Task: ${taskInstruction}
Tone: ${EDITORIAL_TONE_GUIDE[request.tone]}

Draft to refine:
"""
${current}
"""

Output ONLY the refined plain text.`

  const raw = await runEditorialModelCall(systemPrompt, userPrompt, false)
  return sanitizePlainText(raw)
}

export async function generateEditorialHooks(
  request: EditorialHooksRequest
): Promise<string[]> {
  const { apiKey } = getAiConfig()

  if (!apiKey.trim()) {
    await delay(600)
    return [
      "တကယ်သုံးကြည့်ပြီးမှ ပြောပြချင်တဲ့ အချက်လေးတစ်ခု ရှိတယ်နော်။",
      "အရင်ကဆို ဒီလိုမျိုး သေချာမသိခဲ့ပေမယ့် အခုတော့ တော်တော်လေး အဆင်ပြေသွားပြီ။",
      "ရိုးရိုးရှင်းရှင်းနဲ့ လက်တွေ့အသုံးတည့်တာလေးကို မျှဝေပေးချင်လို့ပါ။",
    ]
  }

  const voiceDna = buildVoiceDnaBlock(request.voiceDnaSamples)
  const systemPrompt = `${ANTI_AI_BURMESE_SYSTEM_PROMPT}${voiceDna}`

  const userPrompt = `Write 3 fresh, natural, non-clickbaity opening hook sentences (1-2 lines each) in spoken Burmese for this post.
Format: ${EDITORIAL_FORMAT_GUIDE[request.format]}
Tone: ${EDITORIAL_TONE_GUIDE[request.tone]}

Original Notes:
"""
${request.rawNotes.trim()}
"""

Current Draft:
"""
${request.currentDraft.trim()}
"""

Return ONLY valid JSON:
{
  "hooks": ["hook 1", "hook 2", "hook 3"]
}

Rules:
- Each hook must feel natural and human, NOT clickbait or AI hype.
- Max 0-1 subtle emoji per hook.
- No Markdown.`

  const raw = await runEditorialModelCall(systemPrompt, userPrompt, true)
  const parsed = parseJsonPayload<{ hooks?: string[] }>(raw)
  if (Array.isArray(parsed?.hooks) && parsed.hooks.length > 0) {
    return parsed.hooks
      .map((h) => sanitizePlainText(String(h)))
      .filter(Boolean)
      .slice(0, 3)
  }

  return sanitizePlainText(raw)
    .split("\n")
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
}

export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"
export const GEMINI_IMAGE_FALLBACK_MODEL = "gemini-2.0-flash-exp-image-generation"

export interface GenerateProductSceneRequest {
  imageBase64: string
  mimeType: string
  scenePrompt: string
}

export interface GenerateProductSceneResult {
  imageDataUrl: string
  mimeType: string
}

async function callGeminiImageEdit(
  request: GenerateProductSceneRequest,
  apiKey: string,
  model: string
): Promise<GenerateProductSceneResult> {
  const base64Data = request.imageBase64.replace(/^data:[^;]+;base64,/, "")
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const prompt = `Edit this product photo by replacing the background and environment with the following scene: ${request.scenePrompt}.
CRITICAL INSTRUCTIONS:
- Preserve the main product(s) from the original image completely intact (exact shape, proportions, colors, text, logos, and details).
- Only regenerate the surrounding background, surface, lighting, and natural shadows/reflections so the product blends photorealistically into the new scene.
- Output a clean, high-resolution commercial product photograph with no added text or watermarks.`

  const body = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: request.mimeType || "image/jpeg",
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, text)
  }

  const data = await res.json()
  const parts: Array<{
    inlineData?: { mimeType?: string; data?: string }
    inline_data?: { mime_type?: string; data?: string }
    text?: string
  }> = data.candidates?.[0]?.content?.parts ?? []

  for (const part of parts) {
    const inline = part.inlineData
    if (inline?.data) {
      const mimeType = inline.mimeType || "image/png"
      return {
        imageDataUrl: `data:${mimeType};base64,${inline.data}`,
        mimeType,
      }
    }
    const snakeInline = part.inline_data
    if (snakeInline?.data) {
      const mimeType = snakeInline.mime_type || "image/png"
      return {
        imageDataUrl: `data:${mimeType};base64,${snakeInline.data}`,
        mimeType,
      }
    }
  }

  throw new ApiError(500, "Gemini did not return a generated image. Please try another prompt.")
}

export async function generateProductScene(
  request: GenerateProductSceneRequest
): Promise<GenerateProductSceneResult> {
  const { provider, apiKey } = getAiConfig()
  const envGeminiKey =
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""
  const geminiKey =
    provider === "gemini" ? apiKey.trim() || envGeminiKey : envGeminiKey

  if (!geminiKey) {
    throw new ApiError(
      400,
      "Please save your Gemini API key in Settings to use AI Scene Studio."
    )
  }

  try {
    return await callGeminiImageEdit(request, geminiKey, GEMINI_IMAGE_MODEL)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw err
    }
    return await callGeminiImageEdit(request, geminiKey, GEMINI_IMAGE_FALLBACK_MODEL)
  }
}




