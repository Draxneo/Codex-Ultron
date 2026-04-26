import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Phone, Mail } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";

interface Contact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  is_primary?: boolean | null;
}

interface Props {
  contacts: Contact[];
}

export function PrimaryContactCard({ contacts }: Props) {
  const primary = contacts.find((c) => c.is_primary) || contacts[0];

  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Primary contact</h3>
      {!primary ? (
        <p className="text-muted-foreground text-xs">No contacts on file. Add one in the Contacts tab.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{primary.name}</span>
            {primary.is_primary && <Badge variant="outline" className="text-[9px] h-4">Primary</Badge>}
          </div>
          {primary.title && (
            <div className="text-xs text-muted-foreground pl-5">{primary.title}</div>
          )}
          {primary.phone && (
            <div className="flex items-center gap-2 pl-5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <ClickToCall phone={primary.phone} contactName={primary.name}>
                <span className="text-primary hover:underline cursor-pointer">{primary.phone}</span>
              </ClickToCall>
              <SmsButton phone={primary.phone} iconClassName="h-3 w-3" />
            </div>
          )}
          {primary.email && (
            <div className="flex items-center gap-2 pl-5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <a href={`mailto:${primary.email}`} className="text-primary hover:underline break-all">{primary.email}</a>
            </div>
          )}
          {contacts.length > 1 && (
            <p className="text-[11px] text-muted-foreground pt-1">
              +{contacts.length - 1} more contact{contacts.length - 1 === 1 ? "" : "s"} in Contacts tab
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
