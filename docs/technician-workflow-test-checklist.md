# Technician Workflow Test Checklist

Run this checklist on a real phone-sized viewport before relying on the tech workflow in the field.

## Tech Job List

- Sign in as a technician or use View As Tech.
- Confirm only assigned/allowed jobs appear.
- Confirm each job card shows customer, address, time window, status, job type, and phone/SMS access where available.
- Tap a job card and confirm it opens the correct job detail.

## Job Detail

- Confirm the first-screen workflow is obvious: Photos, Talk, Cart.
- Confirm sticky Photos / Talk / Cart buttons stay reachable while scrolling.
- Confirm Call Customer opens a real phone action.
- Confirm Text Customer opens or starts the correct SMS thread.
- Confirm On My Way sends through the existing SMS path and logs to the job/customer history.
- Confirm Contact Dispatch opens the chosen dispatch channel.

## Photos

- Take a photo from the camera button.
- Upload an existing photo.
- Upload a PDF or short video.
- Confirm every upload stays attached to the job even if AI/classification fails.
- Confirm thumbnails render through the universal media renderer.
- Select one or more attachments and send to dispatch.
- Select one or more attachments and send to customer.
- Confirm supply/cost documents are not accidentally customer-visible.

## JARVIS Voice

- Hold the mic and speak naturally: "This unit needs a capacitor, contactor, and condenser coil cleaning."
- Confirm transcript saves to `job_transcripts`.
- Confirm JARVIS reply stays human-in-the-loop.
- Confirm priced suggestions show as reviewable cart actions.
- Confirm no SMS, payment, or final price is sent automatically.
- Add one suggestion to the cart.
- Dismiss one suggestion and confirm it does not add to the cart.

## Cart And Quote

- Add a repair item manually.
- Add a part item manually.
- Add a custom line item.
- Edit quantity and price where allowed.
- Confirm cart total recalculates from server/database logic.
- Confirm missing customer phone blocks SMS send.
- Send the cart to the customer and confirm the SMS is logged.
- Confirm the public customer URL opens without internal login.
- Confirm the public URL does not expose internal notes, AI reasoning, or unrelated customer/job data.

## Customer Choices

- Open customer quote/cart URL.
- Confirm company branding and job/customer summary are correct.
- Confirm customer can approve, decline/contact, or continue to payment/financing where enabled.
- Confirm customer view/approval updates cart status internally.
- Confirm expired/invalid tokens do not expose quote data.

## Discounts And Financing

- Test a Comfort Club customer.
- Confirm Comfort Club savings are visible and not double-applied.
- Test a non-member customer.
- Confirm Comfort Club upsell appears with configurable benefits/price.
- Confirm cash discount and financing options are separate.
- Confirm financing/cash language comes from central settings/config, not scattered component copy.

## Security

- Confirm technician cannot open another tech's job unless role permissions allow it.
- Confirm public cart token cannot be guessed from sequential IDs.
- Confirm frontend cannot alter final totals.
- Confirm API keys/secrets are not exposed in browser output.

## Launch Gate

- Tech can complete a job visit with only phone-sized controls.
- Photos survive AI failure.
- Voice notes survive AI failure.
- JARVIS suggests but never acts without approval.
- Customer receives only approved quote/cart data.
- Office can see what happened afterward in job/customer history.
