"use client"

import { useEffect } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUIStore, type UIState } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"

export function ThemeToggle() {
  const themeToggleSelector = useShallow((state: UIState) => ({
    theme: state.theme,
    toggleTheme: state.toggleTheme,
  }))
  const { theme, toggleTheme } = useUIStore(themeToggleSelector)

  useEffect(() => {
    document.documentElement.classList.remove("dark")
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    }
  }, [theme])

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </Button>
  )
}