import * as React from "react";

import { cn } from "@/lib/utils";
import { useCapacitor } from "@/hooks/useCapacitor";

function setRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

/** Direct Android WebView check as inline fallback */
function isAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /android/i.test(ua) || /\bwv\b/.test(ua);
}


export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, onBlur, onChange, onCompositionStart, onCompositionEnd, ...props }, ref) => {
  const { isNative } = useCapacitor();
  const composingRef = React.useRef(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const shouldAutoFix = !isNative && !isAndroidWebView();

  const syncNativeValue = React.useCallback(() => {
    if (!onChange || !textareaRef.current) return;

    const target = textareaRef.current;
    const propValue = props.value == null ? undefined : String(props.value);

    if (propValue !== undefined && target.value === propValue) return;

    onChange({
      target,
      currentTarget: target,
      nativeEvent: new Event("input", { bubbles: true }),
      preventDefault: () => {},
      stopPropagation: () => {},
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      persist: () => {},
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      eventPhase: 3,
      isTrusted: false,
      timeStamp: Date.now(),
      type: "change",
    } as unknown as React.ChangeEvent<HTMLTextAreaElement>);
  }, [onChange, props.value]);

  React.useEffect(() => {
    if (!isAndroidWebView()) return;

    const el = textareaRef.current;
    if (!el) return;

    let frame = 0;
    const queueSync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncNativeValue);
    };

    el.addEventListener("beforeinput", queueSync);
    el.addEventListener("input", queueSync);
    el.addEventListener("change", queueSync);
    el.addEventListener("compositionend", queueSync);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("beforeinput", queueSync);
      el.removeEventListener("input", queueSync);
      el.removeEventListener("change", queueSync);
      el.removeEventListener("compositionend", queueSync);
    };
  }, [syncNativeValue]);

  const handleCompositionStart = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = true;
    onCompositionStart?.(e);
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    onCompositionEnd?.(e);
    requestAnimationFrame(() => {
      composingRef.current = false;
      syncNativeValue();
    });
  };

  const handleRef = (node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    setRef(ref, node);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    onBlur?.(e);
  };

  return (
    <textarea
      autoCapitalize="sentences"
      autoCorrect="on"
      spellCheck
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      className={cn(
        "flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      onBlur={handleBlur}
      ref={handleRef}
      onChange={onChange}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
