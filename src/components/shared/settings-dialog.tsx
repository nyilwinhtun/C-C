"use client"

import { useState } from "react"
import { Eye, EyeOff, Link, Bot, Key, ShieldAlert } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { useUIStore } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

type AIProvider = "gemini" | "groq" | "openrouter"

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
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)

  const { aiProvider, aiApiKey, aiModel, setAIProvider, setAIApiKey, setAIModel } =
    useUIStore(
      useShallow((state) => ({
        aiProvider: state.aiProvider,
        aiApiKey: state.aiApiKey,
        aiModel: state.aiModel,
        setAIProvider: state.setAIProvider,
        setAIApiKey: state.setAIApiKey,
        setAIModel: state.setAIModel,
      }))
    )

  const providerInfo = PROVIDER_INFO[aiProvider]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your AI provider and API key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label>AI Provider</Label>
            <Select
              value={aiProvider}
              onValueChange={(value: AIProvider) => setAIProvider(value)}
            >
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq</option>
              <option value="openrouter">OpenRouter</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={aiModel} onValueChange={(value: string) => setAIModel(value)}>
              {aiProvider === "gemini" ? (
                <>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                </>
              ) : aiProvider === "groq" ? (
                <>
                  <option value="llama-3.3-70b-versatile">
                    llama-3.3-70b-versatile
                  </option>
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                  <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
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
                </>
              )}
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>API Key</Label>
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
              placeholder="Enter your API key"
              disabled={loading}
            />
          </div>
          <div className="space-y-1 pt-2 border-t border-border">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Your API key is stored only in your browser's localStorage.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
              <span className="text-xs">
                {providerInfo.linkLabel}:{" "}
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
              Cancel
            </Button>
            <Button
              onClick={() => {
                setAIApiKey(apiKey)
                setLoading(true)
                setTimeout(() => {
                  setLoading(false)
                  toast.success("Settings saved")
                  onOpenChange(false)
                }, 600)
              }}
              disabled={loading || !apiKey}
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
