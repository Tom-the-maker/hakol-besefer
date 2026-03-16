import * as React from "react"
import { cn } from "@/lib/utils"

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  // Extends React input attributes
  }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Modern input styles with 48px height and 12px radius
          "flex h-12 w-full rounded-xl px-4 py-4 text-base",
          "bg-white border border-[#4d4d4d]/30",
          "text-[#1A1A1A] placeholder:text-[#4d4d4d]",
          "focus:outline-none focus:ring-2 focus:ring-[#F9C922]/30 focus:border-[#F9C922]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-colors duration-200",
          // Ensure placeholders are same size as input text (requirement)
          "placeholder:text-base",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
