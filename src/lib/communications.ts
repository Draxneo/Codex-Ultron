import { normalizeLast10, toE164 } from "@/lib/formatters";

export type ContactType = "employee" | "customer" | "vendor";

export type ContactLookup = {
  name: string;
  type: ContactType;
  id?: string | null;
  email?: string | null;
  address?: string | null;
};

export type ContactLookupMap = Record<string, ContactLookup>;

/** Normalize any phone to E.164 (+1XXXXXXXXXX) for consistent thread grouping. */
export function toE164Key(phone: string | null | undefined): string {
  return toE164(phone) ?? String(phone ?? "");
}

export function addContactLookup(
  map: ContactLookupMap,
  phone: string | null | undefined,
  contact: ContactLookup,
  options: { overwrite?: boolean } = {}
) {
  const key = normalizeLast10(phone);
  if (!key) return;
  if (options.overwrite || !map[key]) map[key] = contact;
}

export function buildCustomerDisplayName(customer: {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
}): string {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || "";
}

export function resolveContactFromLookup(
  map: ContactLookupMap,
  phone: string | null | undefined,
  dbName: string | null,
  dbType: string | null
): { name: string | null; type: string } {
  if (dbName && dbType && dbType !== "unknown") return { name: dbName, type: dbType };
  const key = normalizeLast10(phone);
  const match = key ? map[key] : undefined;
  if (match) return { name: match.name, type: match.type };
  return { name: dbName, type: dbType || "unknown" };
}
