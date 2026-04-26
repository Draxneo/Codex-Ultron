/**
 * SortableSectionShell — Generic dnd-kit wrapper for any sortable section.
 *
 * In view mode: renders children plain.
 * In edit mode: shows a dashed ring, optional label badge, and a grip handle.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface Props {
  id: string;
  editing: boolean;
  label?: string;
  children: React.ReactNode;
}

export function SortableSectionShell({ id, editing, label, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  if (!editing) {
    return <div>{children}</div>;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`relative rounded-xl ${isDragging ? "opacity-60 ring-2 ring-primary shadow-2xl z-10" : "ring-1 ring-dashed ring-primary/40"}`}
    >
      {label && (
        <p className="absolute top-3 left-3 z-10 px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider pointer-events-none">
          {label}
        </p>
      )}
      <button
        {...listeners}
        type="button"
        className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-primary text-primary-foreground shadow-md cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
