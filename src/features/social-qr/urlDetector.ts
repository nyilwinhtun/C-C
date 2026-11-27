import type {
  DetectedLinkInfo,
  PlatformBrandTheme,
  SocialPlatformId,
} from "./types"

export const PLATFORM_THEMES: Record<SocialPlatformId, PlatformBrandTheme> = {
  facebook: {
    id: "facebook",
    labelEn: "Facebook",
    labelMy: "Facebook",
    headerTextEn: "Visit our Facebook Page",
    headerTextMy: "Facebook Page ကို ဝင်ကြည့်ပါ",
    ctaDefaultEn: "Scan with Camera to Open",
    ctaDefaultMy: "ဖုန်းကင်မရာဖြင့် Scan ဖတ်ပြီး ဖွင့်ပါ",
    gradientStart: "#1877F2",
    gradientEnd: "#0C4A9E",
    accent: "#1877F2",
    qrColor: "#0F3D82",
    badgeBg: "#EBF3FF",
    badgeText: "#0C4A9E",
  },
  tiktok: {
    id: "tiktok",
    labelEn: "TikTok",
    labelMy: "TikTok",
    headerTextEn: "Follow us on TikTok",
    headerTextMy: "TikTok မှာ Follow လုပ်ပါ",
    ctaDefaultEn: "Follow for Daily Deals",
    ctaDefaultMy: "နေ့စဉ်ပရိုမိုးရှင်းများအတွက် Follow လုပ်ပါ",
    gradientStart: "#111114",
    gradientEnd: "#25F4EE",
    accent: "#FE2C55",
    qrColor: "#111114",
    badgeBg: "#FFF0F3",
    badgeText: "#D91B42",
  },
  instagram: {
    id: "instagram",
    labelEn: "Instagram",
    labelMy: "Instagram",
    headerTextEn: "Follow us on Instagram",
    headerTextMy: "Instagram မှာ Follow လုပ်ပါ",
    ctaDefaultEn: "Scan with Camera to Open",
    ctaDefaultMy: "ဖုန်းကင်မရာဖြင့် Scan ဖတ်ပြီး ဖွင့်ပါ",
    gradientStart: "#833AB4",
    gradientEnd: "#FD1D1D",
    accent: "#E1306C",
    qrColor: "#6B1D5C",
    badgeBg: "#FDF2F8",
    badgeText: "#BE185D",
  },
  telegram: {
    id: "telegram",
    labelEn: "Telegram",
    labelMy: "Telegram",
    headerTextEn: "Chat on Telegram",
    headerTextMy: "Telegram မှတစ်ဆင့် စကားပြောပါ",
    ctaDefaultEn: "Scan to Order / Chat",
    ctaDefaultMy: "မှာယူရန် / စကားပြောရန် Scan ဖတ်ပါ",
    gradientStart: "#2AABEE",
    gradientEnd: "#1778B5",
    accent: "#229ED9",
    qrColor: "#115C8B",
    badgeBg: "#E0F2FE",
    badgeText: "#0369A1",
  },
  viber: {
    id: "viber",
    labelEn: "Viber",
    labelMy: "Viber",
    headerTextEn: "Chat on Viber",
    headerTextMy: "Viber မှတစ်ဆင့် ဆက်သွယ်ပါ",
    ctaDefaultEn: "Scan to Order / Chat",
    ctaDefaultMy: "မှာယူရန် / စကားပြောရန် Scan ဖတ်ပါ",
    gradientStart: "#7360F2",
    gradientEnd: "#4E38C7",
    accent: "#7360F2",
    qrColor: "#4A36B8",
    badgeBg: "#F3F0FF",
    badgeText: "#5B44D6",
  },
  whatsapp: {
    id: "whatsapp",
    labelEn: "WhatsApp",
    labelMy: "WhatsApp",
    headerTextEn: "Message us on WhatsApp",
    headerTextMy: "WhatsApp မှတစ်ဆင့် ဆက်သွယ်ပါ",
    ctaDefaultEn: "Scan to Order / Chat",
    ctaDefaultMy: "မှာယူရန် / စကားပြောရန် Scan ဖတ်ပါ",
    gradientStart: "#25D366",
    gradientEnd: "#128C7E",
    accent: "#16A34A",
    qrColor: "#0D6832",
    badgeBg: "#DCFCE7",
    badgeText: "#15803D",
  },
  youtube: {
    id: "youtube",
    labelEn: "YouTube",
    labelMy: "YouTube",
    headerTextEn: "Watch on YouTube",
    headerTextMy: "YouTube မှာ ကြည့်ရှုပါ",
    ctaDefaultEn: "Scan with Camera to Open",
    ctaDefaultMy: "ဖုန်းကင်မရာဖြင့် Scan ဖတ်ပြီး ဖွင့်ပါ",
    gradientStart: "#FF0000",
    gradientEnd: "#990000",
    accent: "#DC2626",
    qrColor: "#8A0E0E",
    badgeBg: "#FEE2E2",
    badgeText: "#B91C1C",
  },
  phone: {
    id: "phone",
    labelEn: "Phone Call",
    labelMy: "ဖုန်းခေါ်ဆိုရန်",
    headerTextEn: "Call our Shop Directly",
    headerTextMy: "ဆိုင်သို့ တိုက်ရိုက်ဖုန်းဆက်ပါ",
    ctaDefaultEn: "Scan to Call Now",
    ctaDefaultMy: "ဖုန်းခေါ်ရန် Scan ဖတ်ပါ",
    gradientStart: "#059669",
    gradientEnd: "#047857",
    accent: "#10B981",
    qrColor: "#065F46",
    badgeBg: "#D1FAE5",
    badgeText: "#047857",
  },
  maps: {
    id: "maps",
    labelEn: "Google Maps",
    labelMy: "Google Maps",
    headerTextEn: "Find our Shop Location",
    headerTextMy: "ဆိုင်တည်နေရာကို မြေပုံမှာ ကြည့်ပါ",
    ctaDefaultEn: "Scan for Directions",
    ctaDefaultMy: "လမ်းညွှန်ကြည့်ရန် Scan ဖတ်ပါ",
    gradientStart: "#0F9D58",
    gradientEnd: "#1A73E8",
    accent: "#1A73E8",
    qrColor: "#0F5132",
    badgeBg: "#E6F4EA",
    badgeText: "#137333",
  },
  website: {
    id: "website",
    labelEn: "Website",
    labelMy: "ဝဘ်ဆိုဒ်",
    headerTextEn: "Visit our Website",
    headerTextMy: "ကျွန်ုပ်တို့၏ ဝဘ်ဆိုဒ်သို့ ဝင်ကြည့်ပါ",
    ctaDefaultEn: "Scan with Camera to Open",
    ctaDefaultMy: "ဖုန်းကင်မရာဖြင့် Scan ဖတ်ပြီး ဖွင့်ပါ",
    gradientStart: "#1E293B",
    gradientEnd: "#0F172A",
    accent: "#334155",
    qrColor: "#0F172A",
    badgeBg: "#F1F5F9",
    badgeText: "#1E293B",
  },
}

