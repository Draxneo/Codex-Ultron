import { Capacitor } from "@capacitor/core";

/**
 * Launch turn-by-turn navigation to a given address.
 * - Android → Google Maps intent
 * - iOS → Apple Maps deep link
 * - Web → Google Maps directions URL
 */
export function launchNavigation(address: string) {
  if (!address) return;

  const platform = Capacitor.getPlatform();
  const encoded = encodeURIComponent(address);

  if (platform === "android") {
    window.location.href = `geo:0,0?q=${encoded}`;
  } else if (platform === "ios") {
    window.location.href = `maps://maps.apple.com/?daddr=${encoded}`;
  } else {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
      "_blank",
      "noopener,noreferrer"
    );
  }
}
