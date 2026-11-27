"use client"

import { ArrowUpRight, FolderKanban, Zap } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { STUDIO_TOOLS, type ToolBadgeKind } from "@/components/shared/rooms"
import { SquircleIcon } from "@/components/shared/squircle-icon"
import { t } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { cn, triggerHaptic } from "@/lib/utils"

function ToolBadge({ kind, language }: { kind: ToolBadgeKind; language: "en" | "my" }) {
  const isInstant = kind === "instant"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-tight font-myanmar whitespace-nowrap",
        isInstant
          ? "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300 border border-emerald-500/20"
          : "bg-stone-500/10 text-stone-700 dark:bg-zinc-400/12 dark:text-zinc-300 border border-stone-500/15 dark:border-zinc-500/25"
      )}
    >
      {isInstant && <Zap className="h-2.5 w-2.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />}
      <span>{t(language, isInstant ? "home.badge.instant" : "home.badge.noApi")}</span>
    </span>
  )
}

export function HomePage() {
  const { language, setActivePageKey } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setActivePageKey: state.setActivePageKey,
    }))
  )

  const { ideasCount, scheduledCount, ttsStatus, ttsProgress } = useContentStore(
    useShallow((state) => ({
      ideasCount: state.savedVault.length,
      scheduledCount: state.savedVault.filter((item) => item.status === "scheduled").length,
      ttsStatus: state.ttsStatus,
      ttsProgress: state.ttsProgress,
    }))
  )

  const isBgTtsActive = ttsStatus === "preparing" || ttsStatus === "generating"

  const openTool = (pageKey: string) => {
    triggerHaptic(8)
    setActivePageKey(pageKey)
  }

  return (
    <div className="space-y-5 pb-2">
      {/* Compact Welcome Header */}
      <section className="flex flex-col gap-1 px-0.5">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-myanmar leading-snug">
          {t(language, "home.title")}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground font-myanmar leading-relaxed">
          {t(language, "home.subtitle")}
        </p>
      </section>

      {/* Prioritized Studio Tools Grid — Instant Zero-API Tools First */}
      <section aria-label={t(language, "home.toolsSectionLabel")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5">
          {STUDIO_TOOLS.map((tool) => {
            const hasBadges = tool.badges && tool.badges.length > 0
            const showAudioProgress = tool.id === "voiceover" && isBgTtsActive

            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => openTool(tool.pageKey)}
                className={cn(
                  "group relative flex flex-col justify-between text-left rounded-[18px] p-4 sm:p-4.5 border transition-all duration-150 cursor-pointer active:scale-[0.985]",
                  "bg-white/90 dark:bg-[#222227]/90 border-[#E7E5E4] dark:border-[#3F3F46]",
                  "hover:border-[#D6D3D1] dark:hover:border-[#52525B] hover:shadow-sm"
                )}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <SquircleIcon icon={tool.icon} tone={tool.tone} size="lg" />
                  <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
                    {hasBadges &&
                      tool.badges!.map((badge) => (
                        <ToolBadge key={badge} kind={badge} language={language} />
                      ))}
                    {showAudioProgress && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {ttsProgress && ttsProgress.total > 1
                          ? `${ttsProgress.current}/${ttsProgress.total}`
                          : t(language, "booth.generatingAudio")}
                      </span>
                    )}
                    <ArrowUpRight
                      className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div className="mt-3.5 space-y-1">
                  <h2 className="text-[15px] font-semibold tracking-tight text-foreground font-myanmar leading-snug">
                    {t(language, tool.titleKey)}
                  </h2>
                  <p className="text-xs text-muted-foreground font-myanmar leading-relaxed line-clamp-1">
                    {t(language, tool.descKey)}
                  </p>
                </div>
              </button>
            )
          })}

          {/* Vault & Calendar Workspace Card */}
          <button
            type="button"
            onClick={() => openTool("vault")}
            className={cn(
              "group relative flex flex-col justify-between text-left rounded-[18px] p-4 sm:p-4.5 border transition-all duration-150 cursor-pointer active:scale-[0.985]",
              "bg-[#F5F2ED]/70 dark:bg-[#222227]/60 border-[#E7E5E4] dark:border-[#3F3F46]",
              "hover:border-[#D6D3D1] dark:hover:border-[#52525B] hover:shadow-sm"
            )}
          >
            <div className="flex items-start justify-between gap-2.5">
              <SquircleIcon icon={FolderKanban} tone="slate" size="lg" />
              <div className="flex items-center gap-1.5">
                {ideasCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-black/[0.05] dark:bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {scheduledCount > 0
                      ? `${ideasCount} · ${scheduledCount} ${t(language, "planner.scheduled")}`
                      : t(language, "vault.savedCount", { count: String(ideasCount) })}
                  </span>
                )}
                <ArrowUpRight
                  className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>
            </div>

            <div className="mt-3.5 space-y-1">
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground font-myanmar leading-snug">
                {t(language, "home.tool.vault.title")}
              </h2>
              <p className="text-xs text-muted-foreground font-myanmar leading-relaxed line-clamp-1">
                {t(language, "home.tool.vault.desc")}
              </p>
            </div>
          </button>
        </div>
      </section>
    </div>
  )
}
