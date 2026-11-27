import type { QrCardThemeId, SocialPlatformId } from "./types"

export const PUBLIC_BIO_BASE_URL = "https://nyilwinhtun.github.io/C-C/"

export interface BioPayloadLink {
  platform: SocialPlatformId
  label: string
  url: string
}

export interface BioPayload {
  shopTitle: string
  tagline: string
  themeId: QrCardThemeId
  links: BioPayloadLink[]
}

const THEME_TO_CODE: Record<QrCardThemeId, string> = {
  platform: "p",
  midnight_gold: "m",
  studio_white: "w",
  soft_coral: "c",
}

const CODE_TO_THEME: Record<string, QrCardThemeId> = {
  p: "platform",
  m: "midnight_gold",
  w: "studio_white",
  c: "soft_coral",
}

const PLATFORM_TO_CODE: Record<SocialPlatformId, string> = {
  facebook: "f",
  tiktok: "t",
  instagram: "i",
  telegram: "g",
  viber: "v",
  whatsapp: "a",
  youtube: "y",
  phone: "n",
  maps: "m",
  website: "w",
}

const CODE_TO_PLATFORM: Record<string, SocialPlatformId> = {
  f: "facebook",
  t: "tiktok",
  i: "instagram",
  g: "telegram",
  v: "viber",
  a: "whatsapp",
  y: "youtube",
  n: "phone",
  m: "maps",
  w: "website",
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64Url(token: string): Uint8Array {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((token.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function compactUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (trimmed.startsWith("https://")) {
    return trimmed.slice("https://".length)
  }
  return trimmed
}

function expandUrl(compact: string): string | null {
  const trimmed = compact.trim()
  if (!trimmed) return null
  if (/^javascript:/i.test(trimmed) || /^data:/i.test(trimmed) || /^vbscript:/i.test(trimmed)) {
    return null
  }
  if (/^(https?:\/\/|tel:)/i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

/**
 * Encodes a BioPayload into a compact, URL-safe token with zero backend needed.
 * Tuple layout: [version=1, shopTitle, tagline, themeCode, [[platformCode, label, compactUrl], ...]]
 */
export function encodeBioPayload(payload: BioPayload): string {
  const tuple = [
    1,
    payload.shopTitle.trim(),
    payload.tagline.trim(),
    THEME_TO_CODE[payload.themeId] ?? "p",
    payload.links
      .filter((item) => item.url.trim().length > 0)
      .map((item) => [
        PLATFORM_TO_CODE[item.platform] ?? "w",
        item.label.trim(),
        compactUrl(item.url),
      ]),
  ]
  const json = JSON.stringify(tuple)
  const bytes = new TextEncoder().encode(json)
  return toBase64Url(bytes)
}

export function decodeBioPayload(token: string): BioPayload | null {
  if (!token || typeof token !== "string") return null
  try {
    const bytes = fromBase64Url(token.trim())
    const json = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed) || parsed[0] !== 1) return null

    const shopTitle = typeof parsed[1] === "string" ? parsed[1] : ""
    const tagline = typeof parsed[2] === "string" ? parsed[2] : ""
    const themeId = CODE_TO_THEME[String(parsed[3] ?? "p")] ?? "platform"
    const rawLinks = Array.isArray(parsed[4]) ? parsed[4] : []

    const links: BioPayloadLink[] = []
    for (const entry of rawLinks) {
      if (!Array.isArray(entry) || entry.length < 3) continue
      const platform = CODE_TO_PLATFORM[String(entry[0] ?? "w")] ?? "website"
      const label = typeof entry[1] === "string" ? entry[1] : ""
      const expanded = expandUrl(typeof entry[2] === "string" ? entry[2] : "")
      if (!expanded) continue
      links.push({
        platform,
        label,
        url: expanded,
      })
    }

    return {
      shopTitle,
      tagline,
      themeId,
      links,
    }
  } catch {
    return null
  }
}

export function buildBioShareUrl(
  payload: BioPayload,
  baseUrl: string = PUBLIC_BIO_BASE_URL
): string {
  const token = encodeBioPayload(payload)
  const cleanBase = baseUrl.split("?")[0].split("#")[0]
  return `${cleanBase}?bio=${token}`
}

export function buildLocalPreviewBioUrl(payload: BioPayload): string {
  if (typeof window === "undefined") {
    return buildBioShareUrl(payload)
  }
  const base = `${window.location.origin}${window.location.pathname}`
  return buildBioShareUrl(payload, base)
}

export function extractBioTokenFromLocation(): string | null {
  if (typeof window === "undefined") return null
  const searchParams = new URLSearchParams(window.location.search)
  const fromQuery = searchParams.get("bio")
  if (fromQuery) return fromQuery

  const hash = window.location.hash
  if (hash) {
    const cleanedHash = hash.replace(/^#\/?/, "")
    if (cleanedHash.startsWith("bio=")) {
      return decodeURIComponent(cleanedHash.slice(4))
    }
    const hashQueryIdx = cleanedHash.indexOf("?")
    if (hashQueryIdx >= 0) {
      const hashParams = new URLSearchParams(cleanedHash.slice(hashQueryIdx + 1))
      const fromHashParam = hashParams.get("bio")
      if (fromHashParam) return fromHashParam
    }
  }

  return null
}
