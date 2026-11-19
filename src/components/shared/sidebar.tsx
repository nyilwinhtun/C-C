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
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
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
  const Icon = room.icon
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768
  const label = language === "my" ? room.titleMy : room.titleEn

  return (
    <button
      type="button"
      onClick={() => onSelect(room.defaultPageKey, isMobile)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-all duration-150 leading-relaxed font-myanmar",
        active
          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/70"
      )}
      aria-pressed={active}
      title={collapsed ? `${room.emoji} ${label}` : undefined}
    >
      {collapsed ? (
        <Icon size={18} className="h-[18px] w-[18px] shrink-0 mx-auto" aria-hidden="true" />
      ) : (
        <>
          <span className="text-base leading-none shrink-0" aria-hidden="true">
            {room.emoji}
          </span>
          <span className="flex-1 text-left truncate">{label}</span>
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
        className="hidden md:flex fixed inset-y-0 left-0 z-30 flex-col border-r border-border/60 bg-card/95 backdrop-blur-sm transition-[width] duration-200"
        style={{ width: collapsed ? 64 : 240 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border/60 px-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CCLogo size={28} className="h-7 w-7 shrink-0 rounded-lg shadow-sm" />
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
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={t(language, "sidebar.collapse_label")}
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform duration-200", {
                  "rotate-180": !sidebarCollapsed,
                })}
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

        <Separator className="mx-2 bg-border/60" />
        <div className="px-2.5 pt-2.5 pb-3 space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickIdeaOpen(true)}
            className={cn(
              "w-full h-8 text-xs font-medium border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20",
              collapsed ? "px-0 justify-center" : "gap-1.5"
            )}
            title={t(language, "header.quickIdea")}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {!collapsed && <span>{t(language, "header.quickIdea")}</span>}
          </Button>

          {!collapsed && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLanguage(language === "en" ? "my" : "en")}
                className="flex-1 h-8 text-xs border-border/60 gap-1"
                aria-label="Toggle language"
              >
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                <span>{language === "en" ? "EN" : "MY"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="flex-1 h-8 text-xs border-border/60 gap-1"
                aria-label="Toggle dark mode"
              >
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                ) : (
                  <Moon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
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
              <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t(language, "header.signOut")}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs border-border/60 bg-background/60 hover:bg-accent/70"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {!collapsed && <span className="mr-1.5">{t(language, "nav.collapse")}</span>}
            <ChevronRight
              className={cn("h-4 w-4 transition-transform duration-200", {
                "rotate-180": !sidebarCollapsed,
              })}
              aria-hidden="true"
            />
          </Button>
        </div>
      </aside>

      <Sheet
        open={mobileOpen}
        onOpenChange={onMobileToggle}
        side="left"
        className="md:hidden w-[290px] max-w-[85vw] z-50 border-r border-border/60"
      >
        <SheetContent className="w-full p-0 border-b-0 flex flex-col justify-between">
          <div className="flex-1 min-h-0 flex flex-col">
            <SheetHeader className="relative flex flex-col items-start gap-1 text-left pr-10 pt-4 pb-4 px-4 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <CCLogo size={28} className="h-7 w-7 shrink-0 rounded-lg shadow-sm" />
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
                className="absolute right-3 top-3.5 p-2 rounded-lg text-foreground hover:bg-accent"
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

          <div className="px-3 py-3 border-t border-border/60 space-y-2 shrink-0 bg-muted/20">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onMobileToggle(false)
                setQuickIdeaOpen(true)
              }}
              className="w-full h-9 text-xs font-medium border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 gap-1.5"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t(language, "header.quickIdea")}</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLanguage(language === "en" ? "my" : "en")}
                className="flex-1 h-9 text-xs font-medium border-border/60 gap-1.5"
                aria-label="Toggle language"
              >
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <span>{language === "en" ? "EN" : "MY"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="flex-1 h-9 text-xs font-medium border-border/60 gap-1.5"
                aria-label="Toggle dark mode"
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
                    <span>Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
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
                className="w-full h-9 text-xs font-medium border-border/60 text-muted-foreground hover:text-destructive gap-1.5"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
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
