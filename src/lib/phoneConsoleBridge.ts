const PHONE_CHANNEL_NAME = "ultraoffice-phone-console";

export type PhoneConsoleMessage =
  | { type: "dial"; number: string }
  | { type: "status"; status: string; error?: string | null };

export function createPhoneConsoleChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  return new BroadcastChannel(PHONE_CHANNEL_NAME);
}

export function openPhoneConsole(number?: string) {
  const params = new URLSearchParams();
  if (number) params.set("dial", number);
  const url = `/phone-console${params.toString() ? `?${params.toString()}` : ""}`;
  const win = window.open(url, "UltraOfficePhone", "width=420,height=720");
  win?.focus();

  if (number) {
    const sendDial = () => {
      const channel = createPhoneConsoleChannel();
      channel?.postMessage({ type: "dial", number } satisfies PhoneConsoleMessage);
      channel?.close();
    };
    window.setTimeout(sendDial, 400);
    window.setTimeout(sendDial, 1200);
  }
}
