"use client"

import { useState } from "react"
import { Calendar, ChevronRight, FolderKanban, LayoutList } from "lucide-react"
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
        "flex w-full items-center gap-3 rounded-lg border-transparent px-3 py-2 text-sm transition-colors leading-relaxed",
        active
          ? "bg-accent text-accent-foreground"
          : "text-foreground hover:bg-accent"
      )}
      aria-pressed={active}
    >
      <Icon
        size={20}
        className={cn("h-5 w-5 shrink-0", collapsed ? "mx-auto" : "")}
        aria-hidden="true"
      />
      {!collapsed && <span className="flex-1">{item.title}</span>}
    </button>
  )
}

const navigation: NavItem[] = [
  {
    key: "generator",
    title: "Generator",
    url: "/",
    icon: LayoutList,
  },
  {
    key: "vault",
    title: "Vault",
    url: "/vault",
    icon: FolderKanban,
  },
  {
    key: "planner",
    title: "Planner",
    url: "/planner",
    icon: Calendar,
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
  }))
  const {
    sidebarCollapsed,
    activePageKey,
    setSidebarCollapsed,
    setActivePageKey,
    language,
  } = useUIStore(sidebarSelector)

  const collapsed = sidebarCollapsed && !hovered

  return (
    <>
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-30 flex-col border-r bg-card"
        style={{ width: collapsed ? 64 : 240 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex h-12 items-center justify-between gap-2 border-b border-border px-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
              CC
            </div>
            {!collapsed && (
              <span className="font-semibold text-sm tracking-tight leading-relaxed truncate">
                {t(language, "sidebar.title")}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={t(language, "sidebar.collapse_label")}
          >
            <ChevronRight
              className={cn("h-4 w-5 transition-transform duration-200", {
                "rotate-90": collapsed,
              })}
              aria-hidden="true"
            />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <nav className="flex flex-col gap-1 px-2 pt-2">
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
        <Separator className="mx-2" />
        <div className="px-2 pt-2 pb-4">
          <Button variant="outline" className="w-full text-sm" onClick={() => setSidebarCollapsed(!collapsed)}>
            {t(language, "nav.collapse")} <ChevronRight className="h-4 w-5 ml-1 transition-transform duration-200" aria-hidden="true" />
          </Button>
        </div>
      </aside>

      {mobileOpen && (
        <Sheet open={mobileOpen} onOpenChange={onMobileToggle} className="border-l">
          <SheetContent className="w-[260px]">
            <SheetHeader className="pb-4 px-4">
              <SheetTitle>{t(language, "sidebar.mobile_nav_title")}</SheetTitle>
              <SheetDescription>{t(language, "sidebar.mobile_nav_description")}</SheetDescription>
              <SheetClose
                onClick={() => onMobileToggle(false)}
                aria-label={t(language, "sidebar.close_menu_label")}
              />
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4 py-4 border-b">
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
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

