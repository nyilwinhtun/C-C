"use client"

import { useEffect, useState } from "react"
import { Download, Share, PlusSquare, X, Smartphone, Check, MonitorDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CCLogo } from "@/components/shared/cc-logo"
import { useUIStore } from "@/store/useUIStore"
import { t } from "@/locales/translations"
import { cn } from "@/lib/utils"

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
  prompt(): Promise<void>
}

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

const STORAGE_KEY = "cc_pwa_banner_dismissed"

export function PWAInstallBanner() {
  const language = useUIStore((state) => state.language)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(true)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [showFallbackTip, setShowFallbackTip] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return

    // 1. Check if app is already running in standalone PWA mode
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://")

    setIsStandalone(standalone)
    if (standalone) {
      return
    }

    // 2. Check if user previously dismissed the banner (unless test query param is set)
    const forceTest = new URLSearchParams(window.location.search).has("pwa-test")
    let wasDismissed = false
    try {
      wasDismissed = !forceTest && localStorage.getItem(STORAGE_KEY) === "true"
    } catch {
      // Ignore localStorage read failures
    }

    // 3. Detect iOS Safari (iPhone / iPad / iPod)
    const ua = window.navigator.userAgent.toLowerCase()
    const isIOSDevice =
      (/iphone|ipad|ipod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
      !(window as Window & { MSStream?: unknown }).MSStream

    if (isIOSDevice) {
      setIsIOS(true)
    }

    if (!wasDismissed) {
      setVisible(true)
    }

    // 4. Read early-captured beforeinstallprompt and listen for future events
    if (window.__deferredInstallPrompt) {
      setDeferredPrompt(window.__deferredInstallPrompt)
      setShowFallbackTip(false)
    }

    const handlePromptReady = () => {
      if (window.__deferredInstallPrompt) {
        setDeferredPrompt(window.__deferredInstallPrompt)
        setShowFallbackTip(false)
        if (!wasDismissed) {
          setVisible(true)
        }
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      const promptEvent = e as BeforeInstallPromptEvent
      window.__deferredInstallPrompt = promptEvent
      setDeferredPrompt(promptEvent)
      setShowFallbackTip(false)
      if (!wasDismissed) {
        setVisible(true)
      }
    }

    const handleAppInstalled = () => {
      window.__deferredInstallPrompt = null
      setVisible(false)
      setIsStandalone(true)
      setDeferredPrompt(null)
    }

    window.addEventListener("pwa-prompt-ready", handlePromptReady)
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("pwa-prompt-ready", handlePromptReady)
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true")
    } catch {
      // Ignore localStorage write failures
    }
    setVisible(false)
    setShowFallbackTip(false)
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowFallbackTip(true)
      return
    }
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      if (choiceResult.outcome === "accepted") {
        setVisible(false)
      }
    } catch (err) {
      console.error("Install prompt error:", err)
    } finally {
      setInstalling(false)
      setDeferredPrompt(null)
      window.__deferredInstallPrompt = null
    }
  }

  if (isStandalone || !visible) return null

  return (
    <aside
      aria-label={t(language, "pwa.installTitle")}
      className={cn(
        "fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50",
        "rounded-[22px] border-[0.5px] border-[rgba(60,60,67,0.16)] dark:border-[rgba(84,84,88,0.42)] bg-white/90 dark:bg-[#1C1C1E]/90 ios-glass p-4 shadow-2xl text-card-foreground",
        "animate-in fade-in slide-in-from-bottom-5 duration-300"
      )}
    >
      {/* Header bar */}
      <div className="flex items-start gap-3">
        <CCLogo size={40} className="h-10 w-10 shrink-0 rounded-xl shadow-md ring-1 ring-border/60" />

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground leading-tight">
              {t(language, "pwa.installTitle")}
            </h3>
            <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              PWA
            </span>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5 leading-snug">
            {t(language, "pwa.installSubtitle")}
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors"
          aria-label={t(language, "sidebar.close_menu_label")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* iOS Step-by-Step Instructions */}
      {isIOS ? (
        <div className="mt-3 space-y-2.5 pt-2 border-t border-border/60">
          <div className="rounded-xl bg-accent/40 border border-accent p-3 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Smartphone className="h-4 w-4 text-primary shrink-0" />
              <span>{t(language, "pwa.iosTitle")}</span>
            </div>

            <ol className="space-y-1.5 text-muted-foreground pl-0.5">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                  1
                </span>
                <span className="pt-0.5 leading-relaxed">
                  {t(language, "pwa.iosStep1")}{" "}
                  <Share className="inline h-3.5 w-3.5 text-primary align-text-bottom mx-0.5" />
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                  2
                </span>
                <span className="pt-0.5 leading-relaxed">
                  {t(language, "pwa.iosStep2")}{" "}
                  <PlusSquare className="inline h-3.5 w-3.5 text-primary align-text-bottom mx-0.5" />
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                  3
                </span>
                <span className="pt-0.5 leading-relaxed">
                  {t(language, "pwa.iosStep3")}
                </span>
              </li>
            </ol>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="h-8 text-xs px-3"
            >
              {t(language, "pwa.laterBtn")}
            </Button>
            <Button
              size="sm"
              onClick={handleDismiss}
              className="h-8 text-xs px-3.5 font-medium flex items-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{t(language, "pwa.gotIt")}</span>
            </Button>
          </div>
        </div>
      ) : (
        /* Android / Chrome / Edge Native Prompt + Desktop Fallback */
        <div className="mt-3 pt-2 border-t border-border/60">
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            {t(language, "pwa.installDesc")}
          </p>

          {showFallbackTip && !deferredPrompt && (
            <div className="mb-3 rounded-xl bg-accent/50 border border-accent p-2.5 text-xs text-foreground flex items-start gap-2">
              <MonitorDown className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <p>
                  {language === "my"
                    ? "ဘရောက်ဇာ လိပ်စာဘားရှိ Install ခလုတ် (⊕) သို့မဟုတ် မီနူးမှ \"Install Content Creator\" ကို နှိပ်၍ ထည့်သွင်းနိုင်ပါသည်။"
                    : "Click the install icon (⊕) in your browser's address bar or open the browser menu and select \"Install Content Creator\"."}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="h-8 text-xs px-3"
            >
              {t(language, "pwa.laterBtn")}
            </Button>
            <Button
              size="sm"
              onClick={handleInstallClick}
              disabled={installing}
              className="h-8 text-xs px-3.5 font-medium flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" />
              <span>
                {installing
                  ? t(language, "pwa.installing")
                  : t(language, "pwa.installApp")}
              </span>
            </Button>
          </div>
        </div>
      )}
    </aside>
  )
}
