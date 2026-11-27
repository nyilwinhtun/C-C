import { useState } from "react"
import { Layers, QrCode } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"
import { BioLinkStudio } from "./BioLinkStudio"
import { SingleQrStudio } from "./SingleQrStudio"
import type { SocialQrStudioTab } from "./types"

export function SocialQrPage() {
  const language = useUIStore((s) => s.language)
  const [studioTab, setStudioTab] = useState<SocialQrStudioTab>("single_qr")

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {t(language, "socialQr.pageTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t(language, "socialQr.pageSubtitle")}
          </p>
        </div>

        {/* Clean mode switcher architected for Step 1 + Step 2 */}
        <div className="inline-flex items-center rounded-xl border border-border bg-muted/40 p-1 self-start">
          <button
            type="button"
            onClick={() => setStudioTab("single_qr")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
              studioTab === "single_qr"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <QrCode className="h-3.5 w-3.5" />
            {t(language, "socialQr.tabSingleQr")}
          </button>
          <button
            type="button"
            onClick={() => setStudioTab("bio_link")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
              studioTab === "bio_link"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            {t(language, "socialQr.tabBioLink")}
          </button>
        </div>
      </div>

      {studioTab === "single_qr" ? <SingleQrStudio /> : <BioLinkStudio />}
    </div>
  )
}
