import { cn } from "@/lib/utils";
import logoImg from "@/assets/logo.png";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";

interface CertificateTemplateProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  brandLogo?: string;
  sealText?: string;
  className?: string;
}

/* ── SVG Watermark pattern at ~4% opacity ── */
function WatermarkPattern() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.035] pointer-events-none">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="cert-watermark" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
            {/* Shield shape */}
            <path d="M60 10 L90 30 L90 65 Q90 90 60 110 Q30 90 30 65 L30 30 Z" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
            <path d="M60 25 L50 45 L55 45 L55 75 L65 75 L65 45 L70 45 Z" fill="hsl(var(--primary))" opacity="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cert-watermark)" />
      </svg>
    </div>
  );
}

/* ── Gold foil seal ── */
function GoldSeal({ text = "CERTIFIED" }: { text?: string }) {
  return (
    <div className="absolute bottom-12 right-12 md:bottom-16 md:right-16 w-24 h-24 md:w-28 md:h-28">
      {/* Rays */}
      <div className="absolute inset-0 animate-none">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 left-1/2 w-0.5 h-full origin-bottom"
            style={{
              transform: `translate(-50%, -100%) rotate(${i * 30}deg)`,
              background: "linear-gradient(to top, hsl(40 80% 55% / 0.15), transparent 60%)",
            }}
          />
        ))}
      </div>
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "conic-gradient(from 0deg, hsl(40 70% 50% / 0.25), hsl(40 80% 65% / 0.4), hsl(40 70% 50% / 0.25), hsl(40 80% 65% / 0.4), hsl(40 70% 50% / 0.25))",
        }}
      />
      {/* Inner circle */}
      <div
        className="absolute inset-1.5 rounded-full flex items-center justify-center"
        style={{
          background: "radial-gradient(circle at 35% 35%, hsl(40 80% 70%), hsl(40 70% 48%))",
          boxShadow: "inset 0 2px 6px hsl(40 90% 80% / 0.6), 0 2px 8px hsl(40 60% 30% / 0.3)",
        }}
      >
        <div className="text-center">
          <div
            className="text-[8px] md:text-[9px] font-bold tracking-[0.2em] uppercase"
            style={{ color: "hsl(40 30% 15%)" }}
          >
            {text}
          </div>
          <div className="w-6 h-px mx-auto my-0.5" style={{ background: "hsl(40 30% 20% / 0.4)" }} />
          <div
            className="text-[6px] md:text-[7px] tracking-[0.15em] uppercase"
            style={{ color: "hsl(40 30% 25%)" }}
          >
            Authentic
          </div>
        </div>
      </div>
    </div>
  );
}

export function CertificateTemplate({ title, subtitle, children, brandLogo, sealText, className }: CertificateTemplateProps) {
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  const taclaNumber = settings.tacla_number || "";
  return (
    <div
      className={cn(
        "relative w-full max-w-4xl mx-auto aspect-[1.414/1] overflow-hidden",
        className
      )}
      style={{
        background: "linear-gradient(145deg, hsl(40 30% 97%), hsl(35 20% 95%), hsl(40 30% 97%))",
      }}
    >
      {/* Watermark */}
      <WatermarkPattern />

      {/* Outer ornamental border */}
      <div
        className="absolute inset-3 rounded-lg"
        style={{
          border: "3px solid hsl(var(--primary) / 0.3)",
          boxShadow: "inset 0 0 0 1px hsl(40 70% 55% / 0.2)",
        }}
      />
      {/* Inner filigree border */}
      <div
        className="absolute inset-5 rounded-lg"
        style={{
          border: "1.5px solid hsl(40 65% 55% / 0.25)",
          boxShadow: "inset 0 0 0 4px hsl(var(--primary) / 0.03)",
        }}
      />
      {/* Decorative line between borders */}
      <div
        className="absolute inset-4 rounded-lg pointer-events-none"
        style={{
          border: "0.5px dashed hsl(40 60% 60% / 0.2)",
        }}
      />

      {/* Corner ornaments — larger, gradient */}
      {[
        { pos: "top-5 left-5", border: "border-t-[3px] border-l-[3px]", radius: "rounded-tl-sm" },
        { pos: "top-5 right-5", border: "border-t-[3px] border-r-[3px]", radius: "rounded-tr-sm" },
        { pos: "bottom-5 left-5", border: "border-b-[3px] border-l-[3px]", radius: "rounded-bl-sm" },
        { pos: "bottom-5 right-5", border: "border-b-[3px] border-r-[3px]", radius: "rounded-br-sm" },
      ].map((corner, i) => (
        <div
          key={i}
          className={`absolute ${corner.pos} w-12 h-12 ${corner.border} ${corner.radius}`}
          style={{ borderColor: "hsl(40 65% 50% / 0.45)" }}
        />
      ))}

      {/* Gold seal */}
      <GoldSeal text={sealText || "CERTIFIED"} />

      <div className="relative h-full flex flex-col items-center justify-between p-10 md:p-16 z-10">
        {/* Header */}
        <div className="text-center space-y-3 w-full">
          <div className="flex items-center justify-center gap-4">
            <img
              src={logoImg}
              alt="Company logo"
              className="h-14 md:h-20 object-contain drop-shadow-sm"
            />
            {brandLogo && (
              <>
                <div className="w-px h-12 bg-border/60" />
                <img src={brandLogo} alt="Brand logo" className="h-12 md:h-16 object-contain" />
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <h1
              className="text-2xl md:text-4xl font-bold uppercase"
              style={{
                color: "hsl(var(--primary))",
                letterSpacing: "0.08em",
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm md:text-base text-muted-foreground font-medium tracking-wide">
                {subtitle}
              </p>
            )}
          </div>
          {/* Gold accent bar — wider */}
          <div
            className="mx-auto w-48 h-0.5"
            style={{
              background: "linear-gradient(90deg, transparent, hsl(40 70% 55%), hsl(40 80% 65%), hsl(40 70% 55%), transparent)",
            }}
          />
        </div>

        {/* Content — flex-1 so children can measure available space */}
        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
          {children}
        </div>

        {/* Footer */}
        <div className="text-center space-y-2 w-full">
          <div
            className="mx-auto w-48 h-0.5"
            style={{
              background: "linear-gradient(90deg, transparent, hsl(40 70% 55%), hsl(40 80% 65%), hsl(40 70% 55%), transparent)",
            }}
          />
          <div className="flex items-center justify-center gap-5 text-xs text-muted-foreground tracking-wide">
            <span className="font-semibold uppercase" style={{ letterSpacing: "0.12em", fontSize: "10px" }}>
              {companyName}
            </span>
            <span style={{ color: "hsl(40 60% 55%)" }}>◆</span>
            <span>Licensed & Insured</span>
            <span style={{ color: "hsl(40 60% 55%)" }}>◆</span>
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
              </svg>
              <span>{taclaNumber}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
