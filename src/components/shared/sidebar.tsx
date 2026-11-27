"use client"

import { useState } from "react"
import {
  ChevronRight,
  FolderKanban,
  Globe,
  Home,
  LogOut,
  Moon,
  Plus,
  Sun,
  type LucideIcon,
} from "lucide-react"
import { cn, triggerHaptic } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { t } from "@/locales/translations"
import { CCLogo } from "@/components/shared/cc-logo"
import { QuickIdeaDialog } from "@/components/shared/quick-idea-dialog"
import { SquircleIcon, type SquircleTone } from "@/components/shared/squircle-icon"
import { STUDIO_TOOLS, type ToolBadgeKind } from "@/components/shared/rooms"
import { useUIStore, type UIState } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { useShallow } from "zustand/react/shallow"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/sonner"

interface SidebarNavItemProps {
  icon: LucideIcon
  tone: SquircleTone
  label: string
  active: boolean
  onSelect: () => void
  collapsed: boolean
  badge?: ToolBadgeKind
  language: "en" | "my"
  bgIndicator?: { current: number; total: number } | boolean
}

function SidebarNavItem({
  icon,
  tone,
  label,
  active,
  onSelect,
  collapsed,
  badge,
  language,
  bgIndicator,
}: SidebarNavItemProps) {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic(8)
        onSelect()
      }}
      className={cn(
        "relative flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] leading-relaxed font-myanmar cursor-pointer",
        active
          ? "bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B]"
          : "text-foreground/80 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      )}
      aria-pressed={active}
      title={collapsed ? label : undefined}
    >
      {collapsed ? (
        <span className="relative mx-auto">
          <SquircleIcon icon={icon} tone={tone} size="sm" active={active} />
          {bgIndicator && (
            <span
              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-[#FAF8F5] dark:ring-[#18181B] animate-pulse"
              aria-label="Voiceover generating in background"
            />
          )}
        </span>
      ) : (
        <>
          <SquircleIcon icon={icon} tone={tone} size="sm" active={active} />
          <span className="flex-1 text-left truncate text-[13px] font-medium">{label}</span>
          {bgIndicator ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-300 shrink-0"
              aria-label="Voiceover generating in background"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              {typeof bgIndicator === "object" && bgIndicator.total > 1 && (
                <span>
                  {bgIndicator.current}/{bgIndicator.total}
                </span>
              )}
            </span>
          ) : badge ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none shrink-0",
                active
                  ? "bg-white/15 text-[#FAF8F5] dark:bg-black/15 dark:text-[#18181B]"
                  : badge === "instant"
                    ? "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                    : "bg-stone-500/10 text-stone-600 dark:bg-zinc-400/15 dark:text-zinc-300"
              )}
            >
              {t(language, badge === "instant" ? "home.badge.instant" : "home.badge.noApi")}
            </span>
          ) : null}
        </>
      )}
    </button>
  )
}

