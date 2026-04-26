/**
 * SeedRepairCatalogButton — Admin-only one-shot importer trigger.
 *
 * Calls the `seed-repair-catalog` edge function, which embeds the
 * 100-row San Antonio repair pricing dataset and merges into
 * `repair_catalog` with smart description preservation.
 */
import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";

interface SeedResult {
  ok: boolean;
  total: number;
  inserted: number;
  updated: number;
  descriptions_merged: number;
  descriptions_replaced: number;
  descriptions_kept: number;
  errors: string[];
}

export function SeedRepairCatalogButton() {
  const { role, loading } = useEffectiveAuth() as { role: string | null; loading: boolean };
  const [running, setRunning] = useState(false);
  const qc = useQueryClient();

  // Hide while auth still loading
  if (loading) return null;
  // Hidden for non-admins (log so we can debug if a real admin gets hidden)
  if (role !== "admin") {
    if (typeof window !== "undefined") {
      console.debug("[SeedRepairCatalogButton] hidden — effective role is", role);
    }
    return null;
  }

  const handleSeed = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke<SeedResult>(
        "seed-repair-catalog",
        { body: {} },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error("Seed function returned an error");

      const lines = [
        `${data.inserted} inserted`,
        `${data.updated} updated`,
        data.descriptions_merged > 0 &&
          `${data.descriptions_merged} descriptions merged`,
        data.descriptions_replaced > 0 &&
          `${data.descriptions_replaced} descriptions replaced`,
        data.descriptions_kept > 0 &&
          `${data.descriptions_kept} descriptions kept`,
      ].filter(Boolean);

      toast({
        title: `Seed complete (${data.total} rows)`,
        description: lines.join(" · "),
      });

      if (data.errors?.length) {
        console.warn("Seed errors:", data.errors);
        toast({
          title: `${data.errors.length} row(s) had errors`,
          description: "Check console for details.",
          variant: "destructive",
        });
      }

      qc.invalidateQueries({ queryKey: ["repair-catalog"] });
      qc.invalidateQueries({ queryKey: ["repair_catalog_csv_io"] });
      qc.invalidateQueries({ queryKey: ["repair_catalog_for_pricing"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Seed failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={running}>
          {running ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Database className="h-4 w-4 mr-1" />
          )}
          Seed San Antonio Pricing
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Seed repair catalog?</AlertDialogTitle>
          <AlertDialogDescription>
            Imports 100 repairs from the San Antonio pricing dataset into
            <code className="mx-1 px-1 bg-muted rounded text-xs">
              repair_catalog
            </code>
            . Existing rows are matched by name and have prices overwritten;
            customer descriptions are smart-merged (longer/better copy wins,
            broken copy is replaced). New rows are inserted with fresh IDs.
            <br />
            <br />
            <strong>Idempotent</strong> — safe to run multiple times.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSeed}>
            Run seed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
