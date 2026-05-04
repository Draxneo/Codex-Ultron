import { Badge } from "@/components/ui/badge";
import { Shield, Camera, Award, Cpu, Trash2, Wrench } from "lucide-react";
import type { EquipmentDocsData } from "@/hooks/usePublicInvoice";

interface Props {
  docs: EquipmentDocsData;
  baseUrl?: string;
}

const certLabel: Record<string, string> = {
  manufacturer_warranty: "Manufacturer Warranty",
  labor_warranty: "Labor Warranty",
  "10yr_labor_warranty": "10-Year Labor Warranty",
  no_lemon: "No-Lemon Guarantee",
  price_match: "Price Match Guarantee",
};

export default function EquipmentDocBlocks({ docs, baseUrl = "" }: Props) {
  const hasOld = docs.oldEquipment.length > 0;
  const hasNew = docs.newEquipment.length > 0;
  const hasAhri = docs.ahri.length > 0;
  const hasCerts = docs.certificates.length > 0;
  const beforePhotos = docs.photos.filter((p) => p.photoType === "before");
  const afterPhotos = docs.photos.filter((p) => p.photoType === "after");
  const dataPlatePhotos = docs.photos.filter((p) => p.photoType === "data_plate");

  if (!hasOld && !hasNew && !hasAhri && !hasCerts && docs.photos.length === 0) return null;

  return (
    <div className="space-y-6 mt-8 print:break-inside-avoid">
      {/* Equipment Removed */}
      {hasOld && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-destructive/10 px-4 py-3 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-bold text-foreground">Equipment Removed</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Brand</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Model</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Serial</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Type</th>
              </tr>
            </thead>
            <tbody>
              {docs.oldEquipment.map((eq) => (
                <tr key={eq.id} className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">{eq.brand || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{eq.model_number || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{eq.serial_number || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{eq.equipment_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {beforePhotos.length > 0 && (
            <div className="px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2 flex items-center gap-1">
                <Camera className="h-3 w-3" /> Before Photos
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {beforePhotos.map((p) => (
                  <img key={p.id} src={p.url} alt="Before" className="rounded border border-border object-cover aspect-square w-full" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Equipment Installed */}
      {hasNew && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-foreground">Equipment Installed</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Brand</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Model</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Serial</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody>
              {docs.newEquipment.map((eq) => (
                <tr key={eq.id} className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">{eq.brand || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{eq.model_number || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{eq.serial_number || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground capitalize">{eq.source.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* AHRI badges inline */}
          {hasAhri && (
            <div className="px-4 py-3 border-t border-border flex flex-wrap gap-2">
              {docs.ahri.map((a) => (
                <Badge key={a.ahri_number} variant="outline" className="text-xs gap-1">
                  <Shield className="h-3 w-3" />
                  AHRI #{a.ahri_number}
                  {a.seer2 && <span className="font-bold ml-1">{a.seer2} SEER2</span>}
                  {a.energy_star && <span className="text-emerald-600">★ ENERGY STAR</span>}
                </Badge>
              ))}
            </div>
          )}

          {/* After + data plate photos */}
          {(afterPhotos.length > 0 || dataPlatePhotos.length > 0) && (
            <div className="px-4 py-3 border-t border-border space-y-3">
              {afterPhotos.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2 flex items-center gap-1">
                    <Camera className="h-3 w-3" /> After Photos
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {afterPhotos.map((p) => (
                      <img key={p.id} src={p.url} alt="After" className="rounded border border-border object-cover aspect-square w-full" />
                    ))}
                  </div>
                </div>
              )}
              {dataPlatePhotos.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2 flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> Data Plates
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {dataPlatePhotos.map((p) => (
                      <img key={p.id} src={p.url} alt="Data Plate" className="rounded border border-border object-cover aspect-square w-full" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AHRI Certificate Images */}
      {docs.ahri.filter((a) => a.certificateUrl).length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-sky-50 dark:bg-sky-950/30 px-4 py-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-bold text-foreground">AHRI Certificate(s)</h3>
          </div>
          <div className="p-4 space-y-4">
            {docs.ahri
              .filter((a) => a.certificateUrl)
              .map((a) => (
                <div key={a.ahri_number}>
                  <p className="text-xs text-muted-foreground mb-1">AHRI #{a.ahri_number}</p>
                  <img
                    src={a.certificateUrl!}
                    alt={`AHRI Certificate ${a.ahri_number}`}
                    className="w-full rounded border border-border"
                  />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Warranty Certificates */}
      {hasCerts && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-accent/10 px-4 py-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-bold text-foreground">Warranty Certificates</h3>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {docs.certificates.map((c) => (
              <a
                key={c.id}
                href={`${baseUrl}/certificate/${c.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
              >
                <Award className="h-5 w-5 text-accent shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {certLabel[c.certificate_type] || c.certificate_type}
                  </p>
                  <p className="text-xs text-muted-foreground">View Certificate →</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
