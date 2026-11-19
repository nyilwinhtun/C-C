"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="text"
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-[12px] border-[0.5px] border-[rgba(60,60,67,0.14)] dark:border-[rgba(84,84,88,0.38)] bg-[#F2F2F7]/65 dark:bg-[#2C2C2E] px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/40 dark:focus-visible:ring-[#0A84FF]/50 focus-visible:bg-white dark:focus-visible:bg-[#1C1C1E] disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
