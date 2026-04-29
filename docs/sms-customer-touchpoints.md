# SMS Customer Touchpoints

This is the working catalog for customer-facing text messages. The goal is one clear format per business event, with human approval anywhere Jarvis drafts a reply.

## Brand Voice

Carnes and Sons SMS should sound like personal service from our family to theirs: warm, neighborly, plainspoken, and useful. It should not read like a corporate ticket system.

## Active Send Paths

| Moment | Source | Current behavior |
| --- | --- | --- |
| Manual SMS / media | `useSendSms` -> `send-sms` | Universal send path for typed dispatcher and technician texts. |
| Appointment confirmation | `send-job-reminders` manual path | Uses `appointment_confirmation` template, falls back to safe confirmation copy. |
| Appointment reminder | `send-job-reminders` batch path | Uses `appointment_reminder_day_before`, asks for confirm/reschedule plus gate/pet/access notes. |
| Technician on the way | `useSendOnMyWay` | Uses route cache ETA when available. Message says the tech is on the way and includes `ETA is X minutes`. |
| Job complete | `useJobActions.finishJob` and `TechStatusCard.handleFinish` | Sends thank-you text after the job is marked complete. |
| Review request | `useJobActions.sendReviewRequest` | Sends review link if configured, otherwise asks for a reply. |
| Invoice link | `CustomerInvoicePanel`, `hcp-text-invoice` | Sends invoice/payment link after invoice is created or synced. |
| Warranty email request | `WarrantyRegistrationTool` | Asks customer for email so equipment warranty can be registered. |
| Intake form link | `customer-actions` | Sends a customer intake form link when office needs missing setup data. |
| Missed call | IVR / voice callbacks | Uses IVR department configuration and SMS template picker. |
| Post-call thank-you | IVR / voice callbacks | Uses IVR department configuration when enabled. Templates now exist for known and unknown callers. |
| Google / LSA relay | `sms-webhook` | Detects Google relay-style inbound SMS, replies asking for the real callback number, and creates a lead action card. |
| Estimate / quote reminder | `EstimateCartStatus`, `QuickQuote`, `TechEstimateCartDrawer` | Sends customer-facing quote or presentation links. |
| Quote / cart link | `useJobCart`, cart and quote UI | Customer-facing quote/cart SMS remains human-triggered through the universal sender. |

## Template Slugs

- `appointment_confirmation`
- `appointment_reminder_day_before`
- `appointment_reminder_sameday`
- `eta_to_customer`
- `job_complete_thank_you`
- `post_call_known_customer`
- `post_call_unknown_customer`
- `missed_call_during_hours`
- `missed_call_after_hours`
- `google_lsa_relay_capture`
- `review_request`

## Design Rules

- Texts should be friendly, short, and operational.
- Use family-service language naturally: "our family taking care of yours", "the Carnes family", or "letting our family serve yours".
- Keep the warmth real and brief. Do not overdo it or make every message sentimental.
- Avoid stiff phrases like "your request has been received", "per our records", or "we appreciate your business" when a warmer family phrase fits.
- Ask for gate code, pet note, access instructions, or service details inside the existing thread.
- Jarvis can draft and classify, but customer-facing replies stay human-approved unless the workflow is a deterministic operational status text.
- Google relay numbers are not treated as real customer numbers. Capture the real phone number first.
- ETA texts use the dispatch route cache. If no ETA is cached, send the on-the-way text without making a live Google API call.
