import { Card } from "@/components/ui/card";
import { Hash, Phone, Mail, Globe, ExternalLink, MessageSquare } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";

interface Props {
  accountNumber?: string | null;
  phone?: string | null;
  textSupportPhone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  orderingUrl?: string | null;
}

export function AccountInfoCard({ accountNumber, phone, textSupportPhone, email, websiteUrl, orderingUrl }: Props) {
  const hasAny = accountNumber || phone || textSupportPhone || email || websiteUrl || orderingUrl;
  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Account info</h3>
      <div className="space-y-2 text-sm">
        {accountNumber && (
          <Row icon={<Hash className="h-3.5 w-3.5" />} label="Account #">
            <span className="font-mono break-all">{accountNumber}</span>
          </Row>
        )}
        {phone && (
          <Row icon={<Phone className="h-3.5 w-3.5" />} label="Phone">
            <ClickToCall phone={phone}>
              <span className="text-primary hover:underline cursor-pointer">{phone}</span>
            </ClickToCall>
          </Row>
        )}
        {textSupportPhone && (
          <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Text support">
            <ClickToCall phone={textSupportPhone}>
              <span className="text-primary hover:underline cursor-pointer">{textSupportPhone}</span>
            </ClickToCall>
          </Row>
        )}
        {email && (
          <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email">
            <a href={`mailto:${email}`} className="text-primary hover:underline break-all">{email}</a>
          </Row>
        )}
        {websiteUrl && (
          <Row icon={<Globe className="h-3.5 w-3.5" />} label="Website">
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
              {websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          </Row>
        )}
        {orderingUrl && (
          <Row icon={<ExternalLink className="h-3.5 w-3.5" />} label="Order portal">
            <a href={orderingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
              Open portal
            </a>
          </Row>
        )}
        {!hasAny && <p className="text-muted-foreground text-xs">No account info on file.</p>}
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
