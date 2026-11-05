import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { X, LoaderCircle } from "lucide-react";
import { cn } from "../lib/utils";

const buttonVariants = cva("button", {
  variants: {
    variant: {
      default: "button-primary",
      secondary: "button-secondary",
      ghost: "button-ghost",
      destructive: "button-destructive",
      outline: "button-outline",
    },
    size: { default: "", sm: "button-sm", icon: "button-icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <LoaderCircle size={15} className="spin" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input className={cn("input", className)} ref={ref} {...props} />
));
Input.displayName = "Input";
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea className={cn("input textarea", className)} ref={ref} {...props} />
));
Textarea.displayName = "Textarea";
export function Label({
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className="field-label" {...props}>
      {children}
    </label>
  );
}
export function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
export function Select({
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("input select", className)} {...props}>
      {children}
    </select>
  );
}
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <span className={cn("badge", `badge-${tone}`, className)}>{children}</span>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const descriptionId = React.useId();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          aria-describedby={description ? descriptionId : undefined}
          className={cn("dialog-content", wide && "dialog-wide", className)}
        >
          <div className="dialog-heading">
            <div>
              <DialogPrimitive.Title className="dialog-title">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description
                  id={descriptionId}
                  className="dialog-description"
                >
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="button button-ghost button-icon"
              aria-label="关闭 / Close"
            >
              <X size={19} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function Spinner() {
  const label = document.documentElement.lang.startsWith("zh")
    ? "正在读取…"
    : "Loading…";
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={23} className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
