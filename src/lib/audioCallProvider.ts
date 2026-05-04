export type AudioCallProviderName = "stub_link";

export type ProviderCall = {
  provider: AudioCallProviderName;
  providerCallId: string;
  callUrl: string;
  startedAt: string;
  endedAt?: string | null;
};

export interface AudioCallProvider {
  createCall(input: { conversationId: string }): Promise<ProviderCall>;
  getCall(providerCallId: string): Promise<ProviderCall | null>;
  joinCall(call: ProviderCall): Promise<{ joinedAt: string }>;
  endCall(call: ProviderCall): Promise<{ endedAt: string }>;
}

function getCallBaseUrl() {
  const configured = import.meta.env.VITE_TEAM_AUDIO_CALL_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "https://calls.local";
}

class StubAudioCallProvider implements AudioCallProvider {
  private calls = new Map<string, ProviderCall>();

  async createCall(input: { conversationId: string }) {
    const providerCallId = crypto.randomUUID();
    const call: ProviderCall = {
      provider: "stub_link",
      providerCallId,
      callUrl: `${getCallBaseUrl()}/team/audio/${input.conversationId}/${providerCallId}`,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    this.calls.set(providerCallId, call);
    return call;
  }

  async getCall(providerCallId: string) {
    return this.calls.get(providerCallId) ?? null;
  }

  async joinCall(call: ProviderCall) {
    if (typeof window !== "undefined") {
      window.open(call.callUrl, "_blank", "noopener,noreferrer");
    }
    return { joinedAt: new Date().toISOString() };
  }

  async endCall(call: ProviderCall) {
    const endedAt = new Date().toISOString();
    this.calls.set(call.providerCallId, { ...call, endedAt });
    return { endedAt };
  }
}

export const audioCallProvider: AudioCallProvider = new StubAudioCallProvider();
