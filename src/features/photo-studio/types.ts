export type PosterTemplateId =
  | "spotlight"
  | "flash_sale"
  | "before_after"
  | "review"

export type AspectRatioId = "1:1" | "4:5" | "9:16"

export type BrandThemeId =
  | "clean_white"
  | "midnight_dark"
  | "warm_gold"
  | "vibrant_coral"

export type SplitDirection = "side-by-side" | "top-bottom"

export type PosterFontStyle = "modern_clean" | "bold_promo"

export type ControlTabId =
  | "template"
  | "scene_bg"
  | "text_price"
  | "theme_color"
  | "shop_footer"

export interface BrandThemeConfig {
  id: BrandThemeId
  name: string
  nameMy: string
  bg: string
  bgSecondary: string
  surface: string
  text: string
  mutedText: string
  accent: string
  accentText: string
  badgeBg: string
  badgeText: string
  footerBg: string
  footerText: string
  border: string
  swatch: string
}

export const BRAND_THEMES: Record<BrandThemeId, BrandThemeConfig> = {
  clean_white: {
    id: "clean_white",
    name: "Clean White",
    nameMy: "အဖြူရောင် ရှင်းလင်း",
    bg: "#F8FAFC",
    bgSecondary: "#EEF2F6",
    surface: "#FFFFFF",
    text: "#0F172A",
    mutedText: "#475569",
    accent: "#0F172A",
    accentText: "#FFFFFF",
    badgeBg: "#E11D48",
    badgeText: "#FFFFFF",
    footerBg: "#0F172A",
    footerText: "#F8FAFC",
    border: "#E2E8F0",
    swatch: "#FFFFFF",
  },
  midnight_dark: {
    id: "midnight_dark",
    name: "Midnight Dark",
    nameMy: "အနက်ရောင် စမတ်",
    bg: "#090D16",
    bgSecondary: "#111827",
    surface: "#1E293B",
    text: "#F8FAFC",
    mutedText: "#94A3B8",
    accent: "#38BDF8",
    accentText: "#090D16",
    badgeBg: "#F43F5E",
    badgeText: "#FFFFFF",
    footerBg: "#020617",
    footerText: "#E2E8F0",
    border: "#334155",
    swatch: "#0F172A",
  },
  warm_gold: {
    id: "warm_gold",
    name: "Warm Gold",
    nameMy: "ရွှေရောင် နွေးထွေး",
    bg: "#FFFBEB",
    bgSecondary: "#FEF3C7",
    surface: "#FFFFFF",
    text: "#292524",
    mutedText: "#78716C",
    accent: "#B45309",
    accentText: "#FFFFFF",
    badgeBg: "#92400E",
    badgeText: "#FEF3C7",
    footerBg: "#292524",
    footerText: "#FEF3C7",
    border: "#FDE68A",
    swatch: "#D97706",
  },
  vibrant_coral: {
    id: "vibrant_coral",
    name: "Vibrant Coral",
    nameMy: "သန္တာရောင် တောက်ပ",
    bg: "#FFF1F2",
    bgSecondary: "#FFE4E6",
    surface: "#FFFFFF",
    text: "#1F2937",
    mutedText: "#6B7280",
    accent: "#E11D48",
    accentText: "#FFFFFF",
    badgeBg: "#BE123C",
    badgeText: "#FFFFFF",
    footerBg: "#881337",
    footerText: "#FFF1F2",
    border: "#FECDD3",
    swatch: "#F43F5E",
  },
}

export interface PosterState {
  template: PosterTemplateId
  aspectRatio: AspectRatioId
  theme: BrandThemeId
  title: string
  subtitle: string
  showPriceBadge: boolean
  priceTag: string
  originalPrice: string
  showNewArrivalPill: boolean
  pillBadgeText: string
  promoBadgeText: string
  splitDirection: SplitDirection
  beforeLabel: string
  afterLabel: string
  reviewQuote: string
  reviewerName: string
  showStarRating: boolean
  showShopFooter: boolean
  shopFooterText: string
  showShopLogo: boolean
  fontStyle: PosterFontStyle
  showCodBadge: boolean
  codBadgeText: string
}