export function Sidebar() {
  const [hovered, setHovered] = useState(false)
  const [quickIdeaOpen, setQuickIdeaOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const sidebarSelector = useShallow((state: UIState) => ({
    sidebarCollapsed: state.sidebarCollapsed,
    activePageKey: state.activePageKey,
    setSidebarCollapsed: state.setSidebarCollapsed,
    setActivePageKey: state.setActivePageKey,
    language: state.language,
    setLanguage: state.setLanguage,
    theme: state.theme,
    toggleTheme: state.toggleTheme,
    user: state.user,
    signOut: state.signOut,
  }))
  const {
    sidebarCollapsed,
    activePageKey,
    setSidebarCollapsed,
    setActivePageKey,
    language,
    setLanguage,
    theme,
    toggleTheme,
    user,
    signOut,
  } = useUIStore(sidebarSelector)

  const collapsed = sidebarCollapsed && !hovered

  const { ttsStatus, ttsProgress } = useContentStore(
    useShallow((state) => ({
      ttsStatus: state.ttsStatus,
      ttsProgress: state.ttsProgress,
    }))
  )
  const isBgTtsActive =
    (ttsStatus === "preparing" || ttsStatus === "generating") && activePageKey !== "voiceover"

  const handleSignOut = async () => {
    setLoggingOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (err: unknown) {
      console.error("Sign out error", err)
    } finally {
      signOut()
      setLoggingOut(false)
      toast.success(t(language, "auth.signOutSuccess"))
    }
  }

  return (
    <>
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-30 flex-col border-r border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5]/95 dark:bg-[#18181B]/95 ios-glass transition-[width] duration-200"
        style={{ width: collapsed ? 68 : 248 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-[#E7E5E4] dark:border-[#3F3F46] px-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8)
              setActivePageKey("home")
            }}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer"
          >
            <CCLogo size={28} className="h-7 w-7 shrink-0 rounded-[9px] shadow-xs" />
            {!collapsed && (
              <span className="font-semibold text-sm tracking-tight leading-relaxed truncate">
                {t(language, "sidebar.title")}
              </span>
            )}
          </button>
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={t(language, "sidebar.collapse_label")}
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform duration-200", {
                  "rotate-180": !sidebarCollapsed,
                })}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1">
          <nav className="flex flex-col gap-1 px-2.5 pt-3 pb-4">
            {/* Home / Dashboard */}
            <SidebarNavItem
              icon={Home}
              tone="slate"
              label={t(language, "rooms.home.title")}
              active={activePageKey === "home"}
              onSelect={() => setActivePageKey("home")}
              collapsed={collapsed}
              language={language}
            />

            <div className="my-1.5 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80" />

            {/* Prioritized 5 Studio Tools — Instant Zero-API Tools First */}
            {STUDIO_TOOLS.map((tool) => (
              <SidebarNavItem
                key={tool.id}
                icon={tool.icon}
                tone={tool.tone}
                label={t(language, tool.shortTitleKey)}
                active={tool.matchPageKeys.includes(activePageKey)}
                onSelect={() => setActivePageKey(tool.pageKey)}
                collapsed={collapsed}
                badge={tool.badges?.[0]}
                language={language}
                bgIndicator={
                  tool.id === "voiceover" && isBgTtsActive
                    ? ttsProgress ?? true
                    : undefined
                }
              />
            ))}

            <div className="my-1.5 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80" />

            {/* Vault & Calendar */}
            <SidebarNavItem
              icon={FolderKanban}
              tone="slate"
              label={t(language, "rooms.vault.title")}
              active={activePageKey === "vault"}
              onSelect={() => setActivePageKey("vault")}
              collapsed={collapsed}
              language={language}
            />
          </nav>
        </ScrollArea>

        <div className="px-2.5 pt-2.5 pb-3 space-y-2 border-t border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickIdeaOpen(true)}
            className={cn(
              "w-full h-9 text-xs font-medium border-[#E7E5E4] dark:border-[#3F3F46] bg-[#F5F2ED] dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] dark:hover:bg-[#3F3F46]",
              collapsed ? "px-0 justify-center" : "gap-1.5"
            )}
            title={t(language, "header.quickIdea")}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            {!collapsed && <span>{t(language, "header.quickIdea")}</span>}
          </Button>

          {!collapsed && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLanguage(language === "en" ? "my" : "en")}
                className="flex-1 h-8 text-xs gap-1"
                aria-label="Toggle language"
              >
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>{language === "en" ? "EN" : "MY"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="flex-1 h-8 text-xs gap-1"
                aria-label="Toggle dark mode"
              >
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5 text-amber-500 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Moon className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>{theme === "dark" ? t(language, "settings.lightBtn") : t(language, "settings.darkBtn")}</span>
              </Button>
            </div>
          )}

          {user && !collapsed && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              disabled={loggingOut}
              className="w-full h-8 text-xs text-muted-foreground hover:text-destructive gap-1.5 justify-start px-2.5"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{t(language, "header.signOut")}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {!collapsed && <span className="mr-1.5">{t(language, "nav.collapse")}</span>}
            <ChevronRight
              className={cn("h-4 w-4 transition-transform duration-200", {
                "rotate-180": !sidebarCollapsed,
              })}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Button>
        </div>
      </aside>

      <QuickIdeaDialog open={quickIdeaOpen} onOpenChange={setQuickIdeaOpen} />
    </>
  )
}
