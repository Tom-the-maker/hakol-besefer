import * as React from "react"

import { cn } from "@/lib/utils"

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  // Extends React textarea attributes
  }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border bg-white px-4 py-3 text-base",
          "border-[#4d4d4d]/30 text-[#1A1A1A] placeholder:text-[#4d4d4d]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9C922]/30 focus-visible:border-[#F9C922]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
