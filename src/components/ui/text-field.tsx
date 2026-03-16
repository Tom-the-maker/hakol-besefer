import * as React from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  required?: boolean
  containerClassName?: string
}

const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, containerClassName, label, error, required, id, ...props }, ref) => {
    // Generate unique ID if not provided
    const inputId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}`
    
    return (
      <div className={cn("space-y-2", containerClassName)}>
        <Label 
          htmlFor={inputId}
          className={cn(
            "text-base font-semibold text-[#4A2C17]",
            required && "after:content-['*'] after:ml-0.5 after:text-red-500"
          )}
        >
          {label}
        </Label>
        <Input
          id={inputId}
          ref={ref}
          className={cn(
            error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
            className
          )}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p 
            id={`${inputId}-error`}
            className="text-sm text-red-600 mt-1"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    )
  }
)
TextField.displayName = "TextField"

export { TextField } 