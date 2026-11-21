"use client"

import { useEffect, useRef, useState } from "react"
import { t } from "@/locales/translations"
import {
  useUIStore,
  DEFAULT_MODELS,
  isValidGeminiApiKey,
  type AIProvider,
} from "@/store/useUIStore"
import {
  useContentStore,
  type ContentBackupData,
  type MicFilterMode,
  type ShopProfile,
} from "@/store/useContentStore"
import {
  normalizeBusinessCategory,
} from "@/types"
import { useShallow } from "zustand/react/shallow"
import {
  Camera,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Globe,
  Link,
  LogOut,
  Mic,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sun,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { SquircleIcon } from "@/components/shared/squircle-icon"
import { cn, triggerHaptic } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"

const GEMINI_PRESET_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const

const PRESET_MODELS: Record<AIProvider, readonly string[]> = {
  gemini: GEMINI_PRESET_MODELS,
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
  ],
  openrouter: [
    "google/gemma-3-27b-it:free",
    "google/gemma-3-12b-it:free",
    "qwen/qwen2.5-vl-72b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "openrouter/free",
    "google/gemini-2.5-flash",
    "anthropic/claude-3.5-sonnet",
    "meta-llama/llama-3.1-405b-instruct",
  ],
}

const MODEL_LABELS: Record<string, string> = {
  "gemini-2.5-flash": "Gemini 2.5 Flash (Recommended)",
  "gemini-2.5-pro": "Gemini 2.5 Pro (စာရေးအား အကောင်းဆုံး)",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite (အမြန်ဆုံး / Quota သက်သာ)",
  "gemini-2.0-flash": "Gemini 2.0 Flash (အရန် / တည်ငြိမ်)",
  "google/gemma-3-27b-it:free": "Gemma 3 27B (Free - No VPN)",
  "qwen/qwen2.5-vl-72b-instruct:free": "Qwen 2.5 VL 72B (Free - Vision)",
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PROVIDER_INFO: Record<
  AIProvider,
  { label: string; shortLabel: string; link: string; linkLabel: string; placeholder: string }
> = {
  gemini: {
    label: "Google Gemini",
    shortLabel: "Gemini",
    link: "https://makersuite.google.com/app/apikey",
    linkLabel: "Get free Gemini API key",
    placeholder: "AIza... or AQ....",
  },
  groq: {
    label: "Groq",
    shortLabel: "Groq",
    link: "https://console.groq.com/keys",
    linkLabel: "Get free Groq API key",
    placeholder: "gsk_...",
  },
  openrouter: {
    label: "OpenRouter",
    shortLabel: "OpenRouter",
    link: "https://openrouter.ai/keys",
    linkLabel: "Get free OpenRouter API key",
    placeholder: "sk-or-v1-...",
  },
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const {
    language,
    setLanguage,
    theme,
    setTheme,
    user,
    signOut,
    aiProvider,
    apiKeys,
    models,
    setAIProvider,
    setProviderApiKey,
    setProviderModel,
    setActivePageKey,
  } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setLanguage: state.setLanguage,
      theme: state.theme,
      setTheme: state.setTheme,
      user: state.user,
      signOut: state.signOut,
      aiProvider: state.aiProvider,
      apiKeys: state.apiKeys,
      models: state.models,
      setAIProvider: state.setAIProvider,
      setProviderApiKey: state.setProviderApiKey,
      setProviderModel: state.setProviderModel,
      setActivePageKey: state.setActivePageKey,
    }))
  )

  const {
    brandSignature,
    businessCategory,
    customNiche,
    autoAppendShopCta,
    savedVault,
    generatedHistory,
    micFilterMode,
    liveModeEnabled,
    voiceDnaSamples,
    shopProfile,
    setMicFilterMode,
    setLiveModeEnabled,
    setVoiceDnaSamples,
    setShopProfile,
    importBackup,
  } = useContentStore(
    useShallow((state) => ({
      brandSignature: state.brandSignature,
      businessCategory: state.businessCategory,
      customNiche: state.customNiche,
      autoAppendShopCta: state.autoAppendShopCta,
      savedVault: state.savedVault,
      generatedHistory: state.generatedHistory,
      micFilterMode: state.micFilterMode,
      liveModeEnabled: state.liveModeEnabled,
      voiceDnaSamples: state.voiceDnaSamples,
      shopProfile: state.shopProfile,
      setMicFilterMode: state.setMicFilterMode,
      setLiveModeEnabled: state.setLiveModeEnabled,
      setVoiceDnaSamples: state.setVoiceDnaSamples,
      setShopProfile: state.setShopProfile,
      importBackup: state.importBackup,
    }))
  )

  // Group 1: API & Model state
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(aiProvider)
  const [geminiKeyInput, setGeminiKeyInput] = useState(apiKeys.gemini ?? "")
  const [geminiModelInput, setGeminiModelInput] = useState(
    models.gemini || DEFAULT_MODELS.gemini
  )
  const [geminiCustomMode, setGeminiCustomMode] = useState(false)
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState(apiKeys.openrouter ?? "")
  const [openrouterModelInput, setOpenrouterModelInput] = useState(
    models.openrouter || DEFAULT_MODELS.openrouter
  )
  const [groqKeyInput, setGroqKeyInput] = useState(apiKeys.groq ?? "")
  const [groqModelInput, setGroqModelInput] = useState(
    models.groq || DEFAULT_MODELS.groq
  )
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showAdvancedApi, setShowAdvancedApi] = useState(false)

  // Group 2: Studio Preferences state
  const [micModeInput, setMicModeInput] = useState<MicFilterMode>(micFilterMode)
  const [liveModeInput, setLiveModeInput] = useState<boolean>(liveModeEnabled)

  // Group 3: Brand & Voice DNA state
  const [dnaSamplesInput, setDnaSamplesInput] = useState<string[]>(voiceDnaSamples)
  const [shopProfileInput, setShopProfileInput] = useState<ShopProfile>(shopProfile)

  const [loading, setLoading] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      const initialGeminiModel = models.gemini || DEFAULT_MODELS.gemini
      const isGeminiCustom =
        !GEMINI_PRESET_MODELS.includes(
          initialGeminiModel as (typeof GEMINI_PRESET_MODELS)[number]
        ) && Boolean(initialGeminiModel)

      setSelectedProvider(aiProvider)
      setGeminiKeyInput(apiKeys.gemini ?? "")
      setGeminiModelInput(initialGeminiModel)
      setGeminiCustomMode(isGeminiCustom)
      setOpenrouterKeyInput(apiKeys.openrouter ?? "")
      setOpenrouterModelInput(models.openrouter || DEFAULT_MODELS.openrouter)
      setGroqKeyInput(apiKeys.groq ?? "")
      setGroqModelInput(models.groq || DEFAULT_MODELS.groq)
      setShowGeminiKey(false)
      setShowAdvancedApi(aiProvider !== "gemini" || isGeminiCustom)
      setMicModeInput(micFilterMode)
      setLiveModeInput(liveModeEnabled)
      setDnaSamplesInput(
        voiceDnaSamples.length > 0 ? [...voiceDnaSamples] : ["", "", ""]
      )
      setShopProfileInput({ ...shopProfile })
    }
    // Re-sync local form state only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
      onOpenChange(false)
      toast.success(t(language, "auth.signOutSuccess"))
    }
  }

  const handleGeminiModelSelect = (val: string) => {
    if (val === "custom") {
      setGeminiCustomMode(true)
      setShowAdvancedApi(true)
    } else {
      setGeminiCustomMode(false)
      setGeminiModelInput(val)
    }
  }

  const isGeminiPreset = GEMINI_PRESET_MODELS.includes(
    geminiModelInput as (typeof GEMINI_PRESET_MODELS)[number]
  )
  const selectedGeminiModelValue =
    geminiCustomMode || !isGeminiPreset ? "custom" : geminiModelInput

  const visibleDnaCount = Math.min(
    3,
    Math.max(1, dnaSamplesInput.filter((s) => s.trim().length > 0).length + 1)
  )

  const handleDnaSampleChange = (idx: number, val: string) => {
    const next = [...dnaSamplesInput]
    while (next.length <= idx) next.push("")
    next[idx] = val
    setDnaSamplesInput(next.slice(0, 3))
  }

  const handleExportBackup = () => {
    const payload: ContentBackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      brandSignature,
      businessCategory,
      customNiche,
      autoAppendShopCta,
      savedVault,
      generatedHistory,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const dateStamp = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `content-creator-backup-${dateStamp}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(t(language, "settings.exportSuccess"))
  }

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as ContentBackupData
      const hasValidField =
        typeof parsed === "object" &&
        parsed !== null &&
        (typeof parsed.brandSignature === "string" ||
          Array.isArray(parsed.savedVault) ||
          Array.isArray(parsed.generatedHistory))

      if (!hasValidField) {
        toast.error(t(language, "settings.restoreError"))
        return
      }

      importBackup({
        ...parsed,
        businessCategory: parsed.businessCategory
          ? normalizeBusinessCategory(parsed.businessCategory)
          : undefined,
      })
      toast.success(t(language, "settings.restoreSuccess"))
    } catch {
      toast.error(t(language, "settings.restoreError"))
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleCheckForUpdate = async () => {
    setCheckingUpdate(true)
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          registrations.map(async (registration) => {
            try {
              await registration.update()
            } catch {
              // Proceed to unregister even if update check fails offline
            }
            await registration.unregister()
          })
        )
      }
      if ("caches" in window) {
        const cacheKeys = await caches.keys()
        await Promise.all(cacheKeys.map((key) => caches.delete(key)))
      }
      toast.success(t(language, "settings.updateReloading"))
      setTimeout(() => {
        window.location.reload()
      }, 400)
    } catch {
      setCheckingUpdate(false)
      window.location.reload()
    }
  }

  const handleSaveSettings = () => {
    const trimmedGeminiKey = geminiKeyInput.trim()
    if (trimmedGeminiKey && !isValidGeminiApiKey(trimmedGeminiKey)) {
      toast.error(t(language, "settings.invalidGeminiKey"))
      return
    }

    const normalizedGeminiModel = geminiModelInput.trim() || DEFAULT_MODELS.gemini
    const normalizedOpenrouterModel =
      openrouterModelInput.trim() || DEFAULT_MODELS.openrouter
    const normalizedGroqModel = groqModelInput.trim() || DEFAULT_MODELS.groq

    setAIProvider(selectedProvider)
    setProviderApiKey("gemini", trimmedGeminiKey)
    setProviderModel("gemini", normalizedGeminiModel)
    setProviderApiKey("openrouter", openrouterKeyInput.trim())
    setProviderModel("openrouter", normalizedOpenrouterModel)
    setProviderApiKey("groq", groqKeyInput.trim())
    setProviderModel("groq", normalizedGroqModel)

    setMicFilterMode(micModeInput)
    setLiveModeEnabled(liveModeInput)
    setVoiceDnaSamples(dnaSamplesInput)
    setShopProfile({
      name: shopProfileInput.name.trim(),
      phone: shopProfileInput.phone.trim(),
      address: shopProfileInput.address.trim(),
      autoAppend: shopProfileInput.autoAppend,
    })

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      toast.success(t(language, "settings.saveSuccess"))
      onOpenChange(false)
    }, 350)
  }

  const isGeminiSaved = Boolean(apiKeys.gemini?.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46] p-5 sm:p-6">
        <div className="flex items-center gap-3 pr-8">
          <SquircleIcon icon={Settings} tone="slate" size="md" />
          <div className="min-w-0">
            <DialogTitle className="text-base sm:text-lg font-semibold text-[#1C1917] dark:text-[#F5F5F4]">
              {t(language, "settings.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#57534E] dark:text-[#A1A1AA]">
              {t(language, "settings.description")}
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-5 pt-2">
          {/* 1. API & Model */}
          <section className="space-y-4">
            <h3 className="px-1 text-xs font-semibold tracking-wide text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "settings.groupApi")}
            </h3>

            <div className="rounded-[20px] border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] p-4 space-y-4">
              {/* Primary Gemini API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="api-key-gemini"
                      className="text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4]"
                    >
                      Gemini API Key
                    </label>
                    {isGeminiSaved && (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        {t(language, "settings.savedBadge")}
                      </span>
                    )}
                  </div>
                  <a
                    href={PROVIDER_INFO.gemini.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#57534E] dark:text-[#A1A1AA] underline underline-offset-4 hover:text-[#1C1917] dark:hover:text-[#F5F5F4]"
                  >
                    <Link className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
                    <span>{PROVIDER_INFO.gemini.linkLabel}</span>
                  </a>
                </div>

                <div className="flex items-center gap-1.5">
                  <Input
                    id="api-key-gemini"
                    type={showGeminiKey ? "text" : "password"}
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder={`${t(language, "settings.apiKeyPlaceholder")} (${PROVIDER_INFO.gemini.placeholder})`}
                    disabled={loading}
                    className="rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46]"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowGeminiKey((prev) => !prev)}
                    aria-label={showGeminiKey ? "Hide Gemini key" : "Show Gemini key"}
                    className="shrink-0 rounded-xl"
                  >
                    {showGeminiKey ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Primary Model Selector */}
              <div className="space-y-2 pt-3 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80">
                <label
                  htmlFor="gemini-model-select"
                  className="text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4]"
                >
                  {t(language, "settings.model")}
                </label>
                <Select
                  id="gemini-model-select"
                  value={selectedGeminiModelValue}
                  onChange={(e) =>
                    handleGeminiModelSelect((e.target as HTMLSelectElement).value)
                  }
                  className="rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46]"
                >
                  {GEMINI_PRESET_MODELS.map((preset) => (
                    <option key={preset} value={preset}>
                      {MODEL_LABELS[preset] ?? preset}
                    </option>
                  ))}
                  <option value="custom">{t(language, "settings.customModelOption")}</option>
                </Select>
              </div>

              {/* Collapsible Advanced Accordion */}
              <div className="pt-2 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80">
                <button
                  type="button"
                  onClick={() => setShowAdvancedApi((prev) => !prev)}
                  aria-expanded={showAdvancedApi}
                  className="flex w-full items-center justify-between py-1 text-xs font-medium text-[#57534E] dark:text-[#A1A1AA] hover:text-[#1C1917] dark:hover:text-[#F5F5F4] transition-colors cursor-pointer font-myanmar"
                >
                  <span>{t(language, "settings.advancedApi")}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      showAdvancedApi && "rotate-180"
                    )}
                  />
                </button>

                {showAdvancedApi && (
                  <div className="mt-3 space-y-4 pt-3 border-t border-[#E7E5E4]/60 dark:border-[#3F3F46]/60">
                    {/* Custom Gemini Model ID */}
                    {(geminiCustomMode || !isGeminiPreset) && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="custom-gemini-model"
                          className="text-xs font-medium text-[#57534E] dark:text-[#A1A1AA]"
                        >
                          Custom Gemini Model ID
                        </label>
                        <Input
                          id="custom-gemini-model"
                          type="text"
                          value={geminiModelInput}
                          onChange={(e) => setGeminiModelInput(e.target.value)}
                          placeholder="e.g. gemini-2.5-flash"
                          className="h-9 rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] text-xs"
                        />
                      </div>
                    )}

                    {/* Active Provider Switcher */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="active-provider-select"
                        className="text-xs font-medium text-[#57534E] dark:text-[#A1A1AA]"
                      >
                        {t(language, "settings.aiProvider")}
                      </label>
                      <Select
                        id="active-provider-select"
                        value={selectedProvider}
                        onChange={(e) =>
                          setSelectedProvider(
                            (e.target as HTMLSelectElement).value as AIProvider
                          )
                        }
                        className="h-9 rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] text-xs"
                      >
                        <option value="gemini">Google Gemini (Default)</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="groq">Groq</option>
                      </Select>
                    </div>

                    {/* Fallback Keys: OpenRouter & Groq */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="api-key-openrouter"
                            className="text-xs font-medium text-[#57534E] dark:text-[#A1A1AA]"
                          >
                            OpenRouter API Key (Fallback)
                          </label>
                          <a
                            href={PROVIDER_INFO.openrouter.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] underline underline-offset-2"
                          >
                            Get key
                          </a>
                        </div>
                        <Input
                          id="api-key-openrouter"
                          type="password"
                          value={openrouterKeyInput}
                          onChange={(e) => setOpenrouterKeyInput(e.target.value)}
                          placeholder={PROVIDER_INFO.openrouter.placeholder}
                          className="h-9 rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] text-xs"
                        />
                        {selectedProvider === "openrouter" && (
                          <Select
                            value={
                              PRESET_MODELS.openrouter.includes(openrouterModelInput)
                                ? openrouterModelInput
                                : "custom"
                            }
                            onChange={(e) => {
                              const v = (e.target as HTMLSelectElement).value
                              if (v !== "custom") setOpenrouterModelInput(v)
                            }}
                            className="h-9 rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] text-xs mt-1.5"
                          >
                            {PRESET_MODELS.openrouter.map((m) => (
                              <option key={m} value={m}>
                                {MODEL_LABELS[m] ?? m}
                              </option>
                            ))}
                          </Select>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="api-key-groq"
                            className="text-xs font-medium text-[#57534E] dark:text-[#A1A1AA]"
                          >
                            Groq API Key (Fallback)
                          </label>
                          <a
                            href={PROVIDER_INFO.groq.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] underline underline-offset-2"
                          >
                            Get key
                          </a>
                        </div>
                        <Input
                          id="api-key-groq"
                          type="password"
                          value={groqKeyInput}
                          onChange={(e) => setGroqKeyInput(e.target.value)}
                          placeholder={PROVIDER_INFO.groq.placeholder}
                          className="h-9 rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] text-xs"
                        />
                        {selectedProvider === "groq" && (
                          <Select
                            value={
                              PRESET_MODELS.groq.includes(groqModelInput)
                                ? groqModelInput
                                : "custom"
                            }
                            onChange={(e) => {
                              const v = (e.target as HTMLSelectElement).value
                              if (v !== "custom") setGroqModelInput(v)
                            }}
                            className="h-9 rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] text-xs mt-1.5"
                          >
                            {PRESET_MODELS.groq.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </Select>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-[11px] text-[#57534E] dark:text-[#A1A1AA]">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{t(language, "settings.apiKeyStored")}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 2. Studio Preferences */}
          <section className="space-y-4">
            <h3 className="px-1 text-xs font-semibold tracking-wide text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "settings.groupPreferences")}
            </h3>

            <div className="rounded-[20px] border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] p-4 space-y-4">
              {/* Appearance (Light / Dark Mode) */}
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                    {t(language, "settings.appearance")}
                  </p>
                  <p className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                    {theme === "dark" ? t(language, "settings.themeDark") : t(language, "settings.themeLight")}
                  </p>
                </div>

                <div className="inline-flex rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (theme !== "light") {
                        triggerHaptic(8)
                        setTheme("light")
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer",
                      theme === "light"
                        ? "bg-white text-[#1C1917] shadow-2xs"
                        : "text-[#A1A1AA] hover:text-[#F5F5F4]"
                    )}
                  >
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (theme !== "dark") {
                        triggerHaptic(8)
                        setTheme("dark")
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer",
                      theme === "dark"
                        ? "bg-[#27272A] text-[#F5F5F4] shadow-2xs"
                        : "text-[#57534E] hover:text-[#1C1917]"
                    )}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    <span>Dark</span>
                  </button>
                </div>
              </div>

              {/* Mic Clarity (Studio Raw / Light Filter) */}
              <div className="pt-3 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-[#57534E] dark:text-[#A1A1AA]" />
                  <p className="text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                    {t(language, "settings.micClarity")}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: "raw",
                        title: t(language, "booth.micRaw"),
                        sub: t(language, "booth.micRawSub"),
                      },
                      {
                        id: "light",
                        title: t(language, "booth.micLight"),
                        sub: t(language, "booth.micLightSub"),
                      },
                    ] as const
                  ).map((opt) => {
                    const active = micModeInput === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic(6)
                          setMicModeInput(opt.id)
                        }}
                        className={cn(
                          "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all cursor-pointer",
                          active
                            ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#FAF8F5] dark:bg-[#18181B]"
                            : "border-[#E7E5E4] dark:border-[#3F3F46] bg-transparent hover:bg-[#FAF8F5]/60 dark:hover:bg-[#18181B]/60"
                        )}
                      >
                        <span className="text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4]">
                          {opt.title}
                        </span>
                        <span className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                          {opt.sub}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Live Mode Toggle & Quick Studio Launchers */}
              <div className="pt-3 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80 space-y-2.5">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Radio className="h-4 w-4 text-[#E11D48] shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                        {t(language, "settings.liveModeLabel")}
                      </p>
                      <p className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                        {t(language, "settings.liveModeDesc")}
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={liveModeInput}
                    onChange={(e) => {
                      triggerHaptic(6)
                      const next = e.target.checked
                      setLiveModeInput(next)
                      setLiveModeEnabled(next)
                    }}
                    className="h-4 w-4 shrink-0 accent-[#1C1917] dark:accent-[#F5F5F4]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      triggerHaptic(8)
                      setLiveModeInput(true)
                      setLiveModeEnabled(true)
                      setActivePageKey("voiceover")
                      onOpenChange(false)
                    }}
                    className="h-8 rounded-xl text-xs font-medium gap-1.5 bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46] font-myanmar"
                  >
                    <Radio className="h-3.5 w-3.5 text-[#E11D48]" />
                    <span className="truncate">{t(language, "settings.openLiveBooth")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      triggerHaptic(8)
                      setActivePageKey("studio")
                      onOpenChange(false)
                    }}
                    className="h-8 rounded-xl text-xs font-medium gap-1.5 bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46] font-myanmar"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span className="truncate">{t(language, "settings.openPhotoStudio")}</span>
                  </Button>
                </div>
              </div>

              {/* Language Row */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[#57534E] dark:text-[#A1A1AA]" />
                  <span className="text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                    {t(language, "settings.languageLabel")}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    triggerHaptic(8)
                    setLanguage(language === "en" ? "my" : "en")
                  }}
                  className="h-8 rounded-xl text-xs font-medium bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46]"
                >
                  {language === "en" ? "EN (English)" : "MY (မြန်မာ)"}
                </Button>
              </div>
            </div>
          </section>

          {/* 3. Brand & Voice DNA */}
          <section className="space-y-4">
            <h3 className="px-1 text-xs font-semibold tracking-wide text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "settings.groupBrand")}
            </h3>

            <div className="rounded-[20px] border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] p-4 space-y-4">
              {/* Personal Voice DNA Samples */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                    {t(language, "settings.dnaTitle")}
                  </p>
                  <span className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                    {t(language, "settings.dnaCount")}
                  </span>
                </div>

                <div className="space-y-2">
                  {Array.from({ length: visibleDnaCount }).map((_, idx) => {
                    const val = dnaSamplesInput[idx] ?? ""
                    return (
                      <div key={idx} className="relative">
                        <Textarea
                          value={val}
                          onChange={(e) => handleDnaSampleChange(idx, e.target.value)}
                          rows={2}
                          placeholder={t(language, "settings.dnaSamplePlaceholder", {
                            num: String(idx + 1),
                          })}
                          className="min-h-[68px] resize-y rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46] pr-9 text-xs leading-relaxed font-myanmar"
                          disabled={loading}
                        />
                        {val.trim().length > 0 && (
                          <button
                            type="button"
                            aria-label="Clear sample"
                            onClick={() => handleDnaSampleChange(idx, "")}
                            className="absolute right-2.5 top-2 rounded-md p-1 text-[#57534E] hover:text-[#1C1917] dark:text-[#A1A1AA] dark:hover:text-[#F5F5F4] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {visibleDnaCount < 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...dnaSamplesInput]
                        while (next.length < visibleDnaCount + 1) next.push("")
                        setDnaSamplesInput(next)
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#57534E] hover:text-[#1C1917] dark:text-[#A1A1AA] dark:hover:text-[#F5F5F4] cursor-pointer font-myanmar"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{t(language, "settings.dnaAddSample")}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Shop / Page Contact Footer */}
              <div className="space-y-2.5 pt-3 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80">
                <p className="text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                  {t(language, "settings.shopFooterTitle")}
                </p>

                <div className="space-y-2">
                  <Input
                    value={shopProfileInput.name}
                    onChange={(e) =>
                      setShopProfileInput((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder={t(language, "settings.shopNamePlaceholder")}
                    className="h-9 rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46] text-xs sm:text-sm font-myanmar"
                    disabled={loading}
                  />
                  <Input
                    value={shopProfileInput.phone}
                    onChange={(e) =>
                      setShopProfileInput((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder={t(language, "settings.shopPhonePlaceholder")}
                    className="h-9 rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46] text-xs sm:text-sm"
                    disabled={loading}
                  />
                  <Textarea
                    value={shopProfileInput.address}
                    onChange={(e) =>
                      setShopProfileInput((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                    rows={2}
                    placeholder={t(language, "settings.shopAddressPlaceholder")}
                    className="min-h-[60px] rounded-xl bg-[#FAF8F5] dark:bg-[#18181B] border-[#E7E5E4] dark:border-[#3F3F46] text-xs sm:text-sm font-myanmar"
                    disabled={loading}
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] px-3 py-2.5">
                  <span className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                    {t(language, "settings.autoAppendFooter")}
                  </span>
                  <input
                    type="checkbox"
                    checked={shopProfileInput.autoAppend}
                    onChange={(e) =>
                      setShopProfileInput((prev) => ({
                        ...prev,
                        autoAppend: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[#1C1917] dark:accent-[#F5F5F4]"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Compact Utility Row (Backup, Update, Account) */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1 text-xs text-[#57534E] dark:text-[#A1A1AA]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={loading}
                className="inline-flex items-center gap-1 hover:text-[#1C1917] dark:hover:text-[#F5F5F4] cursor-pointer font-myanmar"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{t(language, "settings.backupBtn")}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="inline-flex items-center gap-1 hover:text-[#1C1917] dark:hover:text-[#F5F5F4] cursor-pointer font-myanmar"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{t(language, "settings.restoreBtn")}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreFile}
                className="hidden"
                aria-label={t(language, "settings.restoreBackup")}
              />
              <button
                type="button"
                onClick={handleCheckForUpdate}
                disabled={loading || checkingUpdate}
                className="inline-flex items-center gap-1 hover:text-[#1C1917] dark:hover:text-[#F5F5F4] cursor-pointer font-myanmar"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", checkingUpdate && "animate-spin")} />
                <span>{checkingUpdate ? t(language, "settings.updatingBtn") : t(language, "settings.updateBtn")}</span>
              </button>
            </div>

            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={loggingOut}
                className="inline-flex items-center gap-1 text-destructive hover:opacity-80 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t(language, "header.signOut")}</span>
              </button>
            )}
          </div>

          {/* Primary Footer Actions */}
          <div className="flex gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-xl border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A]"
            >
              {t(language, "settings.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSaveSettings}
              disabled={loading}
              className="flex-1 rounded-xl bg-[#1C1917] hover:bg-[#292524] dark:bg-[#F5F5F4] dark:hover:bg-[#E7E5E4] text-[#FAF8F5] dark:text-[#18181B] font-medium"
            >
              {loading ? t(language, "settings.saveSaving") : t(language, "settings.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
