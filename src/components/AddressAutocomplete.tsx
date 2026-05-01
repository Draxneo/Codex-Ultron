/// <reference types="google.maps" />
import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoComplete?: string;
  name?: string;
}

interface Suggestion {
  placeId: string;
  description: string;
  mainText: string;
}

export function AddressAutocomplete({ value, onChange, placeholder = "Start typing an address...", className, autoComplete, name }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const readyRef = useRef(false);

  useEffect(() => { setInputValue(value); }, [value]);

  // Initialize Google Places services
  useEffect(() => {
    loadGoogleMaps().then(() => {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
      readyRef.current = true;
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3 || !readyRef.current || !autocompleteServiceRef.current) {
      setSuggestions([]);
      return;
    }
    try {
      const result = await autocompleteServiceRef.current.getPlacePredictions({
        input: query,
        componentRestrictions: { country: "us" },
        types: ["address"],
      });
      const predictions = result?.predictions || [];
      setSuggestions(
        predictions.slice(0, 5).map((p) => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text || p.description,
        }))
      );
      setOpen(true);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleChange = (val: string) => {
    setInputValue(val);
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = (suggestion: Suggestion) => {
    setInputValue(suggestion.description);
    onChange(suggestion.description);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className={`pl-8 ${className || ""}`}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          autoComplete={autoComplete}
          name={name}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
              onClick={() => handleSelect(s)}
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-foreground">{s.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