const TRACKING_PARAM_EXACT = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "twclid",
  "igshid",
  "igsh",
  "si",
  "_t",
  "_r",
  "is_from_webapp",
  "sender_device",
  "sender_web_id",
  "mibextid",
  "sfnsn",
  "rdid",
  "share_url",
  "share_id",
  "mc_cid",
  "mc_eid",
  "ref_src",
  "ref_url",
  "s",
  "spm",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "__tn__",
  "__cft__[0]",
])

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase()
  if (lower.startsWith("utm_")) return true
  if (lower.startsWith("__cft__")) return true
  return TRACKING_PARAM_EXACT.has(lower)
}

export function detectPlatformFromUrl(url: URL): SocialPlatformId {
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const path = url.pathname.toLowerCase()

  if (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.com" ||
    host === "fb.watch" ||
    host === "m.me"
  ) {
    return "facebook"
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return "tiktok"
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am") {
    return "instagram"
  }
  if (host === "t.me" || host === "telegram.me" || host === "telegram.org") {
    return "telegram"
  }
  if (host === "viber.com" || host.endsWith(".viber.com")) {
    return "viber"
  }
  if (host === "wa.me" || host === "whatsapp.com" || host.endsWith(".whatsapp.com")) {
    return "whatsapp"
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    return "youtube"
  }
  if (
    host === "maps.app.goo.gl" ||
    host === "maps.google.com" ||
    host === "goo.gl" && path.startsWith("/maps") ||
    (host.endsWith("google.com") && path.startsWith("/maps"))
  ) {
    return "maps"
  }
  return "website"
}

