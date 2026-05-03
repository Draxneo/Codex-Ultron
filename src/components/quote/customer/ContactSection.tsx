import { Card } from "@/components/ui/card";
import { Phone, MapPin, BadgeCheck } from "lucide-react";
import type { CompanyContact } from "@/lib/quoteTemplate";
import { formatPhone } from "@/lib/formatters";

interface Props { company: CompanyContact | null; }

export function ContactSection({ company }: Props) {
  if (!company) return null;
  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(", ").replace(/, (\d)/, " $1");

  return (
    <Card className="p-6 md:p-8 bg-gradient-to-br from-primary/5 to-background">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📞</span>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Contact Us</h2>
      </div>

      <p className="text-lg font-bold text-foreground mb-3">{company.name}</p>

      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-foreground">{[company.address, cityLine].filter(Boolean).join(", ")}</span>
        </div>
        <a href={`tel:${company.phone.replace(/\D/g, "")}`} className="flex items-center gap-2 text-primary font-semibold hover:underline">
          <Phone className="h-4 w-4" /> {formatPhone(company.phone) || company.phone}
        </a>
        {company.tacla && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <BadgeCheck className="h-4 w-4" />
            <span>License #{company.tacla}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
