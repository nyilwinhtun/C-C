"use client"

import { useEffect, useRef, useState } from "react"
import { t } from "@/locales/translations"
import { useUIStore, DEFAULT_MODELS, type AIProvider } from "@/store/useUIStore"
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
    "google/gemma-3-27b-it:free",
    "google/gemini-2.5-flash",
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
  { label: string; shortLabel: string; link: string; linkLabel: string; placeholder: string }
> = {
  gemini: {
    label: "Google Gemini",
    shortLabel: "Gemini",
    link: "https://makersuite.google.com/app/apikey",
    linkLabel: "Get free Gemini API key",
    placeholder: "AIza...",
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
    aiProvider,
    apiKeys,
    models,
    setAIProvider,
    setProviderApiKey,
    setProviderModel,
  } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      aiProvider: state.aiProvider,
      apiKeys: state.apiKeys,
      models: state.models,
      setAIProvider: state.setAIProvider,
      setProviderApiKey: state.setProviderApiKey,
      setProviderModel: state.setProviderModel,
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

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(aiProvider)
  const [apiKeyInput, setApiKeyInput] = useState(apiKeys[aiProvider] ?? "")
  const [modelInput, setModelInput] = useState(models[aiProvider] || DEFAULT_MODELS[aiProvider])
  const [signature, setSignature] = useState(brandSignature)
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const currentPresets = PRESET_MODELS[selectedProvider]
  const isPreset = currentPresets.includes(modelInput)
  const [isCustomMode, setIsCustomMode] = useState(!isPreset && Boolean(modelInput))

  useEffect(() => {
    if (open) {
      const initialKey = apiKeys[aiProvider] ?? ""
      const initialModel = models[aiProvider] || DEFAULT_MODELS[aiProvider]
      setSelectedProvider(aiProvider)
      setApiKeyInput(initialKey)
      setModelInput(initialModel)
      setSignature(brandSignature)
      setShowKey(false)
      setIsCustomMode(!PRESET_MODELS[aiProvider].includes(initialModel) && Boolean(initialModel))
    }
    // Only re-sync local form state when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleProviderChange = (provider: AIProvider) => {
    setSelectedProvider(provider)
    const providerKey = apiKeys[provider] ?? ""
    const providerModel = models[provider] || DEFAULT_MODELS[provider]
    setApiKeyInput(providerKey)
    setModelInput(providerModel)
    setShowKey(false)
    setIsCustomMode(!PRESET_MODELS[provider].includes(providerModel) && Boolean(providerModel))
  }

  const handleModelSelect = (val: string) => {
    if (val === "custom") {
      setIsCustomMode(true)
    } else {
      setIsCustomMode(false)
      setModelInput(val)
    }
  }

  const selectedModelValue = isCustomMode ? "custom" : isPreset ? modelInput : "custom"

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
              value={selectedProvider}
              onChange={(e) => handleProviderChange((e.target as HTMLSelectElement).value as AIProvider)}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openrouter">OpenRouter</option>
              <option value="groq">Groq</option>
            </Select>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground pt-0.5">
              {(["gemini", "openrouter", "groq"] as const).map((p, idx) => {
                const isSaved = Boolean(apiKeys[p]?.trim())
                return (
                  <span key={p} className="inline-flex items-center gap-1">
                    {idx > 0 && <span aria-hidden="true" className="mr-1 opacity-50">•</span>}
                    <span className="font-medium text-foreground/80">
                      {PROVIDER_INFO[p].shortLabel}:
                    </span>
                    <span
                      className={
                        isSaved
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {isSaved ? "Saved ✓" : "Empty"}
                    </span>
                  </span>
                )
              })}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t(language, "settings.model")}</label>
            <Select value={selectedModelValue} onChange={(e) => handleModelSelect((e.target as HTMLSelectElement).value)}>
              {currentPresets.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
              <option value="custom">Custom model...</option>
            </Select>
            {(isCustomMode || !isPreset) && (
              <Input
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder={
                  selectedProvider === "gemini"
                    ? "Enter model (e.g. gemini-3.5-flash-lite)"
                    : "Enter custom model name"
                }
                className="mt-2"
              />
            )}
          </div>
          <div className="space-y-1.5">
            {(() => {
              const info = PROVIDER_INFO[selectedProvider]
              const isSaved = Boolean(apiKeys[selectedProvider]?.trim())
              return (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label htmlFor={`api-key-${selectedProvider}`} className="text-sm font-medium">
                        {info.label} {t(language, "settings.apiKey")}
                      </label>
                      {isSaved && (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          Saved ✓
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
                      id={`api-key-${selectedProvider}`}
                      type={showKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={`${t(language, "settings.apiKeyPlaceholder")} (${info.placeholder})`}
                      disabled={loading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowKey((prev) => !prev)}
                      aria-label={showKey ? `Hide ${info.label} key` : `Show ${info.label} key`}
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </>
              )
            })()}
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
                const normalizedModel = modelInput.trim() || DEFAULT_MODELS[selectedProvider]
                setAIProvider(selectedProvider)
                setProviderApiKey(selectedProvider, apiKeyInput.trim())
                setProviderModel(selectedProvider, normalizedModel)
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
                (selectedProvider === aiProvider &&
                  apiKeyInput.trim() === (apiKeys[selectedProvider] ?? "") &&
                  (modelInput.trim() || DEFAULT_MODELS[selectedProvider]) ===
                    (models[selectedProvider] || DEFAULT_MODELS[selectedProvider]) &&
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
