"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded-[14px] border-[0.5px] border-[rgba(60,60,67,0.14)] dark:border-[rgba(84,84,88,0.38)] bg-[#F2F2F7]/65 dark:bg-[#2C2C2E] px-3.5 py-2.5 text-sm leading-[1.75] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/40 dark:focus-visible:ring-[#0A84FF]/50 focus-visible:bg-white dark:focus-visible:bg-[#1C1C1E] disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
