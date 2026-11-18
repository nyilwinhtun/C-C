"use client"

import { useState } from "react"
import {
  Camera,
  ChevronRight,
  FileText,
  FolderKanban,
  Globe,
  Mic,
  Moon,
  Sun,
  Video,
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
import { useUIStore, type UIState } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import type { NavItem } from "@/types"

interface NavLinkProps {
  item: NavItem
  active: boolean
  onSelect: (key: string, isMobile: boolean) => void
  collapsed: boolean
}

function NavLink({ item, active, onSelect, collapsed }: NavLinkProps) {
  const Icon = item.icon
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768
  return (
    <button
      onClick={() => {
        onSelect(item.key, isMobile)
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium transition-all duration-150 leading-relaxed",
        active
          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/70"
      )}
      aria-pressed={active}
    >
      <Icon
        size={18}
        className={cn("h-[18px] w-[18px] shrink-0", collapsed ? "mx-auto" : "")}
        aria-hidden="true"
      />
      {!collapsed && <span className="flex-1 text-left truncate">{item.title}</span>}
    </button>
  )
}

const navigation: NavItem[] = [
  {
    key: "text",
    title: "Text Post",
    url: "/",
    icon: FileText,
  },
  {
    key: "video",
    title: "Video Script",
    url: "/video",
    icon: Video,
  },
  {
    key: "voiceover",
    title: "AI Voiceover",
    url: "/voiceover",
    icon: Mic,
  },
  {
    key: "studio",
    title: "Photo Studio",
    url: "/studio",
    icon: Camera,
  },
  {
    key: "vault",
    title: "Vault & Calendar",
    url: "/vault",
    icon: FolderKanban,
  },
]

interface SidebarProps {
  mobileOpen: boolean
  onMobileToggle: (open: boolean) => void
}

export function Sidebar({ mobileOpen, onMobileToggle }: SidebarProps) {
  const [hovered, setHovered] = useState(false)
  const sidebarSelector = useShallow((state: UIState) => ({
    sidebarCollapsed: state.sidebarCollapsed,
    activePageKey: state.activePageKey,
    setSidebarCollapsed: state.setSidebarCollapsed,
    setActivePageKey: state.setActivePageKey,
    language: state.language,
    setLanguage: state.setLanguage,
    theme: state.theme,
    toggleTheme: state.toggleTheme,
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
  } = useUIStore(sidebarSelector)

  const collapsed = sidebarCollapsed && !hovered

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
          <nav className="flex flex-col gap-1 px-2.5 pt-3">
            {navigation.map((item) => (
              <NavLink
                key={item.key}
                item={{ ...item, title: t(language, `nav.${item.key}`) }}
                active={activePageKey === item.key}
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
        <div className="px-2.5 pt-2.5 pb-4">
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
        className="md:hidden w-[280px] max-w-[82vw] z-50 border-r border-border/60"
      >
        <SheetContent className="w-full p-0 border-b-0 justify-between">
          <div>
            <SheetHeader className="relative flex flex-col items-start gap-1 text-left pr-10 pt-4 pb-4 px-4 border-b border-border/60">
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
            <nav className="flex flex-col gap-1 px-3 py-4">
              {navigation.map((item) => (
                <NavLink
                  key={item.key}
                  item={{ ...item, title: t(language, `nav.${item.key}`) }}
                  active={activePageKey === item.key}
                  onSelect={(key) => {
                    setActivePageKey(key)
                    onMobileToggle(false)
                  }}
                  collapsed={false}
                />
              ))}
            </nav>
          </div>
          <div className="px-3 py-3 border-t border-border/60 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLanguage(language === "en" ? "my" : "en")}
              className="flex-1 h-9 text-xs font-medium border-border/60 gap-1.5"
              aria-label="Toggle language"
            >
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <span>{language === "en" ? "English" : "မြန်မာ"}</span>
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
        </SheetContent>
      </Sheet>
    </>
  )
}

