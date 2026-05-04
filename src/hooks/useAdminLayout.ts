import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AdminCategory {
  id: string;
  name: string;
  sort_order: number;
  cardKeys: string[];
  isDefault?: boolean;
}

const DEFAULT_LAYOUT: { name: string; cardKeys: string[] }[] = [
  { name: "Tools", cardKeys: ["jarvis", "shopping-cart", "payments", "phone-system", "lsa-leads", "system-log"] },
];

export function useAdminLayout() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load from DB or use defaults
  useEffect(() => {
    if (!user) {
      // Not logged in — use defaults with generated IDs
      setCategories(DEFAULT_LAYOUT.map((c, i) => ({
        id: `default-${i}`,
        name: c.name,
        sort_order: i,
        cardKeys: c.cardKeys,
        isDefault: true,
      })));
      setLoading(false);
      return;
    }

    (async () => {
      const { data: cats } = await supabase
        .from("admin_categories")
        .select("*")
        .order("sort_order");

      if (!cats || cats.length === 0) {
        // No saved layout — use defaults
        setCategories(DEFAULT_LAYOUT.map((c, i) => ({
          id: `default-${i}`,
          name: c.name,
          sort_order: i,
          cardKeys: c.cardKeys,
          isDefault: true,
        })));
        setLoading(false);
        return;
      }

      const { data: positions } = await supabase
        .from("admin_card_positions")
        .select("*")
        .order("sort_order");

      const result: AdminCategory[] = cats.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        sort_order: cat.sort_order,
        cardKeys: (positions || [])
          .filter((p: any) => p.category_id === cat.id)
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((p: any) => p.card_key),
      }));

      // Merge any new cards from DEFAULT_LAYOUT that aren't in the saved layout
      const savedKeys = new Set(result.flatMap((c) => c.cardKeys));
      for (const def of DEFAULT_LAYOUT) {
        for (const key of def.cardKeys) {
          if (!savedKeys.has(key)) {
            // Find or create the category
            let cat = result.find((c) => c.name === def.name);
            if (!cat) {
              cat = { id: `merged-${def.name}`, name: def.name, sort_order: result.length, cardKeys: [] };
              result.push(cat);
            }
            cat.cardKeys.push(key);
            savedKeys.add(key);
          }
        }
      }

      setCategories(result);
      setLoading(false);
    })();
  }, [user]);

  // Debounced save to DB
  const persistLayout = useCallback(
    (cats: AdminCategory[]) => {
      if (!user) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        // Delete existing and re-insert
        await supabase.from("admin_card_positions").delete().eq("user_id", user.id);
        await supabase.from("admin_categories").delete().eq("user_id", user.id);

        // Insert categories
        const catInserts = cats.map((c, i) => ({
          id: c.id.startsWith("default-") ? undefined : c.id,
          user_id: user.id,
          name: c.name,
          sort_order: i,
        }));

        const { data: insertedCats } = await supabase
          .from("admin_categories")
          .insert(catInserts)
          .select();

        if (!insertedCats) return;

        // Map old IDs to new IDs
        const idMap = new Map<string, string>();
        cats.forEach((c, i) => {
          if (insertedCats[i]) idMap.set(c.id, insertedCats[i].id);
        });

        // Insert card positions
        const posInserts: any[] = [];
        cats.forEach((c) => {
          const newCatId = idMap.get(c.id);
          if (!newCatId) return;
          c.cardKeys.forEach((key, si) => {
            posInserts.push({
              user_id: user.id,
              card_key: key,
              category_id: newCatId,
              sort_order: si,
            });
          });
        });

        if (posInserts.length > 0) {
          await supabase.from("admin_card_positions").insert(posInserts);
        }

        // Update local state with new IDs
        setCategories(cats.map((c, i) => ({
          ...c,
          id: idMap.get(c.id) || c.id,
        })));
      }, 800);
    },
    [user]
  );

  const updateCategories = useCallback(
    (newCats: AdminCategory[]) => {
      setCategories(newCats);
      persistLayout(newCats);
    },
    [persistLayout]
  );

  const addCategory = useCallback(
    (name: string) => {
      const newCat: AdminCategory = {
        id: `new-${Date.now()}`,
        name,
        sort_order: categories.length,
        cardKeys: [],
      };
      updateCategories([...categories, newCat]);
    },
    [categories, updateCategories]
  );

  const deleteCategory = useCallback(
    (catId: string) => {
      // Move cards to first category
      const cat = categories.find((c) => c.id === catId);
      if (!cat) return;
      const remaining = categories.filter((c) => c.id !== catId);
      if (remaining.length > 0 && cat.cardKeys.length > 0) {
        remaining[0] = {
          ...remaining[0],
          cardKeys: [...remaining[0].cardKeys, ...cat.cardKeys],
        };
      }
      updateCategories(remaining);
    },
    [categories, updateCategories]
  );

  const renameCategory = useCallback(
    (catId: string, newName: string) => {
      updateCategories(
        categories.map((c) => (c.id === catId ? { ...c, name: newName } : c))
      );
    },
    [categories, updateCategories]
  );

  return {
    categories,
    loading,
    updateCategories,
    addCategory,
    deleteCategory,
    renameCategory,
  };
}
