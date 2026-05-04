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


const NON_TEXT_TYPES = new Set(["email", "password", "url", "number", "tel", "date", "time", "datetime-local", "month", "week", "color", "file", "hidden", "range", "search"]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onBlur, onChange, onCompositionStart, onCompositionEnd, ...props }, ref) => {
    const { isNative } = useCapacitor();
    const composingRef = React.useRef(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const isTextField = !type || !NON_TEXT_TYPES.has(type);
    // On native OR Android WebView: let the OS keyboard handle everything
    const shouldAutoFix = !isNative && !isAndroidWebView() && isTextField;

    const syncNativeValue = React.useCallback(() => {
      if (!onChange || !inputRef.current) return;

      const target = inputRef.current;
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
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    }, [onChange, props.value]);

    React.useEffect(() => {
      if (!isTextField || !isAndroidWebView()) return;

      const el = inputRef.current;
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
    }, [isTextField, syncNativeValue]);

    const handleCompositionStart = (e: React.CompositionEvent<HTMLInputElement>) => {
      composingRef.current = true;
      onCompositionStart?.(e);
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
      onCompositionEnd?.(e);
      requestAnimationFrame(() => {
        composingRef.current = false;
        syncNativeValue();
      });
    };

    const handleRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      setRef(ref, node);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      composingRef.current = false;
      onBlur?.(e);
    };

    return (
      <input
        type={type}
        autoCapitalize={isTextField ? "sentences" : "off"}
        autoCorrect={isTextField ? "on" : "off"}
        spellCheck={isTextField}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        className={cn(
          "flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onBlur={handleBlur}
        ref={handleRef}
        onChange={onChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
