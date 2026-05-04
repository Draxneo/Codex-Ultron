import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Smile } from "lucide-react";

const EMOJI_LIST = [
  "😀", "😂", "😍", "🤔", "👍", "👎", "🎉", "🔥", "❤️", "😢",
  "😡", "🤣", "😊", "🙏", "💪", "✅", "❌", "⭐", "💯", "🚀",
  "👀", "🤝", "📞", "📧", "🔧", "🏠", "💰", "📋", "⏰", "✨",
];

interface Props {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" sideOffset={8}>
        <div className="grid grid-cols-10 gap-0.5">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-base transition-colors"
              onClick={() => { onSelect(emoji); setOpen(false); }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
