import { useState } from "react";
import { AddressLink } from "@/components/AddressLink";
import { useSupplyHouseLocations, SearchResult, SupplyHouseLocation } from "@/hooks/useSupplyHouseLocations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Mail, Clock, Globe, Search, Loader2, Check, X, Pencil, User, Hash } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { Badge } from "@/components/ui/badge";

export default function SupplyHouseLocations() {
  const {
    locations, supplyHouses, isLoading,
    searchLocations, saveLocation, updateLocation, searchResults, dismissResult,
  } = useSupplyHouseLocations();
  const [filterHouse, setFilterHouse] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = filterHouse === "all"
    ? locations
    : locations.filter((l) => l.supply_house_id === filterHouse);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterHouse} onValueChange={setFilterHouse}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Supply Houses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Supply Houses</SelectItem>
            {supplyHouses.map((sh) => (
              <SelectItem key={sh.id} value={sh.id}>{sh.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => searchLocations.mutate()}
          disabled={searchLocations.isPending}
        >
          {searchLocations.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Search className="h-4 w-4 mr-1" />
          )}
          Search Web for Locations
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} saved location{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Search Results Review Panel */}
      {searchResults.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search Results — Review &amp; Save
              <Badge variant="secondary" className="ml-auto">{searchResults.length} found</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {searchResults.map((result, idx) => (
              <SearchResultRow
                key={`${result.branch_name}-${idx}`}
                result={result}
                onSave={() => saveLocation.mutate(result)}
                onDismiss={() => dismissResult(result)}
                isSaving={saveLocation.isPending}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Saved Locations */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No locations saved yet. Click "Search Web for Locations" to find them.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              isEditing={editingId === loc.id}
              onEdit={() => setEditingId(editingId === loc.id ? null : loc.id)}
              onSave={(updates) => {
                updateLocation.mutate({ id: loc.id, updates });
                setEditingId(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LocationCard({
  loc,
  isEditing,
  onEdit,
  onSave,
}: {
  loc: SupplyHouseLocation;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: { account_number: string | null; rep_name: string | null; rep_phone: string | null }) => void;
}) {
  const [accountNumber, setAccountNumber] = useState(loc.account_number || "");
  const [repName, setRepName] = useState(loc.rep_name || "");
  const [repPhone, setRepPhone] = useState(loc.rep_phone || "");

  // Supply house-level fields (from parent supply_house record)
  const orderingUrl = (loc as any).supply_house?.ordering_url || "";
  const brandAffinity = (loc as any).supply_house?.brand_affinity || [];

  const handleSave = () => {
    onSave({
      account_number: accountNumber.trim() || null,
      rep_name: repName.trim() || null,
      rep_phone: repPhone.trim() || null,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{loc.branch_name.replace(/[\\/]+$/, "").trim()}</CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            {loc.supply_house && (
              <Badge variant="secondary" className="text-xs">
                {loc.supply_house.name}
              </Badge>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}>
              Account Info
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {/* Free OpenStreetMap static tile */}
        {loc.latitude && loc.longitude && (
          <div className="rounded-md overflow-hidden border mb-2" style={{ height: 160 }}>
            <iframe
              src={`https://maps.google.com/maps?q=${loc.latitude},${loc.longitude}&z=14&output=embed`}
              title={`Map of ${loc.branch_name}`}
              className="w-full h-full border-0"
              loading="lazy"
              allowFullScreen={false}
            />
          </div>
        )}
        {loc.address && (
          <AddressLink
            address={[loc.address, loc.city, [loc.state, loc.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
            className="text-sm text-muted-foreground"
            iconClassName="h-4 w-4 mt-0.5"
          />
        )}
        {loc.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <ClickToCall phone={loc.phone} className="text-primary hover:underline" showIcon={false} />
            <SmsButton phone={loc.phone} iconClassName="h-3.5 w-3.5" />
          </div>
        )}
        {loc.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <a href={`mailto:${loc.email}`} className="text-primary hover:underline">{loc.email}</a>
          </div>
        )}
        {loc.hours && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{loc.hours}</span>
          </div>
        )}
        {loc.website_url && (
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <a href={loc.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
              Website
            </a>
          </div>
        )}

        {/* Account & Rep info */}
        {isEditing ? (
          <div className="pt-2 border-t space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Account Number</label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 12345"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Rep Name</label>
              <Input
                value={repName}
                onChange={(e) => setRepName(e.target.value)}
                placeholder="e.g. John Smith"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Rep Phone</label>
              <Input
                value={repPhone}
                onChange={(e) => setRepPhone(e.target.value)}
                placeholder="e.g. (210) 555-1234"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleSave}>
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (loc.account_number || loc.rep_name || brandAffinity.length > 0) ? (
          <div className="pt-2 border-t space-y-1">
            {brandAffinity.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">Brands:</span>
                {brandAffinity.map((b: string) => (
                  <Badge key={b} variant="outline" className="text-[10px]">{b}</Badge>
                ))}
              </div>
            )}
            {orderingUrl && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={orderingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate">
                  Ordering Portal
                </a>
              </div>
            )}
            {loc.account_number && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="h-4 w-4 shrink-0" />
                <span>Acct: {loc.account_number}</span>
              </div>
            )}
            {loc.rep_name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4 shrink-0" />
                <span>{loc.rep_name}</span>
                {loc.rep_phone && (
                  <>
                    <ClickToCall phone={loc.rep_phone} contactName={loc.rep_name ?? undefined} className="text-primary hover:underline text-xs ml-1" showIcon={false} />
                    <SmsButton phone={loc.rep_phone} iconClassName="h-3 w-3" />
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SearchResultRow({
  result,
  onSave,
  onDismiss,
  isSaving,
}: {
  result: SearchResult;
  onSave: () => void;
  onDismiss: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border bg-background">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="font-medium text-sm">{result.branch_name}</div>
        <div className="text-xs text-muted-foreground">
          {[result.address, result.city, result.state, result.zip].filter(Boolean).join(", ")}
        </div>
        {result.phone && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" /> {result.phone}
          </div>
        )}
        {result.hours && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {result.hours}
          </div>
        )}
        {result.source_url && (
          <a href={result.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">
            Source
          </a>
        )}
      </div>
      <Badge variant="outline" className="shrink-0 text-xs">{result.supply_house_name}</Badge>
      <div className="flex gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={onSave} disabled={isSaving}>
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
