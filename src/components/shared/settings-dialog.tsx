"use client"

import { useEffect, useState } from "react"
import { t } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import { Eye, EyeOff, Link, ShieldAlert } from "lucide-react"
import { toast } from "@/components/ui/sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

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
  const { language, aiProvider, aiApiKey, aiModel, setAIProvider, setAIApiKey, setAIModel } =
    useUIStore(
      useShallow((state) => ({
        language: state.language,
        aiProvider: state.aiProvider,
        aiApiKey: state.aiApiKey,
        aiModel: state.aiModel,
        setAIProvider: state.setAIProvider,
        setAIApiKey: state.setAIApiKey,
        setAIModel: state.setAIModel,
      }))
    )

  const [apiKey, setApiKey] = useState(aiApiKey)
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)

  const providerInfo = PROVIDER_INFO[aiProvider]
  const currentPresets = PRESET_MODELS[aiProvider]
  const isPreset = currentPresets.includes(aiModel)
  const [isCustomMode, setIsCustomMode] = useState(!isPreset && Boolean(aiModel))

  useEffect(() => {
    if (open) {
      setApiKey(aiApiKey)
      setIsCustomMode(!PRESET_MODELS[aiProvider].includes(aiModel) && Boolean(aiModel))
    }
    // Only re-sync local form state when the dialog opens or persisted key changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aiApiKey])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t(language, "settings.apiKey")}</label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t(language, "settings.apiKeyPlaceholder")}
              disabled={loading}
            />
          </div>
          <div className="space-y-1 pt-2 border-t border-border">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {t(language, "settings.apiKeyStored")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
              <span className="text-xs">
                {t(language, "settings.providerLink", { provider: providerInfo.label })}:{" "}
                <a
                  href={providerInfo.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {providerInfo.label}
                </a>
              </span>
            </div>
          </div>
          <Separator />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t(language, "settings.cancel")}
            </Button>
            <Button
              onClick={() => {
                setAIApiKey(apiKey)
                setLoading(true)
                setTimeout(() => {
                  setLoading(false)
                  toast.success(t(language, "settings.saveSuccess"))
                  onOpenChange(false)
                }, 600)
              }}
              disabled={loading || !apiKey}
            >
              {loading ? t(language, "settings.saveSaving") : t(language, "settings.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
