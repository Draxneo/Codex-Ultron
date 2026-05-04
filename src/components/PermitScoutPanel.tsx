import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { usePermitAuthorities, type PermitAuthority } from "@/hooks/usePermitAuthorities";
import { toast } from "sonner";
import {
  Radar, ChevronDown, Loader2, ExternalLink, Phone, Copy, CheckCircle2,
  MapPin, Eye, Save, AlertTriangle,
} from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";

interface ScoutResult {
  screenshot: string | null;
  fields: Array<{ tag: string; type: string; name: string; id: string; placeholder: string; visible?: boolean }>;
  htmlLength: number;
  loginRequired?: boolean;
  pageTitle?: string;
}

interface FieldMapping {
  selector: string; // name or id from scouted field
  dataKey: string;  // internal key like homeowner_name, address, etc.
}

const DATA_KEYS = [
  { value: "", label: "— skip —" },
  { value: "homeowner_first", label: "First Name" },
  { value: "homeowner_last", label: "Last Name" },
  { value: "homeowner_name", label: "Full Name" },
  { value: "address", label: "Street Address" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "Zip Code" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "contractor_name", label: "Contractor Name" },
  { value: "contractor_license", label: "License #" },
  { value: "equipment_type", label: "Equipment Type" },
  { value: "equipment_model", label: "Model #" },
  { value: "equipment_brand", label: "Brand" },
  { value: "scope_of_work", label: "Scope of Work" },
];

