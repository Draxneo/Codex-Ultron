import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, CalendarDays, Phone, MessageSquare, Users, Zap, Bot, DollarSign, Settings, Package, BarChart3, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavOrder } from "@/hooks/useNavOrder";

const NAV_META: Record<string, { icon: any; label: string }> = {
  "/": { icon: CalendarDays, label: "Schedule" },
  "/now": { icon: ListChecks, label: "Now HQ" },
  "/phone": { icon: Phone, label: "Phone" },
  "/sms": { icon: MessageSquare, label: "SMS" },
  "/team": { icon: Users, label: "Team Chat" },
  "/customers": { icon: Users, label: "Customers" },
  "/quick-quote": { icon: Zap, label: "Estimates" },
  "/catalog": { icon: Package, label: "Price Book" },
  "/pay": { icon: DollarSign, label: "Payments" },
  "/reports": { icon: BarChart3, label: "Reporting" },
  "/copilot": { icon: Bot, label: "JARVIS" },
  "/admin": { icon: Settings, label: "Admin" },
};

function SortableNavItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const meta = NAV_META[id];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card ${isDragging ? "shadow-lg opacity-80 border-primary" : "border-border"}`}
      {...attributes}
    >
      <button className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground" {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{meta.label}</span>
    </div>
  );
}

export function NavOrderEditor() {
  const { order, saveOrder } = useNavOrder();
  const [items, setItems] = useState<string[]>(order);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setItems(order);
  }, [order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
      setDirty(true);
    }
  };

  const handleSave = () => {
    saveOrder.mutate(items);
    setDirty(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Navigation Order</CardTitle>
        <CardDescription className="text-xs">
          Drag to rearrange the top navigation tabs. Changes apply to all users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {items.map((id) => (
                <SortableNavItem key={id} id={id} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {dirty && (
          <Button onClick={handleSave} className="w-full mt-3" disabled={saveOrder.isPending}>
            {saveOrder.isPending ? "Saving..." : "Save Order"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
