/**
 * viewAsDevices.ts — Device presets for Admin "View As" frame emulation.
 * Sizes are CSS pixels (logical), matching what the device reports to web.
 */
export type ViewAsDeviceKey =
  | "none"
  | "s23"
  | "s23ultra"
  | "pixel8"
  | "iphone15"
  | "iphone15pm"
  | "iphoneSE"
  | "fold5";

export interface ViewAsDevice {
  label: string;
  w: number | null;
  h: number | null;
  dpr: number;
  /** "android" | "ios" — controls notch / punch-hole styling */
  os?: "android" | "ios";
}

export const VIEW_AS_DEVICES: Record<ViewAsDeviceKey, ViewAsDevice> = {
  none:       { label: "Full screen (no frame)",       w: null, h: null, dpr: 1 },
  s23:        { label: "Samsung Galaxy S23",            w: 360,  h: 780, dpr: 3,    os: "android" },
  s23ultra:   { label: "Samsung Galaxy S23 Ultra",      w: 384,  h: 824, dpr: 3.5,  os: "android" },
  pixel8:     { label: "Google Pixel 8",                w: 412,  h: 915, dpr: 2.625, os: "android" },
  iphone15:   { label: "iPhone 15",                     w: 393,  h: 852, dpr: 3,    os: "ios" },
  iphone15pm: { label: "iPhone 15 Pro Max",             w: 430,  h: 932, dpr: 3,    os: "ios" },
  iphoneSE:   { label: "iPhone SE",                     w: 375,  h: 667, dpr: 2,    os: "ios" },
  fold5:      { label: "Galaxy Z Fold 5 (folded)",      w: 344,  h: 882, dpr: 3,    os: "android" },
};

export const DEVICE_KEYS: ViewAsDeviceKey[] = [
  "none", "s23", "s23ultra", "pixel8", "fold5", "iphone15", "iphone15pm", "iphoneSE",
];
