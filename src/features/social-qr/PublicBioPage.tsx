import { useState } from "react"
import { Check, ExternalLink, Share2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BioPayload } from "./bioCodec"
import { PlatformIcon } from "./platformIcons"
import { PLATFORM_THEMES } from "./urlDetector"
import type { QrCardThemeId } from "./types"

interface PublicBioPageProps {
  payload: BioPayload
  logoDataUrl?: string | null
  shareUrl?: string
  embeddedPreview?: boolean
  onOpenStudio?: () => void
}

interface BioPageThemeStyle {
  pageBg: string
  cardSurface: string
  cardBorder: string
  cardText: string
  cardSubtext: string
  titleText: string
  taglineText: string
  badgeBg: string
  badgeText: string
  badgeRing: string
  shareBtn: string
  footerText: string
}

function getBioThemeStyle(themeId: QrCardThemeId): BioPageThemeStyle {
  switch (themeId) {
    case "midnight_gold":
      return {
        pageBg: "bg-gradient-to-b from-[#090D16] via-[#111827] to-[#0B0F19]",
        cardSurface: "bg-white/[0.06] hover:bg-white/[0.11] backdrop-blur-md",
        cardBorder: "border-[#D4AF37]/30 hover:border-[#D4AF37]/70",
        cardText: "text-slate-50",
        cardSubtext: "text-amber-200/75",
        titleText: "text-white",
        taglineText: "text-amber-200/80",
        badgeBg: "bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-600",
        badgeText: "text-zinc-950",
        badgeRing: "ring-4 ring-amber-400/25",
        shareBtn: "bg-[#D4AF37] text-zinc-950 hover:bg-[#e0bd4c]",
        footerText: "text-slate-400 hover:text-amber-300",
      }
    case "studio_white":
      return {
        pageBg: "bg-gradient-to-b from-[#FAF8F5] via-[#F4F1EA] to-[#ECE7DF]",
        cardSurface: "bg-white hover:bg-stone-50 shadow-sm hover:shadow-md",
        cardBorder: "border-stone-200/90 hover:border-stone-400",
        cardText: "text-stone-900",
        cardSubtext: "text-stone-500",
        titleText: "text-stone-900",
        taglineText: "text-stone-600",
        badgeBg: "bg-stone-900",
        badgeText: "text-stone-50",
        badgeRing: "ring-4 ring-stone-900/10",
        shareBtn: "bg-stone-900 text-stone-50 hover:bg-stone-800",
        footerText: "text-stone-500 hover:text-stone-900",
      }
    case "soft_coral":
      return {
        pageBg: "bg-gradient-to-br from-[#FB7185] via-[#F43F5E] to-[#F97316]",
        cardSurface: "bg-white/95 hover:bg-white shadow-sm hover:shadow-md",
        cardBorder: "border-white/50 hover:border-white",
        cardText: "text-rose-950",
        cardSubtext: "text-rose-700/80",
        titleText: "text-white",
        taglineText: "text-white/90",
        badgeBg: "bg-white",
        badgeText: "text-rose-600",
        badgeRing: "ring-4 ring-white/30",
        shareBtn: "bg-white text-rose-600 hover:bg-rose-50",
        footerText: "text-white/75 hover:text-white",
      }
    case "platform":
    default:
      return {
        pageBg: "bg-gradient-to-b from-[#0F172A] via-[#1E293B] to-[#0F172A]",
        cardSurface: "bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-md",
        cardBorder: "border-white/15 hover:border-white/35",
        cardText: "text-white",
        cardSubtext: "text-slate-300",
        titleText: "text-white",
        taglineText: "text-slate-300",
        badgeBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
        badgeText: "text-white",
        badgeRing: "ring-4 ring-blue-500/25",
        shareBtn: "bg-white text-slate-900 hover:bg-slate-100",
        footerText: "text-slate-400 hover:text-white",
      }
  }
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "S"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

function formatLinkSubtitle(url: string): string {
  if (url.startsWith("tel:")) {
    return url.slice(4)
  }
  try {
    const parsed = new URL(url)
    const cleanPath = parsed.pathname === "/" ? "" : parsed.pathname
    return `${parsed.hostname.replace(/^www\./, "")}${cleanPath}`
  } catch {
    return url
  }
}

export function PublicBioPage({
  payload,
  logoDataUrl,
  shareUrl,
  embeddedPreview = false,
  onOpenStudio,
}: PublicBioPageProps) {
  const [copied, setCopied] = useState(false)
  const style = getBioThemeStyle(payload.themeId)
  const displayTitle = payload.shopTitle.trim() || "THE BOYS MOBILE"
  const displayTagline = payload.tagline.trim()

  const handleShare = async () => {
    const targetUrl =
      shareUrl || (typeof window !== "undefined" ? window.location.href : "")
    if (!targetUrl) return

    if (!embeddedPreview && typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: displayTitle,
          text: displayTagline || displayTitle,
          url: targetUrl,
        })
        return
      } catch {
        // Fallback to clipboard copy if share sheet dismissed or unsupported
      }
    }

    try {
      await navigator.clipboard.writeText(targetUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
  }

  return (
    <div
      className={cn(
        style.pageBg,
        embeddedPreview
          ? "min-h-full w-full px-4 py-6"
          : "min-h-screen w-full px-4 py-8 sm:py-12",
        "flex flex-col items-center justify-between"
      )}
    >
      <div className="w-full max-w-md mx-auto flex flex-col items-center space-y-5">
        {/* Top Share Pill */}
        <div className="w-full flex justify-end">
          <button
            type="button"
            onClick={handleShare}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
              style.shareBtn
            )}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span>Share</span>
              </>
            )}
          </button>
        </div>

        {/* Shop Avatar / Logo Badge & Title */}
        <div className="flex flex-col items-center text-center space-y-3">
          {logoDataUrl ? (
            <img
              src={logoDataUrl}
              alt={displayTitle}
              className={cn(
                "h-20 w-20 rounded-full object-cover bg-white shadow-lg",
                style.badgeRing
              )}
            />
          ) : (
            <div
              className={cn(
                "h-20 w-20 rounded-full flex items-center justify-center text-2xl font-extrabold tracking-tight shadow-lg",
                style.badgeBg,
                style.badgeText,
                style.badgeRing
              )}
            >
              {getInitials(displayTitle)}
            </div>
          )}

          <div className="space-y-1">
            <h1
              className={cn(
                "text-xl sm:text-2xl font-extrabold tracking-tight",
                style.titleText
              )}
            >
              {displayTitle}
            </h1>
            {displayTagline && (
              <p className={cn("text-xs sm:text-sm max-w-xs mx-auto", style.taglineText)}>
                {displayTagline}
              </p>
            )}
          </div>
        </div>

        {/* Platform Action Cards */}
        <div className="w-full space-y-2.5 pt-1">
          {payload.links.length === 0 ? (
            <div
              className={cn(
                "rounded-2xl border p-6 text-center text-xs",
                style.cardSurface,
                style.cardBorder,
                style.cardSubtext
              )}
            >
              No active links added yet.
            </div>
          ) : (
            payload.links.map((item, idx) => {
              const platformTheme = PLATFORM_THEMES[item.platform] ?? PLATFORM_THEMES.website
              const label = item.label.trim() || platformTheme.labelEn
              const isPhone = item.platform === "phone" || item.url.startsWith("tel:")
              return (
                <a
                  key={`${item.platform}-${idx}`}
                  href={item.url}
                  target={isPhone ? undefined : "_blank"}
                  rel={isPhone ? undefined : "noopener noreferrer"}
                  className={cn(
                    "group flex items-center gap-3.5 w-full rounded-2xl border px-4 py-3.5 transition-all duration-200 active:scale-[0.98]",
                    style.cardSurface,
                    style.cardBorder
                  )}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm transition-transform group-hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${platformTheme.gradientStart}, ${platformTheme.gradientEnd})`,
                    }}
                  >
                    <PlatformIcon platform={item.platform} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className={cn("text-sm font-bold truncate", style.cardText)}>
                      {label}
                    </div>
                    <div className={cn("text-[11px] truncate", style.cardSubtext)}>
                      {formatLinkSubtitle(item.url)}
                    </div>
                  </div>
                  <ExternalLink
                    className={cn(
                      "h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity",
                      style.cardSubtext
                    )}
                  />
                </a>
              )
            })
          )}
        </div>
      </div>

      {/* Subtle Footer */}
      {!embeddedPreview && (
        <footer className="pt-8 pb-2 text-center">
          <button
            type="button"
            onClick={onOpenStudio}
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer",
              style.footerText
            )}
          >
            <Sparkles className="h-3 w-3" />
            <span>Open Content Creator Studio</span>
          </button>
        </footer>
      )}
    </div>
  )
}
