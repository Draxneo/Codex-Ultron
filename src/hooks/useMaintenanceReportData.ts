/**
 * useMaintenanceReportData — Given a job_id, queries tech_form_responses,
 * tech_form_photos, jobs, and tech_form_fields to build the data structures
 * needed by MaintenanceReportPreview.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Season = "cooling" | "heating";
type GradeLevel = "A" | "B" | "C" | "D" | "F";

export interface SystemGrade {
  system: string;
  grade: GradeLevel;
  summary: string;
  items: { label: string; status: "pass" | "marginal" | "fail"; note?: string }[];
}

export interface ReadingItem {
  label: string;
  value: string;
  unit: string;
  status: "normal" | "marginal" | "critical";
  range?: string;
}

export interface RepairItem {
  item: string;
  price: number;
}

export interface MaintenanceReportData {
  season: Season;
  customerName: string;
  address: string;
  date: string;
  systems: SystemGrade[];
  readings: ReadingItem[];
  photos: { url: string; label: string }[];
  repairs: { necessary: RepairItem[]; recommended: RepairItem[]; deluxe: RepairItem[] };
  isLoading: boolean;
}

// Map field labels to reading metadata
const READING_MAP: Record<string, { unit: string; range?: string }> = {
  "Suction Pressure (PSI)": { unit: "psig", range: "60–75 psig" },
  "Liquid Pressure (PSI)": { unit: "psig", range: "200–250 psig" },
  "Supply Air Temp (°F)": { unit: "°F" },
  "Return Air Temp (°F)": { unit: "°F" },
  "Temp Split (°F)": { unit: "°F", range: "16–22°F" },
  "Superheat / Subcool": { unit: "°F" },
  "Capacitor Reading (µF)": { unit: "µF" },
  "Amp Draw": { unit: "A" },
  "Voltage": { unit: "V", range: "216–264V" },
};

const DIAGNOSIS_FIELDS = new Set(Object.keys(READING_MAP));

function inferStatus(value: string): "normal" | "marginal" | "critical" {
  // Simple heuristic — can be improved with spec ranges later
  const num = parseFloat(value);
  if (isNaN(num)) return "normal";
  return "normal";
}

function buildChecklistSystems(
  fields: any[],
  responses: Map<string, string>,
): SystemGrade[] {
  // Group checklist fields by a rough system category
  const systemMap: Record<string, { label: string; status: "pass" | "marginal" | "fail"; note?: string }[]> = {
    "System Checklist": [],
  };

  for (const field of fields) {
    if (field.step_group !== "checklist") continue;
    const val = responses.get(field.id);
    let status: "pass" | "marginal" | "fail" = "pass";
    if (val === "false" || val === "no" || val === "Poor" || val === "Bad") status = "fail";
    else if (val === "Fair" || val === "Marginal") status = "marginal";
    else if (!val) status = "marginal"; // unanswered

    systemMap["System Checklist"].push({
      label: field.label,
      status,
      note: val && val !== "true" && val !== "false" ? val : undefined,
    });
  }

  return Object.entries(systemMap).map(([system, items]) => {
    const failCount = items.filter(i => i.status === "fail").length;
    const marginalCount = items.filter(i => i.status === "marginal").length;
    const total = items.length || 1;
    const score = (total - failCount * 2 - marginalCount * 0.5) / total;

    let grade: GradeLevel = "A";
    if (score < 0.3) grade = "F";
    else if (score < 0.5) grade = "D";
    else if (score < 0.7) grade = "C";
    else if (score < 0.9) grade = "B";

    const summary = grade === "A" ? "All items passed inspection."
      : grade === "B" ? "Most items passed with minor notes."
      : `${failCount} item(s) need attention.`;

    return { system, grade, summary, items };
  });
}

export function useMaintenanceReportData(jobId: string | undefined) {
  return useQuery({
    queryKey: ["maintenance-report-data", jobId],
    enabled: !!jobId,
    queryFn: async (): Promise<Omit<MaintenanceReportData, "isLoading">> => {
      // Fetch job info
      const { data: job } = await supabase
        .from("jobs")
        .select("id, season, customer_id, scheduled_date, customers(first_name, last_name, address, city, state, zip)")
        .eq("id", jobId!)
        .single();

      const season: Season = (job?.season as Season) || "cooling";
      const customer = (job as any)?.customers;
      const customerName = customer ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim() : "Customer";
      const address = customer ? [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ") : "";
      const date = job?.scheduled_date || new Date().toISOString().split("T")[0];

      // Fetch tech_form for this job
      const { data: techForms } = await supabase
        .from("tech_forms" as any)
        .select("id")
        .eq("job_id", jobId!) as any;
      const techFormId = (techForms as any[])?.[0]?.id;

      // Fetch fields
      const { data: fieldsRaw } = await supabase
        .from("tech_form_fields" as any)
        .select("*")
        .eq("job_type", "maintenance")
        .order("sort_order");
      const fields = (fieldsRaw || []) as any[];

      // Fetch responses
      const responses = new Map<string, string>();
      if (techFormId) {
        const { data: respData } = await supabase
          .from("tech_form_responses" as any)
          .select("field_id, value")
          .eq("tech_form_id", techFormId);
        for (const r of (respData || []) as any[]) {
          responses.set(r.field_id, r.value);
        }
      }

      // Build systems from checklist
      const systems = buildChecklistSystems(fields, responses);

      // Build readings from diagnosis fields
      const readings: ReadingItem[] = [];
      for (const field of fields) {
        if (field.step_group !== "diagnosis") continue;
        const val = responses.get(field.id);
        if (!val) continue;
        const meta = READING_MAP[field.label] || { unit: "" };
        readings.push({
          label: field.label.replace(/\s*\(.*\)$/, ""),
          value: val,
          unit: meta.unit,
          status: inferStatus(val),
          range: meta.range,
        });
      }

      // Fetch photos
      const photos: { url: string; label: string }[] = [];
      if (techFormId) {
        const { data: photoData } = await supabase
          .from("tech_form_photos" as any)
          .select("file_path, photo_type")
          .eq("tech_form_id", techFormId);
        for (const p of (photoData || []) as any[]) {
          const { data: urlData } = supabase.storage
            .from("tech-form-photos")
            .getPublicUrl(p.file_path);
          photos.push({
            url: urlData.publicUrl,
            label: p.photo_type || "Photo",
          });
        }
      }

      // Build repairs from notes/recommendations
      const recsField = fields.find((f: any) => f.label === "Recommendations" && f.step_group === "notes");
      const recsVal = recsField ? responses.get(recsField.id) : null;
      const repairs = { necessary: [] as RepairItem[], recommended: [] as RepairItem[], deluxe: [] as RepairItem[] };
      if (recsVal) {
        // Parse simple line-separated recommendations
        const lines = recsVal.split("\n").filter(Boolean);
        for (const line of lines) {
          repairs.recommended.push({ item: line.trim(), price: 0 });
        }
      }

      return { season, customerName, address, date, systems, readings, photos, repairs };
    },
  });
}
