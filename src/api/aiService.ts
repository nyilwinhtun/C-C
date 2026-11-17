import { useUIStore } from "@/store/useUIStore"

export const GEMINI_MODEL = "gemini-3.5-flash-lite"
export const GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite"
export const QUOTA_EXCEEDED_MESSAGE =
  "Daily/minute API quota exceeded. Please switch model in Settings or wait a moment."

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
  language: string
  includeHashtags: boolean
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

const SYSTEM_PROMPT = `You are an expert social media copywriter and content strategist.
You create engaging, platform-native content in English, Myanmar (Burmese), or bilingual (Myanmar + English).

Rules:
- Write naturally for the selected platform (Facebook, TikTok, YouTube, Instagram, Telegram).
- Match the requested tone exactly.
- If the language is "myanmar" or "my":
  - Write 100% in natural Myanmar (Burmese) Unicode script, even if the Topic is written in English.
  - Write ALL video script labels and stage directions in Burmese (use "မြင်ကွင်း:", "အသံ:", "ဖန်သားပြင်စာသား:", "ပြောစကား:" instead of English "(Visual - ...)", "(Sound - ...)", "(Audio - ...)", or "[Visual Cue]").
  - Keep international tech, product, and platform brand names (e.g., Redmi, iPhone, Samsung, TikTok, Facebook, Instagram, YouTube, Telegram) in their original English spelling rather than phonetic Burmese transliteration.
- If the language is "bilingual", blend Myanmar and English naturally while keeping international brand names in English.
- When includeHashtags is true, append relevant hashtags at the end.
- NEVER use raw Markdown formatting symbols such as *, **, ***, # headings, or backticks. Output clean plain text ready to copy-paste directly onto Facebook or TikTok.
- Keep formatting clean with short paragraphs, line breaks, and emoji where appropriate.
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

function buildUserPrompt(request: GenerateContentRequest): string {
  const hashtagInstruction = request.includeHashtags
    ? "Include relevant hashtags at the end."
    : "Do not include hashtags."
  const isMyanmarOnly = request.language === "myanmar" || request.language === "my"
  const myanmarRules = isMyanmarOnly
    ? "\nStrict Myanmar Rules: Write 100% in natural Burmese script (even if the topic is in English). Use Burmese script labels like မြင်ကွင်း:, အသံ:, ဖန်သားပြင်စာသား:, ပြောစကား: instead of English stage directions. Keep international brand names (e.g., Redmi, iPhone, Samsung, TikTok, Facebook) in English spelling. Do NOT use Markdown symbols (*, **, # headings)."
    : "\nFormatting Rule: Output clean plain text with no Markdown symbols (*, **, # headings)."

  if (request.instruction && request.currentContent) {
    return `Task: ${request.instruction}
Target Platform: ${request.platform}
Target Content Type: ${request.contentType}
Tone: ${request.tone}
Output Language: ${request.language}
${hashtagInstruction}${myanmarRules}

Current content to transform:
"""
${request.currentContent}
"""

Output only the final transformed content now.`
  }

  return `Platform: ${request.platform}
Content type: ${request.contentType}
Tone: ${request.tone}
Language: ${request.language}
Topic: ${request.topic}
${hashtagInstruction}${myanmarRules}
Write the content now.`
}

function mockGenerate(request: GenerateContentRequest): GeneratedContent {
  const isMyanmar = request.language === "myanmar" || request.language === "bilingual"
  const greeting = isMyanmar
    ? request.language === "bilingual"
      ? "Hello / Mingalaba!\n\n"
      : "မင်္ဂလာပါ!\n\n"
    : "Hello!\n\n"
  const body = `Here is a ${request.tone} ${request.contentType.replace(
    "_",
    " "
  )} for "${request.topic}" on ${request.platform}.\n\n`
  const closing = isMyanmar
    ? request.language === "bilingual"
      ? "\n#Myanmar #Content #${request.platform}"
      : "\n#မյանမာ # content #${request.platform}"
    : `\n#${request.platform} #ContentCreator #SocialMedia`
  return {
    id: crypto.randomUUID(),
    topic: request.topic,
    platform: request.platform,
    contentType: request.contentType,
    tone: request.tone,
    content:
      greeting +
      body +
      "This is a mock AI response. Add your API key in Settings to connect to a real AI provider." +
      closing,
    createdAt: new Date().toISOString(),
  }
}

