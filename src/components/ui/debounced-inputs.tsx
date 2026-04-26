/**
 * Shared auto-save input components with debounced persistence.
 * Used across all canvas detail panels for consistent UX.
 */
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check } from "lucide-react";

/** Input with local state + debounced auto-save. */
export function DebouncedInput({ value, onSave, placeholder, className }: {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSave(v), 600);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return <Input value={local} onChange={handleChange} placeholder={placeholder} className={className} />;
}

/** Textarea with local state + debounced auto-save. Shows a tiny ✓ on save. */
export function DebouncedTextarea({ value, onSave, placeholder, className }: {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLocal(v);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 600);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="relative">
      <Textarea
        value={local}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
      />
      {saved && (
        <span className="absolute top-1.5 right-2 flex items-center gap-1 text-[10px] text-primary animate-in fade-in">
          <Check className="h-3 w-3" /> Saved
        </span>
      )}
    </div>
  );
}
