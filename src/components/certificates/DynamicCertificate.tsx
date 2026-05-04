import { useRef, useEffect, useState, useCallback } from "react";
import { CertificateTemplate } from "./CertificateTemplate";
import { BRAND_LOGOS } from "@/data/brandEngineering";
import { format } from "date-fns";
import type { CertificateTemplate as TemplateType } from "@/hooks/useCertificateTemplates";

interface DynamicCertificateProps {
  template: TemplateType;
  data: Record<string, any>;
}

const SEAL_TEXT_MAP: Record<string, string> = {
  manufacturer_warranty: "WARRANTY",
  labor_warranty: "WARRANTY",
  labor_warranty_10yr: "WARRANTY",
  no_lemon: "GUARANTEE",
  price_match: "GUARANTEE",
  comfort_club: "MEMBER",
};

function resolveVariable(variable: string, data: Record<string, any>, warrantyYears?: number | null): string {
  if (variable === "warrantyYears") return String(warrantyYears ?? data.warrantyYears ?? "");
  if (variable === "expirationDate" && data.installDate && warrantyYears) {
    try {
      const d = new Date(data.installDate);
      d.setFullYear(d.getFullYear() + warrantyYears);
      return format(d, "MMMM d, yyyy");
    } catch { return "—"; }
  }
  if (variable === "installDate" && data.installDate) {
    try { return format(new Date(data.installDate), "MMMM d, yyyy"); } catch { return data.installDate; }
  }
  return data[variable] ?? "";
}

function interpolate(text: string, data: Record<string, any>, warrantyYears?: number | null): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, v) => resolveVariable(v, data, warrantyYears));
}

/** Auto-scaling wrapper: measures content and scales down if it overflows */
function AutoScaleContent({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const recalc = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    // Reset scale to measure natural size
    inner.style.transform = "scale(1)";
    const availH = outer.clientHeight;
    const contentH = inner.scrollHeight;
    if (contentH > availH && contentH > 0) {
      const s = Math.max(0.55, availH / contentH);
      setScale(s);
    } else {
      setScale(1);
    }
  }, []);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [recalc, children]);

  return (
    <div ref={outerRef} className="flex-1 flex flex-col items-center justify-center w-full overflow-hidden">
      <div
        ref={innerRef}
        className="w-full flex flex-col items-center justify-center origin-center"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

export function DynamicCertificate({ template, data }: DynamicCertificateProps) {
  const title = template.display_name;
  const subtitle = interpolate(template.subtitle_template, data, template.warranty_years);
  const bodyText = interpolate(template.body_template, data, template.warranty_years);
  const brandLogo = data.brand ? BRAND_LOGOS[data.brand] || undefined : undefined;
  const sealText = SEAL_TEXT_MAP[template.type_key] || "CERTIFIED";

  const fields = (template.fields_schema || []).map((f) => ({
    label: f.label,
    value: resolveVariable(f.variable, data, template.warranty_years),
  })).filter((f) => f.value);

  return (
    <CertificateTemplate title={title} subtitle={subtitle} brandLogo={brandLogo} sealText={sealText}>
      <AutoScaleContent>
        <div className="text-center space-y-5 w-full max-w-lg py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">This certifies that</p>
          <p
            className="text-3xl font-bold"
            style={{ color: "hsl(var(--primary))", letterSpacing: "0.02em" }}
          >
            {data.customerName || "—"}
          </p>

          <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">{bodyText}</p>

          {fields.length > 0 && (
            <div
              className="grid gap-3 text-sm text-left rounded-lg p-4"
              style={{
                gridTemplateColumns: fields.length <= 3 ? "1fr" : "1fr 1fr",
                background: "hsl(var(--primary) / 0.03)",
                border: "1px solid hsl(var(--primary) / 0.08)",
              }}
            >
              {fields.map((f, i) => (
                <div key={i}>
                  <span className="text-muted-foreground text-xs">{f.label}:</span>{" "}
                  <span className="font-semibold text-foreground">{f.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </AutoScaleContent>
    </CertificateTemplate>
  );
}
