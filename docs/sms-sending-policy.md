# SMS Sending Policy

UltraOffice2.0 should keep outbound SMS boring and traceable.

Allowed customer SMS sources right now:

- Manual user sends from the inbox/vendor/customer screens.
- IVR canvas and call/SMS intake replies through `sendIvrSms`.
- On My Way messages through `useSendOnMyWay`.
- Cart/proposal/payment messages tied to a customer cart or estimate cart.
- Explicitly approved JARVIS drafts from the pending SMS review UI.

Retired background SMS sources:

- `auto-advance-workflow`
- `run-lead-drip`
- `rain_day_blast`

Those retired sources are blocked centrally inside `send-sms`, so an old cron or workflow cannot wake up and text customers silently.

Next cleanup target:

- Move appointment reminders and review requests into either a visible office action or the IVR/canvas-style message system before enabling any automatic customer drip behavior.
