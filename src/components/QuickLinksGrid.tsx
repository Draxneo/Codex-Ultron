import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ExternalLink, CreditCard, Truck, Search, Zap, Building2,
  FileText, ShoppingCart, Key, Landmark, Mail, MapPin, Phone,
  LayoutDashboard, RefreshCw, GripVertical, Plus, X, Link as LinkIcon,
  Pencil, Check, FolderPlus, Trash2, Star,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuickLinkLogos } from "@/hooks/useQuickLinkLogos";
import { useQuickLinks, type QuickLinkData } from "@/hooks/useQuickLinks";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  CreditCard, Truck, Search, Zap, Building2, FileText, ShoppingCart,
  Key, Landmark, Mail, MapPin, Phone, LayoutDashboard, LinkIcon, Star,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || LinkIcon;
}

/* ─── Sortable Link Card ─── */
function SortableLink({
  link,
  logoUrl,
  onDelete,
}: {
  link: QuickLinkData;
  logoUrl?: string;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: link.id, data: { category: link.category } });

  const Icon = getIcon(link.iconName);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/item">
      <a href={link.href} target="_blank" rel="noopener noreferrer" className="group block">
        <Card className="p-3 hover:shadow-md transition-all hover:border-primary/30 cursor-pointer h-full">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <div className="w-8 h-8 rounded-md overflow-hidden flex items-center justify-center bg-muted/50 shrink-0">
                <img src={logoUrl} alt={link.label} className="w-6 h-6 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            ) : (
              <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{link.label}</p>
              <p className="text-[10px] text-muted-foreground truncate">{link.sub}</p>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </Card>
      </a>
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1 right-7 p-1 rounded opacity-0 group-hover/item:opacity-60 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none"
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <button
        className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover/item:opacity-60 hover:!opacity-100 transition-opacity text-destructive"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(link.id); }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ─── Static preview for drag overlay ─── */
