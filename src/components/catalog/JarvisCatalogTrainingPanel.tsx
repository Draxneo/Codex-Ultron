import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Check, FlaskConical, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  interpretTechCartSpeech,
  type TechCartEquipmentMatchup,
  type TechCartRepairCatalogItem,
  type TechCartTrainingTerm,
} from "@/lib/techCartInterpreter";

type CatalogTerm = TechCartTrainingTerm & {
  id: string;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TargetType = "repair" | "equipment";

function targetLabel(type: TargetType, id: string, repairs: TechCartRepairCatalogItem[], equipment: TechCartEquipmentMatchup[]) {
  if (type === "repair") {
    const item = repairs.find((repair) => repair.id === id);
    return item ? `${item.name}${item.category ? ` · ${item.category}` : ""}` : "Unknown repair";
  }
  const item = equipment.find((matchup) => matchup.id === id);
  if (!item) return "Unknown equipment";
  return [item.brand, item.tonnage ? `${item.tonnage} Ton` : null, item.tier, item.system_type, item.application]
    .filter(Boolean)
    .join(" · ");
}

function normalizePhrase(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function JarvisCatalogTrainingPanel() {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<TargetType>("repair");
  const [targetId, setTargetId] = useState("");
  const [phrase, setPhrase] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [testPhrase, setTestPhrase] = useState("");

  const { data: repairs = [], isLoading: repairsLoading } = useQuery({
    queryKey: ["jarvis-training-repairs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_catalog")
        .select("id, name, category, tech_description, customer_description, keywords, default_severity, base_price, member_price, is_active")
        .eq("is_active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return (data || []) as TechCartRepairCatalogItem[];
    },
  });

  const { data: equipment = [], isLoading: equipmentLoading } = useQuery({
    queryKey: ["jarvis-training-equipment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_matchups" as any)
        .select("id, brand, system_type, tier, application, condenser_model, furnace_model, coil_model, tonnage, seer2, eer2, hspf2, cooling_cap, afue, ahri_number, ahri_certificate_path, heat_kit, total_price, factory_rebate_price, monthly_payment, monthly_payment_120, cps_tonnage, early_rebate, burnout_rebate, notes, low_margin_price, cps_rebate_tier, features_benefits, image_url")
        .order("brand")
        .order("tonnage")
        .order("tier");
      if (error) throw error;
      return (data || []) as TechCartEquipmentMatchup[];
    },
  });

  const { data: terms = [], isLoading: termsLoading, isError } = useQuery({
    queryKey: ["jarvis-catalog-terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jarvis_catalog_terms" as any)
        .select("*")
        .order("status")
        .order("target_type")
        .order("phrase");
      if (error) throw error;
      return (data || []) as CatalogTerm[];
    },
  });

  const targetOptions = useMemo(() => {
    const options = targetType === "repair"
      ? repairs.map((item) => ({ id: item.id, label: targetLabel("repair", item.id, repairs, equipment) }))
      : equipment.map((item) => ({ id: item.id, label: targetLabel("equipment", item.id, repairs, equipment) }));
    const q = search.trim().toLowerCase();
    if (!q) return options.slice(0, 100);
    return options.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 100);
  }, [equipment, repairs, search, targetType]);

  const approvedTerms = useMemo(() => terms.filter((term) => (term.status || "approved") === "approved"), [terms]);
  const suggestedTerms = terms.filter((term) => term.status === "suggested");
  const visibleTerms = terms.filter((term) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      term.phrase.toLowerCase().includes(q) ||
      targetLabel(term.target_type, term.target_id, repairs, equipment).toLowerCase().includes(q)
    );
  });

  const testResult = testPhrase.trim()
    ? interpretTechCartSpeech(testPhrase, repairs, equipment, approvedTerms)
    : null;

  const addTerm = useMutation({
    mutationFn: async () => {
      const cleanPhrase = normalizePhrase(phrase);
      if (!cleanPhrase) throw new Error("Add the words your technician would actually say.");
      if (!targetId) throw new Error("Choose the catalog item this phrase should point to.");
      const { error } = await supabase.from("jarvis_catalog_terms" as any).insert({
        target_type: targetType,
        target_id: targetId,
        phrase: cleanPhrase,
        status: "approved",
        source: "admin",
        confidence: 1,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Jarvis learned that phrase" });
      setPhrase("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["jarvis-catalog-terms"] });
      queryClient.invalidateQueries({ queryKey: ["jarvis-catalog-terms-tech-jarvis"] });
    },
    onError: (error: any) => {
      toast({ title: "Could not save phrase", description: error?.message, variant: "destructive" });
    },
  });

  const updateTerm = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CatalogTerm> }) => {
      const { error } = await supabase.from("jarvis_catalog_terms" as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jarvis-catalog-terms"] });
      queryClient.invalidateQueries({ queryKey: ["jarvis-catalog-terms-tech-jarvis"] });
    },
    onError: (error: any) => {
      toast({ title: "Training update failed", description: error?.message, variant: "destructive" });
    },
  });

  const deleteTerm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jarvis_catalog_terms" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Phrase removed" });
      queryClient.invalidateQueries({ queryKey: ["jarvis-catalog-terms"] });
      queryClient.invalidateQueries({ queryKey: ["jarvis-catalog-terms-tech-jarvis"] });
    },
  });

  const busy = repairsLoading || equipmentLoading || termsLoading;

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            Jarvis technician vocabulary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-[1fr_auto] md:items-center">
          <p>
            Teach Jarvis the words your techs actually use, then point each phrase at the real repair card or equipment matchup.
            Suggested phrases can be approved here after Jarvis gets corrected.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{approvedTerms.length} approved</Badge>
            <Badge variant={suggestedTerms.length ? "default" : "outline"}>{suggestedTerms.length} suggested</Badge>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
          Jarvis vocabulary table is not available yet. Apply the latest database migration, then refresh this page.
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Add a field phrase
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={targetType} onValueChange={(value) => { setTargetType(value as TargetType); setTargetId(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repair">Repair card</SelectItem>
                  <SelectItem value="equipment">Equipment matchup</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search target..." className="pl-8" />
              </div>
            </div>

            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue placeholder={targetType === "repair" ? "Choose repair card" : "Choose equipment matchup"} />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder='Example: "35x5 run cap" or "quiet attic package"'
            />
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note about when this phrase should be used."
              rows={3}
            />
            <Button className="w-full gap-2" disabled={addTerm.isPending || busy} onClick={() => addTerm.mutate()}>
              {addTerm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Teach Jarvis
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4" />
              Test what Jarvis hears
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={testPhrase}
              onChange={(e) => setTestPhrase(e.target.value)}
              placeholder='Try: "I need a two-pole contactor"'
            />
            <div className="min-h-28 rounded-lg border bg-muted/20 p-3">
              {!testResult ? (
                <p className="text-sm text-muted-foreground">Type a phrase to preview the repair or equipment match.</p>
              ) : testResult.matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No confident match yet. Add a phrase on the left to teach Jarvis.</p>
              ) : (
                <div className="space-y-2">
                  {testResult.matches.slice(0, 4).map((match) => (
                    <div key={match.id} className="rounded-md border bg-background p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{match.name}</p>
                          <p className="text-xs text-muted-foreground">{match.description || "No description yet."}</p>
                        </div>
                        <Badge variant="outline" className="capitalize">{match.confidence}</Badge>
                      </div>
                      {match.missingSpecs.length > 0 && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Needs: {match.missingSpecs.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vocabulary list</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {busy ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Jarvis vocabulary...
            </div>
          ) : visibleTerms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No training phrases yet.</p>
          ) : (
            visibleTerms.map((term) => (
              <div key={term.id} className="grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">"{term.phrase}"</p>
                    <Badge variant={term.target_type === "repair" ? "secondary" : "outline"}>{term.target_type}</Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        term.status === "approved" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        term.status === "suggested" && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                        term.status === "rejected" && "border-destructive/40 bg-destructive/10 text-destructive",
                      )}
                    >
                      {term.status || "approved"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {targetLabel(term.target_type, term.target_id, repairs, equipment)}
                  </p>
                  {term.notes && <p className="mt-1 text-xs text-muted-foreground">{term.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {term.status !== "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => updateTerm.mutate({ id: term.id, updates: { status: "approved", confidence: 1 } })}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                  )}
                  {term.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => updateTerm.mutate({ id: term.id, updates: { status: "rejected" } })}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteTerm.mutate(term.id)}
                    title="Delete phrase"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
