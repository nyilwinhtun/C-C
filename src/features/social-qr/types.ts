export type SocialPlatformId =
  | "facebook"
  | "tiktok"
  | "instagram"
  | "telegram"
  | "viber"
  | "whatsapp"
  | "youtube"
  | "phone"
  | "maps"
  | "website"

export type QrCardAspectRatio = "portrait" | "square"

export type QrCardThemeId =
  | "platform"
  | "midnight_gold"
  | "studio_white"
  | "soft_coral"

export type SocialQrStudioTab = "single_qr" | "bio_link"

export interface PlatformBrandTheme {
  id: SocialPlatformId
  labelEn: string
  labelMy: string
  headerTextEn: string
  headerTextMy: string
  ctaDefaultEn: string
  ctaDefaultMy: string
  gradientStart: string
  gradientEnd: string
  accent: string
  qrColor: string
  badgeBg: string
  badgeText: string
}

export interface DetectedLinkInfo {
  platform: PlatformBrandTheme
  rawUrl: string
  normalizedUrl: string
  cleanUrl: string
  finalUrl: string
  strippedParamsCount: number
  extractedHandle: string
  isValid: boolean
}

export interface SocialQrSettings {
  url: string
  cleanTrackingParams: boolean
  aspectRatio: QrCardAspectRatio
  themeId: QrCardThemeId
  headline: string
  handleText: string
  ctaText: string
  headerText: string
  useShopLogo: boolean
  customLogoDataUrl: string | null
  showCenterLogo: boolean
}

export interface BioLinkItem {
  id: string
  platform: SocialPlatformId
  label: string
  url: string
  enabled: boolean
}

export interface BioLinkSettings {
  shopTitle: string
  tagline: string
  themeId: QrCardThemeId
  links: BioLinkItem[]
  aspectRatio: QrCardAspectRatio
  ctaText: string
  useShopLogo: boolean
  customLogoDataUrl: string | null
  showCenterLogo: boolean
}