function LinkCardPreview({ link, logoUrl }: { link: QuickLinkData; logoUrl?: string }) {
  const Icon = getIcon(link.iconName);
  return (
    <Card className="p-3 shadow-lg border-primary/30 w-48">
      <div className="flex items-center gap-2.5">
        {logoUrl ? (
          <div className="w-8 h-8 rounded-md overflow-hidden flex items-center justify-center bg-muted/50 shrink-0">
            <img src={logoUrl} alt={link.label} className="w-6 h-6 object-contain" />
          </div>
        ) : (
          <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{link.label}</p>
          <p className="text-[10px] text-muted-foreground truncate">{link.sub}</p>
        </div>
      </div>
    </Card>
  );
}

/* ─── Droppable Category ─── */
function DroppableCategory({
  category,
  links,
  logos,
  onDelete,
  onRenameCategory,
  onDeleteCategory,
}: {
  category: string;
  links: QuickLinkData[];
  logos: Record<string, string>;
  onDelete: (id: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category);
  const { setNodeRef } = useSortable({
    id: `category-${category}`,
    data: { type: "category", category },
    disabled: true,
  });

  const handleRename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== category) {
      onRenameCategory(category, trimmed);
    } else {
      setName(category);
    }
    setEditing(false);
  };

  return (
    <div ref={setNodeRef}>
      <div className="flex items-center gap-1.5 mb-1.5 group/cat">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-5 text-[11px] w-32 px-1.5"
              autoFocus
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") handleRename(); }}
              onBlur={handleRename}
            />
            <button onClick={handleRename}>
              <Check className="h-3 w-3 text-primary" />
            </button>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-medium text-muted-foreground pl-0.5">{category}</p>
            <button
              className="opacity-0 group-hover/cat:opacity-60 hover:!opacity-100 transition-opacity"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
            {links.length === 0 && (
              <button
                className="opacity-0 group-hover/cat:opacity-60 hover:!opacity-100 transition-opacity text-destructive"
                onClick={() => onDeleteCategory(category)}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            )}
          </>
        )}
      </div>
      <SortableContext items={links.map((l) => l.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 min-h-[40px] rounded-md border border-dashed border-transparent data-[empty=true]:border-muted-foreground/20 p-0 data-[empty=true]:p-2"
          data-empty={links.length === 0}
          data-category={category}
        >
          {links.length === 0 && (
            <p className="col-span-full text-[10px] text-muted-foreground/50 text-center">Drag links here</p>
          )}
          {links.map((link) => (
            <SortableLink key={link.id} link={link} logoUrl={logos[link.href]} onDelete={onDelete} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

/* ─── Add Link Dialog ─── */
function AddLinkDialog({
  categories,
  onAdd,
}: {
  categories: string[];
  onAdd: (link: Omit<QuickLinkData, "id" | "sort_order">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [label, setLabel] = useState("");
  const [sub, setSub] = useState("");
  const [category, setCategory] = useState(categories[0] || "");
  const [iconName, setIconName] = useState("LinkIcon");

  const handleAdd = () => {
    if (!href || !label) return;
    let finalHref = href.trim();
    if (!finalHref.startsWith("http://") && !finalHref.startsWith("https://")) {
      finalHref = `https://${finalHref}`;
    }
    onAdd({ href: finalHref, label: label.trim(), sub: sub.trim() || label.trim(), iconName, category });
    setHref(""); setLabel(""); setSub(""); setIconName("LinkIcon");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground">
          <Plus className="h-3 w-3" /> Add Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Quick Link</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs">URL</Label>
            <Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://example.com" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Site Name" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Short description" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Icon</Label>
              <Select value={iconName} onValueChange={setIconName}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((name) => {
                    const Ic = ICON_MAP[name];
                    return (
                      <SelectItem key={name} value={name}>
                        <div className="flex items-center gap-2">
                          <Ic className="h-3.5 w-3.5" />
                          <span className="text-xs">{name}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleAdd} className="w-full" disabled={!href || !label}>Add Link</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add Category Inline ─── */
function AddCategoryButton({ onAdd }: { onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const handleAdd = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onAdd(trimmed);
      setName("");
    }
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          className="h-6 text-[11px] w-36 px-2"
          autoFocus
          onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
          onBlur={handleAdd}
        />
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={() => setAdding(true)}>
      <FolderPlus className="h-3 w-3" /> Add Category
    </Button>
  );
}

/* ─── Main Grid ─── */
export function QuickLinksGrid({ excludeCategories, onlyCategories }: { excludeCategories?: string[]; onlyCategories?: string[] } = {}) {
  const { logos, fetchLogos } = useQuickLinkLogos();
  const {
    links, categories, isLoading,
    addLink, deleteLink, reorderLinks,
    addCategory, renameCategory, deleteCategory,
  } = useQuickLinks();

  const [activeId, setActiveId] = useState<string | null>(null);
  // Local reorder state for drag operations
  const [localLinks, setLocalLinks] = useState<QuickLinkData[] | null>(null);
  const displayLinks = localLinks ?? links;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setLocalLinks([...links]);
  }, [links]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    setLocalLinks((prev) => {
      if (!prev) return prev;
      const activeLink = prev.find((l) => l.id === active.id);
      if (!activeLink) return prev;

      let targetCategory: string | null = null;
      const overData = over.data?.current;

      if (overData?.type === "category") {
        targetCategory = overData.category;
      } else {
        const overLink = prev.find((l) => l.id === over.id);
        if (overLink) targetCategory = overLink.category;
      }

      if (targetCategory && targetCategory !== activeLink.category) {
        return prev.map((l) =>
          l.id === active.id ? { ...l, category: targetCategory! } : l
        );
      }
      return prev;
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    setLocalLinks((prev) => {
      if (!prev) return null;
      if (!over || active.id === over.id) {
        reorderLinks.mutate(prev);
        return null;
      }

      const oldIdx = prev.findIndex((l) => l.id === active.id);
      const newIdx = prev.findIndex((l) => l.id === over.id);

      if (oldIdx !== -1 && newIdx !== -1) {
        const updated = [...prev];
        const [moved] = updated.splice(oldIdx, 1);
        updated.splice(newIdx, 0, moved);
        reorderLinks.mutate(updated);
        return null;
      }
      reorderLinks.mutate(prev);
      return null;
    });
  }, [reorderLinks]);

  const handleDelete = useCallback((id: string) => {
    deleteLink.mutate(id);
  }, [deleteLink]);

  const handleAddLink = useCallback((link: Omit<QuickLinkData, "id" | "sort_order">) => {
    addLink.mutate(link);
  }, [addLink]);

  const handleAddCategory = useCallback((name: string) => {
    if (!categories.includes(name)) {
      addCategory.mutate(name);
    }
  }, [categories, addCategory]);

  const handleRenameCategory = useCallback((oldName: string, newName: string) => {
    if (categories.includes(newName)) return;
    renameCategory.mutate({ oldName, newName });
  }, [categories, renameCategory]);

  const handleDeleteCategory = useCallback((name: string) => {
    if (displayLinks.some((l) => l.category === name)) return;
    deleteCategory.mutate(name);
  }, [displayLinks, deleteCategory]);

  const grouped = useMemo(() => {
    const map: Record<string, QuickLinkData[]> = {};
    for (const cat of categories) map[cat] = [];
    for (const link of displayLinks) {
      if (!map[link.category]) map[link.category] = [];
      map[link.category].push(link);
    }
    return map;
  }, [displayLinks, categories]);

  const activeLink = activeId ? displayLinks.find((l) => l.id === activeId) : null;
  const allHrefs = displayLinks.map((l) => l.href);

  const visibleCategories = useMemo(() => {
    let cats = categories;
    if (onlyCategories) cats = cats.filter((c) => onlyCategories.includes(c));
    if (excludeCategories) cats = cats.filter((c) => !excludeCategories.includes(c));
    return cats;
  }, [categories, onlyCategories, excludeCategories]);

  const allSortableIds = [...displayLinks.map((l) => l.id), ...visibleCategories.map((c) => `category-${c}`)];

  if (isLoading) {
    return (
      <div className="px-4 mt-4 space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 mt-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Links</p>
        <div className="flex items-center gap-1">
          <AddCategoryButton onAdd={handleAddCategory} />
          <AddLinkDialog categories={categories} onAdd={handleAddLink} />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1 text-muted-foreground"
            onClick={() => fetchLogos.mutate(allHrefs)}
            disabled={fetchLogos.isPending}
          >
            <RefreshCw className={`h-3 w-3 ${fetchLogos.isPending ? "animate-spin" : ""}`} />
            {fetchLogos.isPending ? "Fetching..." : "Fetch Logos"}
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allSortableIds} strategy={rectSortingStrategy}>
          <div className="space-y-4">
            {visibleCategories.map((category) => (
              <DroppableCategory
                key={category}
                category={category}
                links={grouped[category] || []}
                logos={logos}
                onDelete={handleDelete}
                onRenameCategory={handleRenameCategory}
                onDeleteCategory={handleDeleteCategory}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeLink ? (
            <LinkCardPreview link={activeLink} logoUrl={logos[activeLink.href]} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
