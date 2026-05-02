/**
 * IvrBuilder — Visual IVR builder page.
 * Canonical IVR and department-routing configuration via canvas + side panel.
 */
import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, FlaskConical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIvrConfig, IvrMenuOption } from "@/hooks/useIvrConfig";
import { IvrCanvas } from "@/components/ivr/IvrCanvas";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";

const IvrBuilder = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [businessUnits, setBusinessUnits] = useState<Array<{ id: string; slug: string; display_name: string; primary_phone_number: string; is_default: boolean }>>([]);
  const [selectedBusinessUnitId, setSelectedBusinessUnitId] = useState<string | null>(null);
  const { config, menuOptions, loading, updateConfig, upsertMenuOption, deleteMenuOption } = useIvrConfig(selectedBusinessUnitId);
  const { settings, updateSettings } = useCompanySettings();
  const testMode = settings.ivr_test_mode === "true";
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([]);

  // Add department popover state
  const [addOpen, setAddOpen] = useState(false);
  const [newDigit, setNewDigit] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAction, setNewAction] = useState("forward_client");

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").then(({ data }) => {
      if (data) setProfiles(data as any[]);
    });
  }, []);

  useEffect(() => {
    supabase
      .from("business_units" as any)
      .select("id, slug, display_name, primary_phone_number, is_default")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .then(({ data }) => {
        const rows = (data || []) as Array<{ id: string; slug: string; display_name: string; primary_phone_number: string; is_default: boolean }>;
        setBusinessUnits(rows);
        setSelectedBusinessUnitId((current) => current || rows[0]?.id || null);
      });
  }, []);

  const handleAddDept = () => {
    if (!newDigit || !newLabel) return;
    upsertMenuOption({ digit: newDigit, label: newLabel, action_type: newAction, sort_order: menuOptions.length, is_active: true });
    setNewDigit(""); setNewLabel(""); setAddOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <div className="container py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">IVR Builder</h1>
              <p className="text-sm text-muted-foreground">
                {config?.label || businessUnits.find((unit) => unit.id === selectedBusinessUnitId)?.display_name || "Company"} call flow editor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {businessUnits.length > 1 && (
              <Select value={selectedBusinessUnitId || ""} onValueChange={setSelectedBusinessUnitId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Choose company" />
                </SelectTrigger>
                <SelectContent>
                  {businessUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center gap-2">
              <FlaskConical className={`h-4 w-4 ${testMode ? "text-amber-500" : "text-muted-foreground"}`} />
              <Switch
                checked={testMode}
                onCheckedChange={(v) => updateSettings.mutate({ ivr_test_mode: v ? "true" : "false" } as any)}
              />
              {testMode && <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">Test Mode</Badge>}
            </div>

          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Department
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
              <Label className="text-sm font-semibold">New Department</Label>
              <div className="grid grid-cols-[60px_1fr] gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Key</Label>
                  <Input value={newDigit} onChange={(e) => setNewDigit(e.target.value.replace(/[^0-9*#]/g, ""))} className="text-center text-lg font-mono" placeholder="1" maxLength={1} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Service" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Action</Label>
                <Select value={newAction} onValueChange={setNewAction}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forward_client">Ring Assigned Team</SelectItem>
                    <SelectItem value="forward_phone">Forward to Number</SelectItem>
                    <SelectItem value="say_message">Play Message</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddDept} disabled={!newDigit || !newLabel} className="w-full gap-1.5" size="sm">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </PopoverContent>
          </Popover>
          </div>
        </div>

        {loading || !config ? (
          <Skeleton className="h-[500px] w-full rounded-lg" />
        ) : (
          <IvrCanvas
            config={config}
            menuOptions={menuOptions}
            profiles={profiles}
            onUpdateConfig={updateConfig}
            onUpdateDept={upsertMenuOption}
            onDeleteDept={deleteMenuOption}
            testMode={testMode}
          />
        )}
      </div>
    </div>
  );
};

export default IvrBuilder;
