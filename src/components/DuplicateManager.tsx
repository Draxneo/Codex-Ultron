import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Users, Merge, AlertTriangle, CheckCircle2, Loader2, Phone, Mail, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface DupeRow {
  group_id: number;
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  hcp_customer_id: string | null;
  job_count: number;
  created_at: string;
}

interface DupeGroup {
  groupId: number;
  members: DupeRow[];
  suggestedKeeper: string;
}

function groupDuplicates(rows: DupeRow[]): DupeGroup[] {
  const map = new Map<number, DupeRow[]>();
  for (const r of rows) {
    const arr = map.get(r.group_id) || [];
    arr.push(r);
    map.set(r.group_id, arr);
  }
  return Array.from(map.entries()).map(([groupId, members]) => {
    // Suggest keeper: prefer one with hcp_customer_id, most jobs, then oldest
    const sorted = [...members].sort((a, b) => {
      if (a.hcp_customer_id && !b.hcp_customer_id) return -1;
      if (!a.hcp_customer_id && b.hcp_customer_id) return 1;
      if (b.job_count !== a.job_count) return b.job_count - a.job_count;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return { groupId, members: sorted, suggestedKeeper: sorted[0].customer_id };
  });
}

function CustomerLabel({ row, isKeeper }: { row: DupeRow; isKeeper: boolean }) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unknown";
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border transition-colors",
      isKeeper ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/30"
    )}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{name}</span>
          {isKeeper && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">KEEP</Badge>}
          {row.hcp_customer_id && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">HCP</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
          {(row.phone || row.mobile_phone) && (
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.phone || row.mobile_phone}</span>
          )}
          {row.email && (
            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{row.email}</span>
          )}
          <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{row.job_count} jobs</span>
        </div>
      </div>
    </div>
  );
}

export function DuplicateManager() {
  const queryClient = useQueryClient();
  const [merging, setMerging] = useState<number | null>(null);

  const { data: groups, isLoading, refetch } = useQuery({
    queryKey: ["duplicate_customers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("find_duplicate_customers");
      if (error) throw error;
      return groupDuplicates((data || []) as unknown as DupeRow[]);
    },
  });

  const handleMerge = async (group: DupeGroup) => {
    setMerging(group.groupId);
    try {
      const dupes = group.members.filter(m => m.customer_id !== group.suggestedKeeper);
      for (const dupe of dupes) {
        const { data, error } = await supabase.rpc("merge_customers", {
          keep_id: group.suggestedKeeper,
          remove_id: dupe.customer_id,
        });
        if (error) throw error;
        console.log("Merge result:", data);
      }
      toast({
        title: "Merged successfully",
        description: `${dupes.length} duplicate(s) merged into primary record.`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (e: any) {
      toast({ title: "Merge failed", description: e.message, variant: "destructive" });
    } finally {
      setMerging(null);
    }
  };

  const handleMergeAll = async () => {
    if (!groups?.length) return;
    setMerging(-1);
    let merged = 0;
    let errors = 0;
    for (const group of groups) {
      try {
        const dupes = group.members.filter(m => m.customer_id !== group.suggestedKeeper);
        for (const dupe of dupes) {
          const { error } = await supabase.rpc("merge_customers", {
            keep_id: group.suggestedKeeper,
            remove_id: dupe.customer_id,
          });
          if (error) throw error;
          merged++;
        }
      } catch {
        errors++;
      }
    }
    toast({
      title: "Bulk merge complete",
      description: `${merged} duplicates merged, ${errors} errors.`,
    });
    refetch();
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    setMerging(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-500" />
              Duplicate Customers
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Detects customers with matching phone numbers. Merge consolidates all jobs, calls, SMS, and agreements.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {groups && groups.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 text-xs"
                onClick={handleMergeAll}
                disabled={merging !== null}
              >
                {merging === -1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />}
                Merge All ({groups.length})
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs" onClick={() => refetch()} disabled={isLoading}>
              Scan
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning for duplicates...
          </div>
        ) : !groups || groups.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> No duplicates found
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.groupId} className="rounded-lg border border-orange-200/50 bg-orange-50/30 dark:border-orange-900/30 dark:bg-orange-950/10 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
                      {group.members.length} duplicates
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-7"
                    onClick={() => handleMerge(group)}
                    disabled={merging !== null}
                  >
                    {merging === group.groupId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Merge className="h-3 w-3" />
                    )}
                    Merge
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {group.members.map((m) => (
                    <CustomerLabel
                      key={m.customer_id}
                      row={m}
                      isKeeper={m.customer_id === group.suggestedKeeper}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
