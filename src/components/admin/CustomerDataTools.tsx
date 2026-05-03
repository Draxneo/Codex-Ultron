import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Search, Tags } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DuplicateManager } from "@/components/DuplicateManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/formatters";

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  tags: string[] | null;
};

function customerName(customer: CustomerRow) {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || "Unnamed customer";
}

function normalizeTag(tag: string) {
  return tag.trim().replace(/\s+/g, " ");
}

export function CustomerDataTools() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState<"add" | "remove">("add");

  const normalizedTag = normalizeTag(tag);
  const canSearch = search.trim().length >= 2;

  const { data: customers = [], isFetching, refetch } = useQuery({
    queryKey: ["customer-data-tool-preview", search],
    enabled: canSearch,
    queryFn: async () => {
      const term = search.trim();
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, company, phone, email, tags")
        .or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,address.ilike.%${term}%,city.ilike.%${term}%`,
        )
        .order("last_name", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as CustomerRow[];
    },
  });

  const affectedCount = useMemo(() => {
    if (!normalizedTag) return 0;
    return customers.filter((customer) => {
      const tags = customer.tags || [];
      return mode === "add" ? !tags.includes(normalizedTag) : tags.includes(normalizedTag);
    }).length;
  }, [customers, mode, normalizedTag]);

  const bulkTag = useMutation({
    mutationFn: async () => {
      if (!normalizedTag) throw new Error("Enter a tag first.");
      if (!customers.length) throw new Error("Search for customers first.");

      const updates = customers
        .map((customer) => {
          const currentTags = customer.tags || [];
          const nextTags =
            mode === "add"
              ? Array.from(new Set([...currentTags, normalizedTag]))
              : currentTags.filter((existingTag) => existingTag !== normalizedTag);

          if (nextTags.length === currentTags.length && nextTags.every((value, index) => value === currentTags[index])) {
            return null;
          }

          return supabase.from("customers").update({ tags: nextTags }).eq("id", customer.id);
        })
        .filter(Boolean) as ReturnType<typeof supabase.from>[];

      for (const update of updates) {
        const { error } = await update;
        if (error) throw error;
      }

      return updates.length;
    },
    onSuccess: (count) => {
      toast({
        title: mode === "add" ? "Tag added" : "Tag removed",
        description: `${count} customer record${count === 1 ? "" : "s"} updated.`,
      });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer_names"] });
      queryClient.invalidateQueries({ queryKey: ["customer-data-tool-preview"] });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Bulk tag failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            Customer Data Tools
          </CardTitle>
          <CardDescription>
            Use these when UltraOffice data needs to be cleaned, tagged, or consolidated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_1fr_auto]">
            <div className="grid gap-2">
              <Label htmlFor="customer-tool-search">Find customers</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="customer-tool-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, phone, email, city..."
                  className="pl-8"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Action</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as "add" | "remove")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add tag</SelectItem>
                  <SelectItem value="remove">Remove tag</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="customer-tool-tag">Tag</Label>
              <Input
                id="customer-tool-tag"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                placeholder="Comfort Club, VIP, Install..."
              />
            </div>

            <div className="flex items-end">
              <Button
                className="w-full gap-1.5"
                disabled={!canSearch || !normalizedTag || affectedCount === 0 || bulkTag.isPending}
                onClick={() => bulkTag.mutate()}
              >
                <Tags className="h-4 w-4" />
                {bulkTag.isPending ? "Updating..." : `${mode === "add" ? "Add" : "Remove"} tag`}
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
              <span className="font-medium">
                {canSearch ? `${customers.length} matching customers` : "Enter at least 2 characters to preview"}
              </span>
              {canSearch && normalizedTag && (
                <Badge variant="secondary">{affectedCount} will change</Badge>
              )}
            </div>
            <div className="max-h-80 overflow-auto divide-y">
              {isFetching && <p className="p-3 text-sm text-muted-foreground">Loading customers...</p>}
              {!isFetching && canSearch && customers.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No customers matched that search.</p>
              )}
              {!isFetching &&
                customers.map((customer) => (
                  <div key={customer.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-medium">{customerName(customer)}</span>
                    {customer.phone && <span className="text-muted-foreground">{formatPhone(customer.phone) || customer.phone}</span>}
                    {customer.email && <span className="text-muted-foreground">{customer.email}</span>}
                    <div className="ml-auto flex flex-wrap gap-1">
                      {(customer.tags || []).map((customerTag) => (
                        <Badge key={customerTag} variant="outline" className="text-[10px]">
                          {customerTag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <DuplicateManager />
    </div>
  );
}
