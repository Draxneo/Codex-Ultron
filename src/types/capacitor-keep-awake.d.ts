declare module "@capacitor-community/keep-awake" {
  export const KeepAwake: {
    keepAwake(): Promise<void>;
    allowSleep(): Promise<void>;
    isKeptAwake(): Promise<{ isKeptAwake: boolean }>;
  };
}
