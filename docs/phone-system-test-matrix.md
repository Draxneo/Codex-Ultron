# Phone System Test Matrix

Run this against the test Twilio number before any production number points at UltraOffice 2.0.

## Registration

- Electron desktop registers after login and microphone permission.
- Electron desktop recovers after sleep/wake.
- Android registers with native Twilio Voice and FCM push credentials.
- Android receives incoming call while foregrounded.
- Android receives incoming call while backgrounded.
- Android does not create duplicate registrations for the same identity.

## Inbound Calls

- PSTN caller presses sales option, Electron agent answers.
- PSTN caller presses sales option, Android agent answers.
- PSTN caller presses sales option, agent rejects.
- PSTN caller presses sales option, no agent answers.
- PSTN caller presses sales option while all agents are actually on calls.
- PSTN caller presses sales option while one agent appears stale but is not on a real call.
- PSTN caller enters invalid IVR input.
- PSTN caller gives no IVR input three times.
- After-hours call routes to configured after-hours behavior.
- Answering service overflow receives missed/no-answer calls.

## Outbound Calls

- Electron outbound call answered.
- Electron outbound call busy.
- Electron outbound call failed.
- Electron outbound call no-answer.
- Android outbound call answered.
- Android outbound call busy.
- Android outbound call failed.
- Android outbound call no-answer.

## Hangups

- Agent hangs up first.
- Customer hangs up first.
- Dispatcher rejects incoming call.
- Caller hangs up while ringing.
- Caller hangs up during IVR.
- Twilio completed callback arrives before frontend disconnect.
- Frontend disconnect arrives before Twilio completed callback.

## Bad Network / Device State

- Electron reconnecting then reconnected.
- Electron reconnecting then closed.
- Browser refresh during active call recovers recent state from backend.
- Android app backgrounded during active call.
- Android app foregrounded during active call.
- Device token expires and refreshes.
- Device token refresh fails.

## Backend Reliability

- Duplicate status callback does not duplicate call rows.
- Duplicate dial action callback does not duplicate voicemail/action items.
- Parent and child Call SIDs reconcile into one call.
- Late ringing callback cannot reopen ended call.
- Late answered callback cannot reopen failed/no-answer call.
- Recording callback attaches to the same call row.
- Transcription callback attaches to the same call row.
- Twilio signature validation rejects invalid external requests.
- Callback failure logs one system trace event, not hundreds.

## User Interface

- Exactly one current call card is visible.
- Answer button disables after first click.
- Hangup button disables after first click.
- Timer starts only after answered/open/connected.
- Timer stops on ended/failed.
- Labels match reducer state:
  - Incoming call
  - Calling...
  - Ringing...
  - Connecting...
  - On call
  - Reconnecting...
  - Ending call...
  - Call ended
  - Missed call
  - Call failed
