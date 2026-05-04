import { useEffect, useState } from "react";

interface Props {
  visible: boolean;
  label: string;
  onClick: () => void;
}

export function StickyApproveBar({ visible, label, onClick }: Props) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!visible) { setShow(false); return; }
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [visible]);

  if (!show || !visible) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur p-3 shadow-2xl">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <p className="text-sm text-foreground font-medium truncate">{label}</p>
        <button
          onClick={onClick}
          className="shrink-0 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow"
        >
          Choose Option
        </button>
      </div>
    </div>
  );
}
