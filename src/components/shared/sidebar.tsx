"use client"

import { useState } from "react"
import {
  ChevronRight,
  Globe,
  LogOut,
  Moon,
  Plus,
  Sun,
} from "lucide-react"
import { cn, triggerHaptic } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { t } from "@/locales/translations"
import { CCLogo } from "@/components/shared/cc-logo"
import { QuickIdeaDialog } from "@/components/shared/quick-idea-dialog"
import { SquircleIcon } from "@/components/shared/squircle-icon"
import { getRoomForPageKey, WORKSPACE_ROOMS, type WorkspaceRoom } from "@/components/shared/rooms"
import { useUIStore, type UIState } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/sonner"

interface RoomNavButtonProps {
  room: WorkspaceRoom
  language: "en" | "my"
  active: boolean
  onSelect: (defaultPageKey: string) => void
  collapsed: boolean
}

function RoomNavButton({ room, language, active, onSelect, collapsed }: RoomNavButtonProps) {
  const label = language === "my" ? room.titleMy : room.titleEn

  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic(8)
        onSelect(room.defaultPageKey)
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] leading-relaxed font-myanmar cursor-pointer",
        active
          ? "bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B]"
          : "text-foreground/80 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      )}
      aria-pressed={active}
      title={collapsed ? label : undefined}
    >
      {collapsed ? (
        <span className="mx-auto">
          <SquircleIcon icon={room.icon} tone={room.tone} size="sm" active={active} />
        </span>
      ) : (
        <>
          <SquircleIcon icon={room.icon} tone={room.tone} size="sm" active={active} />
          <span className="flex-1 text-left truncate text-[13px] font-medium">{label}</span>
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
  const activeRoom = getRoomForPageKey(activePageKey)

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
          <div className="flex items-center gap-2.5 min-w-0">
            <CCLogo size={28} className="h-7 w-7 shrink-0 rounded-[9px] shadow-xs" />
            {!collapsed && (
              <span className="font-semibold text-sm tracking-tight leading-relaxed truncate">
                {t(language, "sidebar.title")}
              </span>
            )}
          </div>
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
          <nav className="flex flex-col gap-1.5 px-2.5 pt-3 pb-4">
            {WORKSPACE_ROOMS.map((room) => (
              <RoomNavButton
                key={room.id}
                room={room}
                language={language}
                active={activeRoom.id === room.id}
                onSelect={(key) => {
                  setActivePageKey(key)
                }}
                collapsed={collapsed}
              />
            ))}
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
                <span>{theme === "dark" ? "Light" : "Dark"}</span>
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
