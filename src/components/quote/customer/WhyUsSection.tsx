import { Card } from "@/components/ui/card";
import type { CompanyContact } from "@/lib/quoteTemplate";

const POINTS = [
  { icon: "👨‍👦", title: "Family-Owned & Operated", body: "Three generations serving San Antonio." },
  { icon: "💰", title: "All-Inclusive Pricing", body: "No hidden fees, no surprises at the end." },
  { icon: "🛡️", title: "10-Year Parts Warranty", body: "Registered for you with the manufacturer." },
  { icon: "🔧", title: "Comfort Club Included", body: "2 years of maintenance & priority service." },
  { icon: "🤝", title: "Clean, Respectful Service", body: "We treat your home like our own." },
  { icon: "⭐", title: "Licensed and Accountable", body: "Certified, insured, and accountable." },
];

interface Props {
  company?: CompanyContact | null;
}

export function WhyUsSection({ company }: Props) {
  const companyName = company?.name || "our team";

  return (
    <Card className="p-6 md:p-8">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-2xl">🤷‍♂️</span>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Why {companyName}</h2>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-lg border border-border bg-card p-3">
            <p className="font-bold text-foreground text-sm">{p.icon} {p.title}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
