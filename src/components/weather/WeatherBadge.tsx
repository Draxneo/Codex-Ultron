import { cn } from "@/lib/utils";
import type { WeatherForecast } from "@/hooks/useWeatherForecast";

interface Props {
  forecast?: WeatherForecast;
  className?: string;
  inverted?: boolean;
}

/**
 * iOS-style weather glyph: colorful gradient cloud/sun/rain icon.
 * Distinct from the humidity droplet so techs/dispatchers don't confuse them.
 */
function WeatherGlyph({ condition, size = 22 }: { condition: string; size?: number }) {
  const s = size;
  switch (condition) {
    case "rain":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" className="shrink-0">
          <defs>
            <linearGradient id="wg-cloud-r" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="wg-drop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
          <path d="M9 19a5 5 0 0 1 .6-9.96A7 7 0 0 1 23 12a4.5 4.5 0 0 1-1 8.9H9z" fill="url(#wg-cloud-r)" />
          <path d="M11 23l-1.5 3M16 23l-1.5 3M21 23l-1.5 3" stroke="url(#wg-drop)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "storm":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" className="shrink-0">
          <defs>
            <linearGradient id="wg-cloud-s" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
          </defs>
          <path d="M9 19a5 5 0 0 1 .6-9.96A7 7 0 0 1 23 12a4.5 4.5 0 0 1-1 8.9H9z" fill="url(#wg-cloud-s)" />
          <path d="M16 20l-3 5h3l-2 4 5-6h-3l2-3z" fill="#facc15" stroke="#ca8a04" strokeWidth="0.5" />
        </svg>
      );
    case "snow":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" className="shrink-0">
          <path d="M9 19a5 5 0 0 1 .6-9.96A7 7 0 0 1 23 12a4.5 4.5 0 0 1-1 8.9H9z" fill="#e2e8f0" />
          <g fill="#bfdbfe" stroke="#60a5fa" strokeWidth="0.5">
            <circle cx="11" cy="25" r="1.4" />
            <circle cx="16" cy="27" r="1.4" />
            <circle cx="21" cy="25" r="1.4" />
          </g>
        </svg>
      );
    case "clouds":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" className="shrink-0">
          <defs>
            <linearGradient id="wg-cloud-c" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <radialGradient id="wg-sun-c" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#f59e0b" />
            </radialGradient>
          </defs>
          <circle cx="22" cy="10" r="5" fill="url(#wg-sun-c)" />
          <path d="M7 22a5 5 0 0 1 .6-9.96A7 7 0 0 1 21 15a4.5 4.5 0 0 1-1 8.9H7z" fill="url(#wg-cloud-c)" />
        </svg>
      );
    default: // clear
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" className="shrink-0">
          <defs>
            <radialGradient id="wg-sun" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="60%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="7" fill="url(#wg-sun)" />
          <g stroke="#fbbf24" strokeWidth="2" strokeLinecap="round">
            <line x1="16" y1="3" x2="16" y2="6" />
            <line x1="16" y1="26" x2="16" y2="29" />
            <line x1="3" y1="16" x2="6" y2="16" />
            <line x1="26" y1="16" x2="29" y2="16" />
            <line x1="6.5" y1="6.5" x2="8.5" y2="8.5" />
            <line x1="23.5" y1="23.5" x2="25.5" y2="25.5" />
            <line x1="6.5" y1="25.5" x2="8.5" y2="23.5" />
            <line x1="23.5" y1="8.5" x2="25.5" y2="6.5" />
          </g>
        </svg>
      );
  }
}

/**
 * Compact weather strip designed for calendar day headers.
 * Layout (single line):
 *   [icon]  76°/61°   ☔ 80%   💧 65%   🔥(if heat)
 * - Rain chance uses a teardrop with a slash to clearly mean "precip"
 * - Humidity uses a hollow droplet to clearly mean "humidity"
 * - Heat warning paints the feels-like in orange + flame
 */
export function WeatherBadge({ forecast, className, inverted }: Props) {
  if (!forecast) return null;
  const isRainy = forecast.business_hours_rain;
  const isHot = forecast.heat_warning;

  const tooltipParts = [forecast.summary || ""];
  if (forecast.feels_like_high != null) tooltipParts.push(`Feels like ${forecast.feels_like_high}°`);
  if (forecast.humidity_max != null) tooltipParts.push(`Humidity ${forecast.humidity_max}%`);
  if (forecast.wind_max_mph != null && forecast.wind_max_mph >= 15) tooltipParts.push(`Wind ${forecast.wind_max_mph}mph`);
  const tooltip = tooltipParts.filter(Boolean).join(" · ");

  const baseText = inverted ? "text-primary-foreground" : "text-foreground";
  const mutedText = inverted ? "text-primary-foreground/75" : "text-muted-foreground";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 text-[11px] leading-none px-1 py-0.5 rounded max-w-full whitespace-nowrap",
        className,
      )}
      title={tooltip || undefined}
    >
      <WeatherGlyph condition={forecast.condition} size={18} />

      {/* Temp / low temp */}
      <span className={cn("font-bold", baseText)}>{forecast.temp_high}°</span>
      {forecast.temp_low != null && (
        <span className={cn("text-[10px]", mutedText)}>{forecast.temp_low}°</span>
      )}

      {/* Feels like (only if meaningfully different) */}
      {forecast.feels_like_high != null &&
        forecast.temp_high != null &&
        Math.abs(forecast.feels_like_high - forecast.temp_high) >= 4 && (
          <span
            className={cn(
              "text-[10px] inline-flex items-center gap-0.5",
              isHot ? "text-orange-600 dark:text-orange-400 font-bold" : mutedText,
            )}
            title={`Feels like ${forecast.feels_like_high}°`}
          >
            ↑{forecast.feels_like_high}°
            {isHot && <span aria-hidden>🔥</span>}
          </span>
        )}

      {/* Rain chance — only when meaningful, clearly labeled */}
      {forecast.precip_chance >= 20 && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 px-1 py-0.5 rounded",
            isRainy
              ? "bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold"
              : inverted
                ? "text-primary-foreground/85"
                : "text-blue-600 dark:text-blue-400",
          )}
          title={`${forecast.precip_chance}% chance of rain (8a–6p)`}
        >
          {/* Umbrella-esque rain icon: filled drop with slash strokes above */}
          <svg width="11" height="11" viewBox="0 0 16 16" className="shrink-0" aria-hidden>
            <path d="M8 14.5c-2 0-3.5-1.6-3.5-3.6 0-2.3 3.5-7.4 3.5-7.4s3.5 5.1 3.5 7.4c0 2-1.5 3.6-3.5 3.6z" fill="currentColor" />
          </svg>
          {forecast.precip_chance}%
        </span>
      )}

      {/* Humidity — separate visual: hollow droplet */}
      {forecast.humidity_max != null && forecast.humidity_max >= 50 && (
        <span
          className={cn("inline-flex items-center gap-0.5 text-[10px]", mutedText)}
          title={`Humidity ${forecast.humidity_max}%`}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" className="shrink-0" aria-hidden>
            <path
              d="M8 14.5c-2 0-3.5-1.6-3.5-3.6 0-2.3 3.5-7.4 3.5-7.4s3.5 5.1 3.5 7.4c0 2-1.5 3.6-3.5 3.6z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
          {forecast.humidity_max}%
        </span>
      )}
    </div>
  );
}
