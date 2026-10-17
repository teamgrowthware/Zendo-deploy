import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "zendo-pointer zendo-inline-flex zendo-items-center zendo-justify-center zendo-gap-2 zendo-font-semibold zendo-transition zendo-duration-150 disabled:zendo-not-allowed disabled:zendo-opacity-50 focus-visible:zendo-outline focus-visible:zendo-outline-2 focus-visible:zendo-outline-offset-2 focus-visible:zendo-outline-lime",
  {
    variants: {
      variant: {
        primary: "zendo-bg-lime zendo-text-ink hover:zendo-bg-lime-2",
        gold: "zendo-bg-gold zendo-text-ink hover:zendo-brightness-105",
        ghost: "zendo-bg-transparent zendo-text-cream hover:zendo-bg-white/5",
        outline: "zendo-border zendo-border-line zendo-bg-panel/60 zendo-text-cream hover:zendo-border-lime/50",
        danger: "zendo-bg-coral zendo-text-ink hover:zendo-brightness-105",
      },
      size: {
        sm: "zendo-h-9 zendo-rounded-lg zendo-px-3 zendo-text-sm",
        md: "zendo-h-11 zendo-rounded-xl zendo-px-4 zendo-text-sm",
        lg: "zendo-h-12 zendo-rounded-full zendo-px-5 zendo-text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "zendo-text zendo-h-11 zendo-w-full zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3 zendo-text-sm zendo-text-cream zendo-outline-none placeholder:zendo-text-muted/70 focus:zendo-border-lime",
        props.className,
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "zendo-text zendo-min-h-28 zendo-w-full zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3 zendo-py-2 zendo-text-sm zendo-text-cream zendo-outline-none placeholder:zendo-text-muted/70 focus:zendo-border-lime",
        props.className,
      )}
    />
  );
}

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={cn("zendo-text-sm zendo-font-medium zendo-text-cream", props.className)} />;
}

export function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "lime" | "gold" | "coral" }) {
  const tones = {
    muted: "zendo-border-line zendo-text-muted",
    lime: "zendo-border-lime/40 zendo-bg-lime/10 zendo-text-lime",
    gold: "zendo-border-gold/40 zendo-bg-gold/10 zendo-text-gold",
    coral: "zendo-border-coral/40 zendo-bg-coral/10 zendo-text-coral",
  };
  return <span className={cn("zendo-inline-flex zendo-items-center zendo-rounded-full zendo-border zendo-px-2 zendo-py-0.5 zendo-text-xs zendo-font-medium", tones[tone])}>{children}</span>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="zendo-grid zendo-gap-1.5">
      <span className="zendo-text-sm zendo-font-medium">{label}</span>
      {children}
      {error ? <span className="zendo-text-sm zendo-text-coral">{error}</span> : hint ? <span className="zendo-text-xs zendo-text-muted">{hint}</span> : null}
    </label>
  );
}

export function Panel({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return <section id={id} className={cn("zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel/90 zendo-p-5", className)}>{children}</section>;
}

export function MarkLoader({ label }: { label: string }) {
  return (
    <div className="zendo-grid zendo-justify-items-center zendo-gap-3" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <svg className="zendo-mark-spin zendo-h-10 zendo-w-10" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="18" fill="none" stroke="#31382a" strokeWidth="3" />
        <path d="M24 6 a18 18 0 0 1 16 10" fill="none" stroke="#C8FF00" strokeWidth="3" strokeLinecap="round" />
        <path d="M16 30 L24 14 L32 30" fill="none" stroke="#FFD700" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      <span className="zendo-sr-only">{label}</span>
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="zendo-grid zendo-gap-3">
      <MarkLoader label={label} />
      <div className="zendo-h-24 zendo-animate-pulse zendo-rounded-3xl zendo-bg-panel" />
      <div className="zendo-h-16 zendo-animate-pulse zendo-rounded-3xl zendo-bg-panel" />
      <div className="zendo-h-16 zendo-animate-pulse zendo-rounded-3xl zendo-bg-panel" />
    </div>
  );
}