function getAiConfig() {
  const { aiProvider, aiApiKey, aiModel } = useUIStore.getState()
  const envGeminiKey =
    aiProvider === "gemini"
      ? ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "")
      : ""
  return {
    provider: aiProvider,
    apiKey: aiApiKey || envGeminiKey,
    model: aiModel === "gemini-2.5-flash-lite" ? GEMINI_FALLBACK_MODEL : aiModel,
  }
}

async function generateWithGemini(
  request: GenerateContentRequest,
  apiKey: string,
  model: string
): Promise<GeneratedContent> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: buildUserPrompt(request) }] }],
    generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096 },
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
  const { provider, apiKey, model } = getAiConfig()
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
    const fallbackModel =
      provider === "groq" ? "llama-3.3-70b-versatile" : "openrouter/auto"
    return await generateWithOpenAICompatible(
      request,
      provider,
      trimmedKey,
      model || fallbackModel
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
  tech: "Tech & Gadgets (smartphones, laptops, electronics). Focus spec1, spec2, spec3 on concise hardware/warranty specs (e.g., '8GB / 256GB', '5000mAh', '1 Year Warranty').",
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
- When writing in Burmese, keep ALL international brand names, model names, and technical terms (e.g., Redmi, iPhone, Samsung, Pro Max, 5G, OLED, SPF, Latte) in their original English spelling. NEVER transliterate brand or model names phonetically into Burmese.
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
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
  const { provider, apiKey, model } = getAiConfig()
  const trimmedKey = apiKey.trim()

  if (!trimmedKey) {
    await delay(900)
    const cat = request.category ?? "new_arrival"
    if (request.language === "my") {
      const mockByCategory: Record<PhotoCategoryKey, PhotoSuggestionResult> = {
        tech: {
          headline: "Redmi Note 13 Pro 5G အသစ်ရောက်ရှိ",
          spec1: "8GB / 256GB",
          spec2: "5000mAh Battery",
          spec3: "1 Year Warranty",
          suggestedPrice: "890,000 Ks",
          caption:
            "📱 စွမ်းဆောင်ရည်မြင့် Redmi Note 13 Pro 5G ရောက်ရှိပါပြီ!\n\n8GB RAM / 256GB Storage နှင့် 5000mAh Battery ပါဝင်ပြီး Official Warranty ၁ နှစ် အပြည့်အဝ ရရှိမှာပါ။\n\n📩 မှာယူလိုပါက Inbox မှတစ်ဆင့် ဆက်သွယ်နိုင်ပါတယ်ခင်ဗျာ။\n\n#TechMyanmar #Smartphone #NewArrival",
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
        headline: "Redmi Note 13 Pro 5G In Stock",
        spec1: "8GB / 256GB",
        spec2: "5000mAh Battery",
        spec3: "1 Year Warranty",
        suggestedPrice: "$299",
        caption:
          "📱 Upgrade your daily driver with the Redmi Note 13 Pro 5G!\n\nPacked with 8GB / 256GB, a 5000mAh battery, and a full 1 Year Warranty. Message us to order today!\n\n#TechDeals #Smartphone #NewArrival",
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
    const primaryModel = model || GEMINI_MODEL
    try {
      return await suggestPhotoWithGemini(request, trimmedKey, primaryModel)
    } catch (err) {
      const isQuota =
        (err instanceof ApiError && err.isQuotaExceeded) ||
        (err instanceof Error &&
          (err.message === QUOTA_EXCEEDED_MESSAGE ||
            err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.toLowerCase().includes("quota")))

      if (isQuota && primaryModel !== GEMINI_FALLBACK_MODEL) {
        return await suggestPhotoWithGemini(request, trimmedKey, GEMINI_FALLBACK_MODEL)
      }
      throw err
    }
  }

  const fallbackModel =
    provider === "groq" ? "llama-3.3-70b-versatile" : "openrouter/auto"
  return await suggestPhotoWithOpenAICompatible(
    request,
    provider,
    trimmedKey,
    model || fallbackModel
  )
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
    // Do not retry on invalid API key
    if (err instanceof ApiError && err.status === 401) {
      throw err
    }
    return await callGeminiImageEdit(request, geminiKey, GEMINI_IMAGE_FALLBACK_MODEL)
  }
}

