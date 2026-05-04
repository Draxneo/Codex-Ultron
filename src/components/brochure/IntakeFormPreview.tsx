import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, ChevronDown, ChevronUp, Smartphone, Monitor, CheckCircle2, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PreviewState = "form" | "submitted" | "expired";

export default function IntakeFormPreview() {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [previewState, setPreviewState] = useState<PreviewState>("form");
  const [showAlt, setShowAlt] = useState(false);

  const frameClass = device === "mobile"
    ? "w-[375px] h-[812px] border-[8px] border-foreground/20 rounded-[2.5rem] shadow-2xl"
    : "w-full max-w-2xl h-[700px] border border-border rounded-lg shadow-lg";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Customer Intake Form</h2>
          <p className="text-xs text-muted-foreground">
            This is what customers see when they receive the intake link via SMS
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* State selector */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <button
              onClick={() => setPreviewState("form")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                previewState === "form" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Form
            </button>
            <button
              onClick={() => setPreviewState("submitted")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                previewState === "submitted" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Submitted
            </button>
            <button
              onClick={() => setPreviewState("expired")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                previewState === "expired" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Expired
            </button>
          </div>

          {/* Device toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <button
              onClick={() => setDevice("mobile")}
              className={`p-1.5 rounded transition-colors ${
                device === "mobile" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDevice("desktop")}
              className={`p-1.5 rounded transition-colors ${
                device === "desktop" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="flex justify-center py-4">
        <div className={`${frameClass} bg-background overflow-y-auto`}>
          <div className="p-4">
            {previewState === "expired" && (
              <div className="min-h-full flex items-center justify-center py-20">
                <Card className="max-w-md w-full p-8 text-center space-y-4">
                  <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
                  <h1 className="text-xl font-bold text-foreground">Link Expired</h1>
                  <p className="text-muted-foreground text-sm">
                    This intake form link has expired or is invalid. Please contact us to request a new one.
                  </p>
                </Card>
              </div>
            )}

            {previewState === "submitted" && (
              <div className="min-h-full flex items-center justify-center py-20">
                <Card className="max-w-md w-full p-8 text-center space-y-4">
                  <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                  <h1 className="text-xl font-bold text-foreground">Thank You!</h1>
                  <p className="text-muted-foreground text-sm">
                    Your information has been received. We'll be in touch shortly to schedule your service.
                  </p>
                </Card>
              </div>
            )}

            {previewState === "form" && (
              <div className="max-w-lg mx-auto space-y-6 py-4">
                <div className="text-center space-y-2">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <UserPlus className="h-6 w-6 text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold text-foreground">Customer Information</h1>
                  <p className="text-muted-foreground text-sm">
                    Please fill out your information below so we can get you set up quickly.
                  </p>
                </div>

                <Card className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">First Name *</Label>
                      <Input placeholder="First name" className="mt-1" disabled />
                    </div>
                    <div>
                      <Label className="text-sm">Last Name *</Label>
                      <Input placeholder="Last name" className="mt-1" disabled />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm">Service Address *</Label>
                    <Input placeholder="Start typing your address..." className="mt-1" disabled />
                  </div>

                  <div>
                    <Label className="text-sm">Phone *</Label>
                    <Input placeholder="(210) 555-1234" className="mt-1" disabled />
                  </div>

                  <div>
                    <Label className="text-sm">Email</Label>
                    <Input placeholder="your@email.com" className="mt-1" disabled />
                  </div>

                  <div>
                    <Label className="text-sm">What's going on? (optional)</Label>
                    <Textarea
                      placeholder="Briefly describe the issue or service needed..."
                      className="mt-1 min-h-[80px]"
                      disabled
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAlt(!showAlt)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAlt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Alternative contact for day of service
                  </button>

                  {showAlt && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Contact Name</Label>
                        <Input placeholder="Name" className="mt-1 h-10 text-sm" disabled />
                      </div>
                      <div>
                        <Label className="text-xs">Contact Phone</Label>
                        <Input placeholder="Phone" className="mt-1 h-10 text-sm" disabled />
                      </div>
                    </div>
                  )}

                  <Button className="w-full" disabled>
                    Submit Information
                  </Button>
                </Card>

                <p className="text-center text-xs text-muted-foreground">
                  Your information is secure and will only be used to schedule your service.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
