# UltraOffice 2.0 Phone Core Rebuild

## Decision

The phone system should be rebuilt as a small, boring, reliable phone core instead of patched as scattered UI flags. The existing system has useful parts, but the current risk is that desktop, Android, Twilio callbacks, IVR routing, and call logs can each believe a different call state.

## What Twilio Expects

- Browser and Electron softphone calls use `@twilio/voice-sdk`, with `Device` registration and `Call` events driving immediate UI.
- Android must use native Twilio Voice SDK behavior for dependable background incoming calls. A WebView-only phone is not enough for real phone behavior.
- TwiML `<Dial>` and `<Client>` legs need `statusCallbackEvent="initiated ringing answered completed"` and `answerOnBridge="true"` where caller ringing should continue until an agent answers.
- Parent and child Call SIDs are separate legs. One UltraOffice call record must reconcile both legs into one conversation.
- Access tokens must be vended by the backend with a VoiceGrant. Native mobile identities need push credentials.

Official docs checked:
- https://www.twilio.com/docs/voice/client/javascript
- https://www.twilio.com/docs/voice/sdks/javascript/twiliodevice
- https://www.twilio.com/docs/voice/sdks/javascript/twiliocall
- https://www.twilio.com/docs/voice/twiml/dial
- https://www.twilio.com/docs/voice/twiml/client
- https://www.twilio.com/docs/voice/sdks/android
- https://www.twilio.com/docs/voice/voip-sdk/android/faq

## Current Code Reality

- Electron/web path exists in `src/hooks/useSoftphone.ts` using `@twilio/voice-sdk`.
- Android path exists in `src/hooks/useNativeSoftphone.ts` using `@capgo/capacitor-twilio-voice`, but it still has many direct `setState` paths instead of one reducer.
- Shared reducer exists in `src/lib/softphoneCallStateMachine.ts`; it is the right foundation, but only partially adopted.
- Token vending exists in `supabase/functions/twilio-token/index.ts` and already includes native push credential support.
- IVR/routing exists across `voice-webhook`, `voice-ivr-handler`, `voice-voicemail`, `voice-status-callback`, and `twilio-voice-twiml`.
- The repo does not currently contain a project-level `android/` native app folder, so the Android build is not fully owned by this codebase yet.

## Target Architecture

One phone truth in the frontend:
- One active call record.
- One state value: `idle`, `device_registering`, `ready`, `incoming_ringing`, `outgoing_dialing`, `outgoing_ringing`, `connecting`, `in_call`, `reconnecting`, `ending`, `ended`, `failed`, `offline`.
- All SDK events route through the reducer.
- UI reads labels/timers from the reducer state, not scattered booleans.

One durable truth in the backend:
- Twilio status callbacks are stored idempotently.
- Parent and child Call SIDs reconcile into one call.
- Terminal states cannot be reopened by older callbacks.
- Agent hangup marks `pending_ended_by = agent` before disconnect.
- Unknown hangups stay unknown unless backend evidence is clear.

Two platform adapters:
- Electron adapter: thin wrapper over `@twilio/voice-sdk`.
- Android adapter: native Twilio Voice SDK bridge, not WebView-only calling.

## Rebuild Order

1. Finish the shared call reducer contract and tests.
2. Move Electron/web lifecycle events fully through the reducer.
3. Move Android/native lifecycle events fully through the same reducer.
4. Harden backend Twilio callbacks with idempotency, parent/child SID reconciliation, and signature validation.
5. Generate/check in the native Android project and validate FCM/Twilio registration.
6. Run the live test-number matrix before moving any production numbers.

## Live Safety Rules

- Test number only until the matrix passes.
- Answering service overflow stays enabled as fail-safe.
- No phone call action should depend only on frontend state.
- No code path should play "all team members are busy" unless backend has real evidence of busy agents.
- No completed/ended/failed call can be reopened by late callbacks.
