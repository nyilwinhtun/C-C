"use client"

import { useEffect, useRef, useState } from "react"
import { t } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore, type ContentBackupData } from "@/store/useContentStore"
import { useShallow } from "zustand/react/shallow"
import { Download, Eye, EyeOff, Link, ShieldAlert, Upload } from "lucide-react"
import { toast } from "@/components/ui/sonner"

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
import { Separator } from "@/components/ui/separator"

type AIProvider = "gemini" | "groq" | "openrouter"

const PRESET_MODELS: Record<AIProvider, string[]> = {
  gemini: [
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
  ],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
  ],
  openrouter: [
    "openrouter/auto",
    "anthropic/claude-3.5-sonnet",
    "meta-llama/llama-3.1-405b-instruct",
  ],
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PROVIDER_INFO: Record<
  AIProvider,
  { label: string; link: string; linkLabel: string }
> = {
  gemini: {
    label: "Google Gemini",
    link: "https://makersuite.google.com/app/apikey",
    linkLabel: "Get free Gemini API key",
  },
  groq: {
    label: "Groq",
    link: "https://console.groq.com/keys",
    linkLabel: "Get free Groq API key",
  },
  openrouter: {
    label: "OpenRouter",
    link: "https://openrouter.ai/keys",
    linkLabel: "Get free OpenRouter API key",
  },
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const {
    language,
    aiProvider,
    geminiApiKey,
    openrouterApiKey,
    groqApiKey,
    aiModel,
    setAIProvider,
    setGeminiApiKey,
    setOpenrouterApiKey,
    setGroqApiKey,
    setAIModel,
  } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      aiProvider: state.aiProvider,
      geminiApiKey: state.geminiApiKey,
      openrouterApiKey: state.openrouterApiKey,
      groqApiKey: state.groqApiKey,
      aiModel: state.aiModel,
      setAIProvider: state.setAIProvider,
      setGeminiApiKey: state.setGeminiApiKey,
      setOpenrouterApiKey: state.setOpenrouterApiKey,
      setGroqApiKey: state.setGroqApiKey,
      setAIModel: state.setAIModel,
    }))
  )

  const { brandSignature, savedVault, generatedHistory, setBrandSignature, importBackup } =
    useContentStore(
      useShallow((state) => ({
        brandSignature: state.brandSignature,
        savedVault: state.savedVault,
        generatedHistory: state.generatedHistory,
        setBrandSignature: state.setBrandSignature,
        importBackup: state.importBackup,
      }))
    )

  const [geminiKey, setGeminiKey] = useState(geminiApiKey)
  const [openrouterKey, setOpenrouterKey] = useState(openrouterApiKey)
  const [groqKey, setGroqKey] = useState(groqApiKey)
  const [signature, setSignature] = useState(brandSignature)
  const [showKeys, setShowKeys] = useState<Record<AIProvider, boolean>>({
    gemini: false,
    openrouter: false,
    groq: false,
  })
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const currentPresets = PRESET_MODELS[aiProvider]
  const isPreset = currentPresets.includes(aiModel)
  const [isCustomMode, setIsCustomMode] = useState(!isPreset && Boolean(aiModel))

  useEffect(() => {
    if (open) {
      setGeminiKey(geminiApiKey)
      setOpenrouterKey(openrouterApiKey)
      setGroqKey(groqApiKey)
      setSignature(brandSignature)
      setIsCustomMode(!PRESET_MODELS[aiProvider].includes(aiModel) && Boolean(aiModel))
    }
    // Only re-sync local form state when the dialog opens or persisted keys change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, geminiApiKey, openrouterApiKey, groqApiKey, brandSignature])

  const handleProviderChange = (provider: AIProvider) => {
    setAIProvider(provider)
    setIsCustomMode(false)
  }

  const handleModelSelect = (val: string) => {
    if (val === "custom") {
      setIsCustomMode(true)
    } else {
      setIsCustomMode(false)
      setAIModel(val)
    }
  }

  const selectedModelValue = isCustomMode ? "custom" : isPreset ? aiModel : "custom"

  const handleExportBackup = () => {
    const payload: ContentBackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      brandSignature: signature,
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

      importBackup(parsed)
      if (typeof parsed.brandSignature === "string") {
        setSignature(parsed.brandSignature)
      }
      toast.success(t(language, "settings.restoreSuccess"))
    } catch {
      toast.error(t(language, "settings.restoreError"))
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <DialogTitle>{t(language, "settings.title")}</DialogTitle>
          <DialogDescription>{t(language, "settings.description")}</DialogDescription>
        </div>
        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t(language, "settings.aiProvider")}</label>
            <Select
              value={aiProvider}
              onChange={(e) => handleProviderChange((e.target as HTMLSelectElement).value as AIProvider)}
            >
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq</option>
              <option value="openrouter">OpenRouter</option>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t(language, "settings.model")}</label>
            <Select value={selectedModelValue} onChange={(e) => handleModelSelect((e.target as HTMLSelectElement).value)}>
              {aiProvider === "gemini" ? (
                <>
                  <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  <option value="custom">Custom model...</option>
                </>
              ) : aiProvider === "groq" ? (
                <>
                  <option value="llama-3.3-70b-versatile">
                    llama-3.3-70b-versatile
                  </option>
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                  <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                  <option value="custom">Custom model...</option>
                </>
              ) : (
                <>
                  <option value="openrouter/auto">openrouter/auto</option>
                  <option value="anthropic/claude-3.5-sonnet">
                    anthropic/claude-3.5-sonnet
                  </option>
                  <option value="meta-llama/llama-3.1-405b-instruct">
                    meta-llama/llama-3.1-405b-instruct
                  </option>
                  <option value="custom">Custom model...</option>
                </>
              )}
            </Select>
            {(isCustomMode || !isPreset) && (
              <Input
                type="text"
                value={aiModel}
                onChange={(e) => setAIModel(e.target.value)}
                placeholder={
                  aiProvider === "gemini"
                    ? "Enter model (e.g. gemini-3.5-flash-lite)"
                    : "Enter custom model name"
                }
                className="mt-2"
              />
            )}
          </div>
          <div className="space-y-3">
            {(
              [
                {
                  id: "gemini" as const,
                  value: geminiKey,
                  setter: setGeminiKey,
                  saved: Boolean(geminiApiKey),
                  placeholder: "AIza...",
                },
                {
                  id: "openrouter" as const,
                  value: openrouterKey,
                  setter: setOpenrouterKey,
                  saved: Boolean(openrouterApiKey),
                  placeholder: "sk-or-v1-...",
                },
                {
                  id: "groq" as const,
                  value: groqKey,
                  setter: setGroqKey,
                  saved: Boolean(groqApiKey),
                  placeholder: "gsk_...",
                },
              ] as const
            ).map((field) => {
              const info = PROVIDER_INFO[field.id]
              const isShown = showKeys[field.id]
              return (
                <div key={field.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label htmlFor={`api-key-${field.id}`} className="text-sm font-medium">
                        {info.label} {t(language, "settings.apiKey")}
                      </label>
                      {field.saved && (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          ••••
                        </span>
                      )}
                    </div>
                    <a
                      href={info.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      <Link className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
                      <span>{info.linkLabel}</span>
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id={`api-key-${field.id}`}
                      type={isShown ? "text" : "password"}
                      value={field.value}
                      onChange={(e) => field.setter(e.target.value)}
                      placeholder={
                        field.saved ? "••••" : `${t(language, "settings.apiKeyPlaceholder")} (${field.placeholder})`
                      }
                      disabled={loading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setShowKeys((prev) => ({ ...prev, [field.id]: !prev[field.id] }))
                      }
                      aria-label={isShown ? `Hide ${info.label} key` : `Show ${info.label} key`}
                    >
                      {isShown ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="space-y-1 pt-2 border-t border-border">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{t(language, "settings.apiKeyStored")}</span>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="brand-signature" className="text-sm font-medium font-myanmar">
              {t(language, "settings.brandSignature")}
            </label>
            <Textarea
              id="brand-signature"
              rows={3}
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={t(language, "settings.brandSignaturePlaceholder")}
              className="font-myanmar text-sm resize-y px-3 py-2.5 leading-relaxed"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground font-myanmar">
              {t(language, "settings.brandSignatureHint")}
            </p>
          </div>
          <Separator />
          <div className="space-y-2.5">
            <div>
              <p className="text-sm font-medium font-myanmar">
                {t(language, "settings.backupTitle")}
              </p>
              <p className="text-xs text-muted-foreground font-myanmar leading-relaxed">
                {t(language, "settings.backupDesc")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportBackup}
                disabled={loading}
                className="font-myanmar"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {t(language, "settings.exportBackup")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="font-myanmar"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {t(language, "settings.restoreBackup")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreFile}
                className="hidden"
                aria-label={t(language, "settings.restoreBackup")}
              />
            </div>
          </div>
          <Separator />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t(language, "settings.cancel")}
            </Button>
            <Button
              onClick={() => {
                setGeminiApiKey(geminiKey.trim())
                setOpenrouterApiKey(openrouterKey.trim())
                setGroqApiKey(groqKey.trim())
                setBrandSignature(signature)
                setLoading(true)
                setTimeout(() => {
                  setLoading(false)
                  toast.success(t(language, "settings.saveSuccess"))
                  onOpenChange(false)
                }, 600)
              }}
              disabled={
                loading ||
                (geminiKey.trim() === geminiApiKey &&
                  openrouterKey.trim() === openrouterApiKey &&
                  groqKey.trim() === groqApiKey &&
                  signature === brandSignature)
              }
            >
              {loading ? t(language, "settings.saveSaving") : t(language, "settings.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