export function PermitScoutPanel() {
  const { authorities, upsert } = usePermitAuthorities();
  const [selectedId, setSelectedId] = useState<string>("");
  const [scouting, setScouting] = useState(false);
  const [scoutResult, setScoutResult] = useState<ScoutResult | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const selected = authorities.find((a) => a.id === selectedId);
  const portalConfig = (selected as any)?.portal_config || {};

  const automatable = authorities.filter((a) => a.permit_portal_url);
  const phoneOnly = authorities.filter((a) => !a.permit_portal_url && a.inspection_phone);

  const handleScout = async () => {
    if (!selected?.permit_portal_url) return;
    setScouting(true);
    setScoutResult(null);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("auto-apply-permit", {
        body: { job_id: "scout-only", action: "scout", url: selected.permit_portal_url },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Scout failed");

      setScoutResult({
        screenshot: data.screenshot || null,
        fields: data.fields || [],
        htmlLength: data.htmlLength || 0,
        loginRequired: false,
        pageTitle: data.url,
      });

      // Pre-fill mappings from existing portal_config
      const existing = portalConfig.field_mappings || {};
      setMappings(existing);

      toast.success(`Found ${data.fields?.length || 0} form fields`);
    } catch (e: any) {
      toast.error(e.message || "Scout failed");
    } finally {
      setScouting(false);
    }
  };

  const handleScoutInspection = async () => {
    if (!selected?.inspection_url) return;
    setScouting(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-apply-permit", {
        body: { job_id: "scout-only", action: "scout", url: selected.inspection_url },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Scout failed");

      setScoutResult({
        screenshot: data.screenshot || null,
        fields: data.fields || [],
        htmlLength: data.htmlLength || 0,
        loginRequired: false,
        pageTitle: "Inspection: " + data.url,
      });
      toast.success(`Inspection page: ${data.fields?.length || 0} fields found`);
    } catch (e: any) {
      toast.error(e.message || "Inspection scout failed");
    } finally {
      setScouting(false);
    }
  };

  const handleSaveMappings = () => {
    if (!selected) return;
    const cleaned = Object.fromEntries(Object.entries(mappings).filter(([, v]) => v));
    upsert.mutate({
      id: selected.id,
      name: selected.name,
      portal_config: {
        ...portalConfig,
        field_mappings: cleaned,
        scouted_at: new Date().toISOString(),
        automation_supported: Object.keys(cleaned).length >= 3,
        fields_count: scoutResult?.fields?.length || portalConfig.fields_count || 0,
      },
    } as any);
  };

  const handleTestFill = async () => {
    if (!selected) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Create a live session
      const { data: sessionData, error: sessErr } = await supabase.functions.invoke("auto-apply-permit", {
        body: { job_id: "test-fill", action: "create_session" },
      });
      if (sessErr) throw sessErr;
      if (!sessionData?.success) throw new Error(sessionData?.error || "Session failed");

      setSessionId(sessionData.sessionId);
      setLiveViewUrl(sessionData.liveViewUrl);

      // Execute the test against the portal
      const { data: execData, error: execErr } = await supabase.functions.invoke("auto-apply-permit", {
        body: {
          job_id: "test-fill",
          action: "execute",
          session_id: sessionData.sessionId,
          authority_id: selected.id,
        },
      });
      if (execErr) throw execErr;
      setTestResult(execData);
      toast.success(execData?.message || "Test complete");
    } catch (e: any) {
      toast.error(e.message || "Test failed");
      setTestResult({ success: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const getStatusBadge = (a: PermitAuthority) => {
    const cfg = (a as any).portal_config || {};
    if (!a.permit_portal_url) return <Badge variant="outline" className="text-[10px] bg-muted">Phone Only</Badge>;
    if (cfg.automation_supported) return <Badge className="text-[10px] bg-green-600 text-white">Auto-Ready</Badge>;
    if (cfg.scouted_at) return <Badge variant="secondary" className="text-[10px]">Scouted</Badge>;
    return <Badge variant="outline" className="text-[10px]">Not Scouted</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Scout permit portals, map form fields, and test automation.</p>
      </div>

      {/* Phone-only jurisdictions */}
      {phoneOnly.length > 0 && (
        <Card className="p-3">
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Phone-Only Jurisdictions
          </p>
          <div className="space-y-1">
            {phoneOnly.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className="text-foreground font-medium">{a.name}</span>
                {a.inspection_phone && (
                  <ClickToCall phone={a.inspection_phone} contactName={a.name} className="text-primary hover:underline flex items-center gap-0.5" iconClassName="h-3 w-3" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Scout & Test */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-64 h-8 text-xs">
              <SelectValue placeholder="Pick a jurisdiction..." />
            </SelectTrigger>
            <SelectContent>
              {automatable.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  <span className="flex items-center gap-2">
                    {a.name} {getStatusBadge(a)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs"
            disabled={!selected?.permit_portal_url || scouting}
            onClick={handleScout}
          >
            {scouting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radar className="h-3 w-3" />}
            Scout Permits
          </Button>

          {selected?.inspection_url && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              disabled={scouting}
              onClick={handleScoutInspection}
            >
              {scouting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              Scout Inspections
            </Button>
          )}

          {selected?.permit_portal_url && (
            <a href={selected.permit_portal_url} target="_blank" rel="noopener">
              <Button size="sm" variant="ghost" className="gap-1 text-xs h-8">
                <ExternalLink className="h-3 w-3" /> Open Portal
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Scout Results */}
      {scoutResult && (
        <div className="space-y-3">
          {/* Screenshot */}
          {scoutResult.screenshot && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold w-full">
                <ChevronDown className="h-3 w-3" /> Screenshot Preview
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <img
                  src={scoutResult.screenshot.startsWith("data:") ? scoutResult.screenshot : `data:image/png;base64,${scoutResult.screenshot}`}
                  alt="Portal screenshot"
                  className="w-full rounded-lg border shadow-sm"
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Login warning */}
          {scoutResult.loginRequired && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This portal requires login. Store credentials in portal_config to enable automation.
            </div>
          )}

          {/* Field mapping table */}
          {scoutResult.fields.length > 0 && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold w-full">
                <ChevronDown className="h-3 w-3" /> Detected Fields ({scoutResult.fields.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Field</th>
                        <th className="text-left px-2 py-1.5 font-medium">Type</th>
                        <th className="text-left px-2 py-1.5 font-medium">Placeholder</th>
                        <th className="text-left px-2 py-1.5 font-medium w-40">Maps To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scoutResult.fields
                        .filter((f) => f.name || f.id)
                        .map((f, i) => {
                          const key = f.name || f.id;
                          return (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="px-2 py-1 font-mono text-muted-foreground">{key}</td>
                              <td className="px-2 py-1 text-muted-foreground">{f.tag}/{f.type || "text"}</td>
                              <td className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">{f.placeholder || "—"}</td>
                              <td className="px-2 py-1">
                                <Select
                                  value={mappings[key] || ""}
                                  onValueChange={(v) => setMappings((m) => ({ ...m, [key]: v }))}
                                >
                                  <SelectTrigger className="h-6 text-[11px]">
                                    <SelectValue placeholder="skip" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {DATA_KEYS.map((dk) => (
                                      <SelectItem key={dk.value} value={dk.value} className="text-xs">
                                        {dk.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" className="gap-1 text-xs" onClick={handleSaveMappings}>
                    <Save className="h-3 w-3" /> Save Mappings
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleTestFill} disabled={testing}>
                    {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                    Test Fill
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {scoutResult.fields.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No form fields detected — this page may require JavaScript rendering or login first.
            </p>
          )}
        </div>
      )}

      {/* Live View iframe */}
      {liveViewUrl && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold w-full">
            <ChevronDown className="h-3 w-3" /> Live View
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <iframe
              src={liveViewUrl}
              className="w-full h-[500px] rounded-lg border"
              sandbox="allow-scripts allow-same-origin"
              title="Permit Portal Live View"
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Test result */}
      {testResult && (
        <Card className="p-3 text-xs space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
            {testResult.message || (testResult.success ? "Test passed" : "Test failed")}
          </p>
          {testResult.fieldsFound !== undefined && <p className="text-muted-foreground">Fields found: {testResult.fieldsFound}</p>}
          {testResult.loginRequired && <p className="text-amber-600">⚠ Login required — manual entry needed</p>}
        </Card>
      )}

      {/* Automation status summary */}
      {automatable.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2">
          {automatable.map((a) => (
            <div key={a.id} className="flex items-center gap-1">
              {getStatusBadge(a)}
              <span className="text-[10px] text-muted-foreground">{a.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
