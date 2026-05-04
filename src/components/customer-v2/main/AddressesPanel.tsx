import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, Star, Plus, ChevronDown } from "lucide-react";
import { PropertyCard } from "@/components/PropertyCard";
import { AddressesMap } from "./AddressesMap";

interface Props {
  addresses: any[];
  customer?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
}

// Strip ZIP/state/city tail accidentally embedded in street, lower-case, collapse whitespace,
// normalize common abbreviations so "2667 West Mulberry Avenue" == "2667 W Mulberry Ave"
function normalizeStreet(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).toLowerCase().trim();
  // Strip trailing ", city, ST zip" if HCP shoved it into street
  s = s.replace(/,\s*[a-z\s]+,\s*[a-z]{2}\s*\d{5}.*$/i, "");
  s = s.replace(/[.,]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // Common street suffix normalization
  const suffixMap: Record<string, string> = {
    avenue: "ave", av: "ave",
    street: "st",
    drive: "dr",
    road: "rd",
    boulevard: "blvd", blvd: "blvd",
    lane: "ln",
    court: "ct",
    place: "pl",
    parkway: "pkwy",
    highway: "hwy",
    trail: "trl",
    terrace: "ter",
    circle: "cir",
    way: "way",
    west: "w", east: "e", north: "n", south: "s",
  };
  s = s
    .split(" ")
    .map((tok) => suffixMap[tok] ?? tok)
    .join(" ");
  return s;
}

function normalizeUnit(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).toLowerCase().replace(/^(unit|apt|suite|ste|#)\s*/i, "").trim();
}

function dedupeKey(a: any): string {
  return [normalizeStreet(a.street), normalizeUnit(a.street_line_2), (a.zip || "").trim()]
    .join("|");
}

export function AddressesPanel({ addresses, customer }: Props) {
  // Fallback: if no rows in customer_addresses but the customer record itself
  // has an address, synthesize a single entry so we don't show "No addresses"
  // for legacy/HCP customers whose address only lives on the customers table.
  const effectiveAddresses = useMemo(() => {
    if (addresses && addresses.length > 0) return addresses;
    if (customer && (customer.address || customer.city || customer.zip)) {
      return [{
        id: "customer-fallback",
        street: customer.address || "",
        street_line_2: null,
        city: customer.city || "",
        state: customer.state || "",
        zip: customer.zip || "",
        is_primary: true,
        address_type: "service",
      }];
    }
    return [];
  }, [addresses, customer]);

  const grouped = useMemo(() => {
    const map = new Map<string, { primary: any; dupes: any[] }>();
    for (const a of effectiveAddresses) {
      const key = dedupeKey(a);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { primary: a, dupes: [] });
      } else {
        // Prefer the row marked is_primary, otherwise the one with more complete data
        const incomingScore =
          (a.is_primary ? 10 : 0) +
          (a.city ? 1 : 0) +
          (a.state ? 1 : 0) +
          (a.zip ? 1 : 0) +
          (a.street_line_2 ? 1 : 0);
        const currentScore =
          (existing.primary.is_primary ? 10 : 0) +
          (existing.primary.city ? 1 : 0) +
          (existing.primary.state ? 1 : 0) +
          (existing.primary.zip ? 1 : 0) +
          (existing.primary.street_line_2 ? 1 : 0);
        if (incomingScore > currentScore) {
          existing.dupes.push(existing.primary);
          existing.primary = a;
        } else {
          existing.dupes.push(a);
        }
      }
    }
    // Sort: primary addresses first, then by street
    return Array.from(map.values()).sort((a, b) => {
      if (a.primary.is_primary && !b.primary.is_primary) return -1;
      if (!a.primary.is_primary && b.primary.is_primary) return 1;
      return (a.primary.street || "").localeCompare(b.primary.street || "");
    });
  }, [effectiveAddresses]);

  const totalCount = effectiveAddresses.length;
  const uniqueCount = grouped.length;

  return (
    <Card className="p-4 shadow-none border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">
          {uniqueCount} {uniqueCount === 1 ? "address" : "addresses"}
          {totalCount > uniqueCount && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({totalCount - uniqueCount} duplicate{totalCount - uniqueCount === 1 ? "" : "s"} hidden)
            </span>
          )}
        </h3>
        <Button size="sm" variant="outline" className="gap-1 h-7">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Live Google Map with pins for each address */}
      <div className="mb-3">
        <AddressesMap
          addresses={grouped
            .map(({ primary: a }) => ({
              id: a.id,
              fullAddress: [a.street, a.city, a.state, a.zip].filter(Boolean).join(", "),
              isPrimary: !!a.is_primary,
            }))
            .filter((a) => a.fullAddress)}
        />
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No addresses on file</p>
      ) : (
        <ul className="divide-y">
          {grouped.map(({ primary: a, dupes }) => {
            const fullAddress = [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ");
            return (
              <li key={a.id} className="py-2.5">
                <div className="flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium break-words">{a.street}</span>
                      {a.is_primary && <Star className="h-3 w-3 fill-primary text-primary" />}
                      {dupes.length > 0 && (
                        <span
                          className="text-[10px] text-muted-foreground border rounded px-1 py-px"
                          title={`${dupes.length + 1} HCP records merged`}
                        >
                          ×{dupes.length + 1}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground break-words">
                      {[a.street_line_2, a.city, a.state, a.zip].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>

                {/* Home info — auto-load for primary, on-demand for others */}
                {fullAddress && a.is_primary && (
                  <div className="mt-2.5">
                    <PropertyCard address={fullAddress} />
                  </div>
                )}
                {fullAddress && !a.is_primary && (
                  <SecondaryHomeInfo address={fullAddress} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SecondaryHomeInfo({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2 ml-6">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground">
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Hide" : "Show"} home info
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <PropertyCard address={address} />
      </CollapsibleContent>
    </Collapsible>
  );
}
