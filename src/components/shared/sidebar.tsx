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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet"
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
  onSelect: (defaultPageKey: string, isMobile: boolean) => void
  collapsed: boolean
}

function RoomNavButton({ room, language, active, onSelect, collapsed }: RoomNavButtonProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768
  const label = language === "my" ? room.titleMy : room.titleEn

  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic(8)
        onSelect(room.defaultPageKey, isMobile)
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] leading-relaxed font-myanmar cursor-pointer",
        active
          ? "bg-[#007AFF] dark:bg-[#0A84FF] text-white shadow-sm shadow-[#007AFF]/20"
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

interface SidebarProps {
  mobileOpen: boolean
  onMobileToggle: (open: boolean) => void
}

export function Sidebar({ mobileOpen, onMobileToggle }: SidebarProps) {
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
      onMobileToggle(false)
      toast.success(t(language, "auth.signOutSuccess"))
    }
  }

  return (
    <>
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-30 flex-col border-r-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] bg-white/80 dark:bg-black/80 ios-glass transition-[width] duration-200"
        style={{ width: collapsed ? 68 : 248 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] px-3">
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
                onSelect={(key, isMobile) => {
                  setActivePageKey(key)
                  if (isMobile) {
                    onMobileToggle(false)
                  }
                }}
                collapsed={collapsed}
              />
            ))}
          </nav>
        </ScrollArea>

        <div className="px-2.5 pt-2.5 pb-3 space-y-2 border-t-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] bg-white/60 dark:bg-[#1C1C1E]/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickIdeaOpen(true)}
            className={cn(
              "w-full h-9 text-xs font-medium border-[#007AFF]/25 bg-[#007AFF]/10 text-[#007AFF] dark:text-[#0A84FF] hover:bg-[#007AFF]/15",
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

      <Sheet
        open={mobileOpen}
        onOpenChange={onMobileToggle}
        side="left"
        className="md:hidden w-[295px] max-w-[85vw] z-50"
      >
        <SheetContent className="w-full p-0 border-b-0 flex flex-col justify-between">
          <div className="flex-1 min-h-0 flex flex-col">
            <SheetHeader className="relative flex flex-col items-start gap-1 text-left pr-10 pt-4 pb-4 px-4 border-b-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] shrink-0">
              <div className="flex items-center gap-2.5">
                <CCLogo size={28} className="h-7 w-7 shrink-0 rounded-[9px] shadow-xs" />
                <SheetTitle className="text-base leading-tight">
                  {t(language, "sidebar.mobile_nav_title")}
                </SheetTitle>
              </div>
              <SheetDescription className="text-xs leading-snug truncate max-w-full">
                {t(language, "sidebar.mobile_nav_description")}
              </SheetDescription>
              <SheetClose
                type="button"
                onClick={() => onMobileToggle(false)}
                aria-label={t(language, "sidebar.close_menu_label")}
                className="absolute right-3 top-3.5"
              />
            </SheetHeader>

            <ScrollArea className="flex-1">
              <nav className="flex flex-col gap-1.5 px-3 py-4">
                {WORKSPACE_ROOMS.map((room) => (
                  <RoomNavButton
                    key={room.id}
                    room={room}
                    language={language}
                    active={activeRoom.id === room.id}
                    onSelect={(key) => {
                      setActivePageKey(key)
                      onMobileToggle(false)
                    }}
                    collapsed={false}
                  />
                ))}
              </nav>
            </ScrollArea>
          </div>

          <div className="px-3 py-3 pb-safe border-t-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] space-y-2 shrink-0 bg-white/75 dark:bg-[#1C1C1E]/85 ios-glass">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onMobileToggle(false)
                setQuickIdeaOpen(true)
              }}
              className="w-full h-9 text-xs font-medium border-[#007AFF]/25 bg-[#007AFF]/10 text-[#007AFF] dark:text-[#0A84FF] hover:bg-[#007AFF]/15 gap-1.5"
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>{t(language, "header.quickIdea")}</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLanguage(language === "en" ? "my" : "en")}
                className="flex-1 h-9 text-xs font-medium gap-1.5"
                aria-label="Toggle language"
              >
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>{language === "en" ? "EN" : "MY"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="flex-1 h-9 text-xs font-medium gap-1.5"
                aria-label="Toggle dark mode"
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="h-4 w-4 text-amber-500 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span>Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span>Dark</span>
                  </>
                )}
              </Button>
            </div>

            {user && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                disabled={loggingOut}
                className="w-full h-9 text-xs font-medium text-muted-foreground hover:text-destructive gap-1.5"
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>{t(language, "header.signOut")}</span>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <QuickIdeaDialog open={quickIdeaOpen} onOpenChange={setQuickIdeaOpen} />
    </>
  )
}
