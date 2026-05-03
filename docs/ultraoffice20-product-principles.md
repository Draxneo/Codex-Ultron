# UltraOffice2.0 Product Principles

These are the current rules for rebuilding UltraOffice2.0. Keep this file tight. If a future idea does not support these rules, it should not become core UI.

The plain-English project doctrine lives in `docs/ultraoffice20-north-star.md`. That document is the north star; this file expands it into product rules.

## 1. Company Brains

UltraOffice is built around the real work loops of the company.

### Intake Brain: Who, What, Why

Intake HQ understands the customer and the reason for contact.

- Who is contacting us?
- Are they known, unknown, a new lead, a vendor, or an employee?
- What do they need?
- Why are they calling or texting?
- What information is missing or uncertain?
- What action should be prepared for approval?

Intake owns calls, SMS, customer matching, AI-filled intake forms, address verification, booking/estimate intent, and human-approved action buttons.

Calls and customer texts should surface in Intake HQ instead of a duplicate global slide-out. Team communication belongs in Team HQ; operational follow-up created from team context belongs in Now HQ as an action card. Deeper phone, SMS, team chat, and JARVIS tools can exist as full pages, but Intake is the customer communication triage surface.

### Operations Brain: When, Where

Dispatch HQ runs the day.

- When can we do the work?
- Where is the job?
- Which technician should go?
- What route makes sense?
- What is late, unassigned, overloaded, inefficient, or at risk?
- Who on the board needs a call or text update?

Operations owns the dispatch board, calendar, tech lanes, route health, backlog placement, schedule adjustments, and dispatch-specific JARVIS help.

### Field Brain: Who, What, When, Where, Why

The technician mobile app turns the dispatch plan into completed, approved work.

- Who is the customer?
- What problem did the technician find?
- When is the appointment, approval, repair, replacement, or install happening?
- Where is the customer, equipment, attic, closet, condenser, panel, drain, or install constraint?
- Why should the customer approve the repair or replacement?

Field owns arrival, diagnosis, photos, notes, JARVIS field help, repair options, replacement options, customer-ready presentations, approval links, payment links, financing links, and install handoff back to Dispatch HQ.

### Customer Brain: Relationship Memory

Customer HQ remembers the whole relationship after the immediate work is done.

- Who is this customer or household?
- What have we quoted, sold, installed, repaired, photographed, or promised?
- When did work happen, when should we follow up, and when do memberships or warranties expire?
- Where are their service locations, systems, attachments, and job records?
- Why should we call, text, remarket, renew, protect, or prioritize them?

Customer owns the master customer record, estimates, jobs, invoices, attachments, phone calls, SMS, Comfort Club status, warranty certificates, labor warranty, parts warranty, service history, private notes, and drip or remarketing context.

### Quote Brain: Follow-Up Pipeline

Quote HQ turns outstanding estimates into a follow-up campaign.

- Who has an open quote?
- What did we propose?
- When was it created, sent, viewed, followed up, approved, or declined?
- Where does the quoted work belong in the customer and dispatch story?
- Why has it not closed yet, and what human-approved touch should happen next?

Quote owns open estimates, quote stages, presentation status, customer responses, approval links, financing links, follow-up drafts, close/lost outcomes, and human-approved drip actions.

All brains share the same data. They are separate work modes, not separate systems.

## 2. AI Mode And Human Mode Everywhere

Every primary operating surface should support both modes.

- AI Mode: JARVIS listens, extracts, fills, verifies, suggests, drafts, and queues action buttons.
- Human Mode: a person can manually inspect, override, edit, create, move, or recover the workflow if AI is unavailable or wrong.
- Switching modes should not lose the selected customer, job, conversation, transcript, or draft action.
- Critical business state must never exist only inside AI.

## 3. JARVIS Prepares, Humans Approve

JARVIS should not silently mutate important operational or customer-facing records.

- JARVIS prepares the work.
- Humans approve the work.
- Mutating actions should go through reviewable action cards or approval buttons.
- Each approval should show what will happen, what data JARVIS used, and what is missing or uncertain.
- Every approved customer promise must land on a named person or a shared office queue.
- Person-owned work must be scheduled before the card leaves Now HQ.
- Office-queue work stays visible until someone marks it handled.
- CPS rebates, warranties, permits, inspections, paperwork, and billing cleanup usually belong to a shared office queue unless the dispatcher chooses a person.

## 3A. Brand Voice

Customer-facing communication should sound like personal service from the Carnes family to the customer's family.

- Warm, neighborly, plainspoken, and useful.
- Short enough for SMS.
- Personal without sounding fake or overdone.
- Prefer phrases like "our family taking care of yours" or "the Carnes family" when they fit naturally.
- Avoid stiff corporate language unless a legal, billing, or safety context requires it.

## 4. Macro Buttons Over Manual Data Entry

The UI should behave more like smart spreadsheet macros than long manual forms.

Good buttons include:

- Confirm address
- Text customer to confirm address
- Create customer
- Link customer
- Book service call
- Book estimate
- Move job
- Assign technician
- Send ETA
- Add note, gate code, or dog warning
- Mark follow-up

Each action card should let the user approve, edit, reject, or open deeper context.

If a dispatcher is typing a lot, the UI is probably asking for too much manual work.

## 5. Fewer Panels, Clearer Jobs

Panels must earn their place.

- Do not add panels just because data exists.
- Prefer one focused workspace plus one action/assistant area over many competing sidebars.
- If two panels answer the same question, merge them or choose the one that better supports the current brain.
- Intake panels should support Who, What, and Why.
- Operations panels should support When and Where.
- Field panels should support Who, What, When, Where, and Why without burying the technician in menu navigation.
- Customer panels should support the relationship memory: work done, work proposed, conversations, files, protection, and follow-up.
- Quote panels should support open quotes, follow-up stage, prepared human-approved touch, and close/lost decision.

## 6. Field Approval Loop

The technician experience should be built around this loop:

- Arrive at the job.
- Diagnose the problem.
- Capture notes, photos, and findings.
- Build repair or replacement options.
- Present the comfort, reliability, peace of mind, efficiency, warranty, rebate, and financing story.
- Send the customer approval link.
- Receive approval notification.
- Convert approved repair work into invoice/payment.
- Convert approved replacement work into an install job for Dispatch HQ.

The cart is not the sales tool by itself. The proposal/presentation sells the work; the cart confirms what the customer approved.

## 7. Customer Relationship Loop

The customer experience should be built around this loop:

- Recognize the customer from phone, SMS, job, estimate, or address.
- See the active work and recent history immediately.
- Review every estimate, job, invoice, photo, call, and text from one record.
- Track Comfort Club status, warranty coverage, labor warranty, parts warranty, and expiration dates.
- Keep notes and context that explain why the customer matters.
- Trigger follow-up, renewal, remarketing, service reminders, and replacement opportunities from approved action buttons.

The customer record is not a generic CRM profile. It is the company's long-term memory for that customer.

## 8. Quote Follow-Up Loop

The quote experience should be built around this loop:

- Capture the estimate and presentation.
- Send the customer a clear approval path.
- Watch for viewed, approved, changed, declined, or stale status.
- Prepare the next SMS, call, or quote revision as a human-approved action.
- Keep every open quote visible until it is won, lost, canceled, or converted.
- Convert approved replacement work into an install job for Dispatch HQ.

Quote HQ is not just a quote builder. It is the sales follow-up pipeline for work we have already proposed.