export function extractHandleFromUrl(url: URL, platform: SocialPlatformId): string {
  const segments = url.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)

  if (platform === "tiktok") {
    const atSeg = segments.find((s) => s.startsWith("@"))
    if (atSeg) return atSeg
  }

  if (platform === "instagram" || platform === "telegram" || platform === "facebook") {
    const first = segments[0]
    if (
      first &&
      ![
        "p",
        "reel",
        "reels",
        "stories",
        "watch",
        "share",
        "profile.php",
        "groups",
        "events",
        "s",
        "joinchat",
      ].includes(first.toLowerCase())
    ) {
      return first.startsWith("@") ? first : `@${first}`
    }
  }

  if (platform === "youtube") {
    const atSeg = segments.find((s) => s.startsWith("@"))
    if (atSeg) return atSeg
  }

  if (platform === "whatsapp") {
    const first = segments[0]
    if (first && /^\+?\d{6,}$/.test(first)) {
      return first.startsWith("+") ? first : `+${first}`
    }
  }

  const host = url.hostname.replace(/^www\./, "")
  return host
}

export function analyzeSocialUrl(
  rawInput: string,
  cleanTrackingParams: boolean
): DetectedLinkInfo {
  const trimmed = rawInput.trim()
  if (!trimmed) {
    return {
      platform: PLATFORM_THEMES.website,
      rawUrl: "",
      normalizedUrl: "",
      cleanUrl: "",
      finalUrl: "",
      strippedParamsCount: 0,
      extractedHandle: "",
      isValid: false,
    }
  }

  // Handle tel: links and raw phone numbers (e.g. 09123456789 or +959123456789)
  const phoneDigits = trimmed.replace(/[\s\-()]/g, "")
  if (/^tel:/i.test(trimmed) || /^\+?\d{6,15}$/.test(phoneDigits)) {
    const cleanedNum = phoneDigits.replace(/^tel:/i, "")
    const telUrl = `tel:${cleanedNum}`
    return {
      platform: PLATFORM_THEMES.phone,
      rawUrl: trimmed,
      normalizedUrl: telUrl,
      cleanUrl: telUrl,
      finalUrl: telUrl,
      strippedParamsCount: 0,
      extractedHandle: cleanedNum,
      isValid: cleanedNum.length >= 6,
    }
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(withProtocol)
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      throw new Error("Invalid hostname")
    }

    const platformId = detectPlatformFromUrl(parsed)
    const platform = PLATFORM_THEMES[platformId]
    const normalizedUrl = parsed.toString()

    const cleanParsed = new URL(parsed.toString())
    let strippedParamsCount = 0

    const keysToDelete: string[] = []
    cleanParsed.searchParams.forEach((_val, key) => {
      if (isTrackingParam(key)) {
        keysToDelete.push(key)
      }
    })

    for (const key of keysToDelete) {
      cleanParsed.searchParams.delete(key)
      strippedParamsCount += 1
    }

    const cleanUrl = cleanParsed.toString()
    const finalUrl = cleanTrackingParams ? cleanUrl : normalizedUrl
    const extractedHandle = extractHandleFromUrl(cleanParsed, platformId)

    return {
      platform,
      rawUrl: trimmed,
      normalizedUrl,
      cleanUrl,
      finalUrl,
      strippedParamsCount,
      extractedHandle,
      isValid: true,
    }
  } catch {
    return {
      platform: PLATFORM_THEMES.website,
      rawUrl: trimmed,
      normalizedUrl: trimmed,
      cleanUrl: trimmed,
      finalUrl: trimmed,
      strippedParamsCount: 0,
      extractedHandle: "",
      isValid: false,
    }
  }
}
