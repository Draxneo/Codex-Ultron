import { Card } from "@/components/ui/card";
import { Phone, Mail, Smartphone, Building2 } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";

interface Props {
  customerId?: string;
  fullName?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  company?: string | null;
}

export function ContactInfoCard({ customerId, fullName, phone, mobile, email, company }: Props) {
  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Contact info</h3>
      <div className="space-y-2 text-sm">
        {company && (
          <Row icon={<Building2 className="h-3.5 w-3.5" />} label="Company">
            <span className="break-words">{company}</span>
          </Row>
        )}
        {phone && (
          <Row icon={<Phone className="h-3.5 w-3.5" />} label="Phone">
            <ClickToCall phone={phone} customerId={customerId} contactName={fullName || company || undefined}>
              <span className="text-primary hover:underline cursor-pointer">{phone}</span>
            </ClickToCall>
          </Row>
        )}
        {mobile && mobile !== phone && (
          <Row icon={<Smartphone className="h-3.5 w-3.5" />} label="Mobile">
            <ClickToCall phone={mobile} customerId={customerId} contactName={fullName || company || undefined}>
              <span className="text-primary hover:underline cursor-pointer">{mobile}</span>
            </ClickToCall>
          </Row>
        )}
        {email && (
          <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email">
            <a href={`mailto:${email}`} className="text-primary hover:underline break-all">
              {email}
            </a>
          </Row>
        )}
        {!phone && !mobile && !email && !company && (
          <p className="text-muted-foreground text-xs">No contact info on file.</p>
        )}
      </div>
    </Card>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
