import { getTaskModel } from "./getTaskModel.ts";
import { verifyAddress, distanceFromSA, getServiceAreaTier } from "./verifyContact.ts";
import { getCentralNow, getCentralHour } from "./formatters.ts";

// ────────────────────────────────────────────────────────────
// Shared Intake Logic — used by sms-webhook AND simulate-intake
// dryRun = true skips side effects (no customer/job/action creation)
// ────────────────────────────────────────────────────────────

export interface IntakeOpts {
  from: string;
  body: string;
  supabase: any;
  contactName: string | null;
  dryRun?: boolean; // simulator mode — no real DB writes for customers/jobs/actions
}

export interface IntakeResult {
  reply: string;
  shouldEscalate: boolean;
  trace?: string[];
}

/** Get current Central Time hour and context */
export async function getTimeContext(supabase: any): Promise<{ hour: number; isBusinessDay: boolean; isBusinessHours: boolean; timeContext: "business_hours" | "after_hours" | "after_10pm" }> {
  const { hour, dayOfWeek } = getCentralHour();

  const { data: ivrConfig } = await supabase
    .from("ivr_config")
    .select("business_hours_start, business_hours_end, business_days")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const businessDays: number[] = ivrConfig?.business_days || [1, 2, 3, 4, 5];
  const startHour = parseInt((ivrConfig?.business_hours_start || "08:00").split(":")[0]);
  const endHour = parseInt((ivrConfig?.business_hours_end || "17:00").split(":")[0]);

  const isBusinessDay = businessDays.includes(dayOfWeek);
  const isBusinessHours = isBusinessDay && hour >= startHour && hour < endHour;

  let timeContext: "business_hours" | "after_hours" | "after_10pm";
  if (hour >= 22 || hour < 7) {
    timeContext = "after_10pm";
  } else if (isBusinessHours) {
    timeContext = "business_hours";
  } else {
    timeContext = "after_hours";
  }

  return { hour, isBusinessDay, isBusinessHours, timeContext };
}

/** Get owner name from company_settings */
export async function getOwnerName(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("company_settings")
    .select("value")
    .eq("key", "owner_name")
    .maybeSingle();
  if (data?.value) return data.value;
  const { data: co } = await supabase
    .from("company_settings")
    .select("value")
    .eq("key", "company_name")
    .maybeSingle();
  return co?.value || "the team";
}

/** Get time-of-day greeting */
export function getTimeGreeting(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Handle SMS intake workflow — warm handoff style */
export async function handleIntakeSession(opts: IntakeOpts): Promise<IntakeResult | null> {
  const { from, body, supabase, contactName, dryRun = false } = opts;
  const normalizedFrom = from.replace(/\D/g, "").slice(-10);

  // Check for existing intake session (2 hour window)
  const staleMins = 120;
  const staleThreshold = new Date(Date.now() - staleMins * 60 * 1000).toISOString();
  const { data: session } = await supabase
    .from("sms_intake_sessions")
    .select("*")
    .eq("phone_number", normalizedFrom)
    .neq("current_step", "complete")
    .gte("updated_at", staleThreshold)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── No session yet — start the warm handoff ──
  if (!session) {
    // Step 1: Check if customer exists + check leads table
    let existingCustomer: any = null;
    let matchedLead: any = null;

    if (!dryRun) {
      const [custResult, leadResult] = await Promise.all([
        supabase.rpc("find_customer_by_phone", { digits: normalizedFrom }).maybeSingle(),
        supabase.from("leads").select("*").ilike("phone", `%${normalizedFrom.slice(-10)}`).eq("status", "new").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      existingCustomer = custResult.data;
      matchedLead = leadResult.data;

      if (matchedLead) {
        await supabase.from("leads").update({ status: "contacted", contacted_at: new Date().toISOString() }).eq("id", matchedLead.id);
        console.log(`[SMS Intake] Matched lead ${matchedLead.id} for phone ${normalizedFrom}`);
      }
    }

    // Step 2: AI intent classification
    let intent = "general";
    try {
      const aiResp = await fetch(`${supabaseUrl}/functions/v1/ai-task-agent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          model: await getTaskModel(supabase, "customer_parsing"),
          messages: [{
            role: "user",
            content: `Classify this customer message into exactly ONE category. Return ONLY the category word, nothing else.

Categories:
- repair (AC broken, not cooling, leaking, emergency, no air, making noise, water damage)
- maintenance (tune-up, seasonal check, filter, annual service, cleaning)
- install_quote (new system, pricing, SEER rating, equipment upgrade, replacement quote, how much for)
- general (unclear, greeting only, question about hours, other)

Customer message: "${body}"

Reply with ONLY one word: repair, maintenance, install_quote, or general`,
          }],
        }),
      });
      const aiData = await aiResp.json();
      const classified = (aiData.reply || "").trim().toLowerCase().replace(/[^a-z_]/g, "");
      if (["repair", "maintenance", "install_quote", "general"].includes(classified)) {
        intent = classified;
      }
    } catch (e) {
      console.error("Intent classification failed:", e);
    }

    const department = (intent === "install_quote") ? "Sales" : "Dispatch";
    const { hour, timeContext } = await getTimeContext(supabase);
    const ownerName = await getOwnerName(supabase);
    const greeting = getTimeGreeting(hour);

    // If customer found — skip info collection, go straight to handoff
    if (existingCustomer) {
      const custName = [existingCustomer.first_name, existingCustomer.last_name].filter(Boolean).join(" ");
      const custFirstName = existingCustomer.first_name || custName.split(" ")[0] || "there";

      let nextStep: string;
      let reply: string;

      if (timeContext === "after_10pm") {
        nextStep = "complete";
        reply = `Hey ${custFirstName}! 👋 Good to hear from you. I'll get this right over to ${ownerName}'s desk and they'll reach out to you first thing in the morning! Have a great ${greeting}! 😊`;

        if (!dryRun) {
          await createCallbackAction(supabase, {
            customerName: custName,
            customerId: existingCustomer.id,
            phone: from,
            intent,
            department,
            timeContext,
            callbackPreference: "morning_contact",
            initialMessage: body,
          });
        }

        await supabase.from("sms_intake_sessions").insert({
          phone_number: normalizedFrom,
          current_step: "complete",
          collected_data: { intent, department, customer_found: true, customer_id: existingCustomer.id, name: custName, time_context: timeContext, initial_message: body },
          completed_at: new Date().toISOString(),
        });

        return { reply, shouldEscalate: false };
      }

      if (timeContext === "business_hours") {
        reply = `Hey ${custFirstName}! 👋 Good to hear from you. Let me get this right over to ${department}'s desk! What's a good number to call you back on, or do you prefer text?`;
      } else {
        reply = `Hey ${custFirstName}! 👋 We're closed for the day, but I can still get you taken care of. Would you prefer a call or text back? (We're available until 10 PM)`;
      }

      nextStep = "callback_pref";
      await supabase.from("sms_intake_sessions").insert({
        phone_number: normalizedFrom,
        current_step: nextStep,
        collected_data: { intent, department, customer_found: true, customer_id: existingCustomer.id, name: custName, time_context: timeContext, initial_message: body },
      });

      return { reply, shouldEscalate: false };
    }

    // ── New customer — need to collect info ──
    await supabase.from("sms_intake_sessions").insert({
      phone_number: normalizedFrom,
      current_step: "collect_name",
      collected_data: { intent, department, customer_found: false, time_context: timeContext, initial_message: body },
    });

    let serviceAck = "";
    if (intent === "repair") serviceAck = "Oh no, let's get that taken care of! ";
    else if (intent === "maintenance") serviceAck = "Smart move — let's get that scheduled! ";
    else if (intent === "install_quote") serviceAck = "Awesome, we'd love to help with that! ";

    return {
      reply: `Hey there! 👋 ${serviceAck}I just need a couple things to get you set up — what's your name?`,
      shouldEscalate: false,
    };
  }

  // ── Session exists — advance through the warm handoff ──
  const step = session.current_step;
  const collected = session.collected_data || {};

  if (step === "complete") return null;

  switch (step) {
    case "collect_name": {
      const name = body.trim();
      const newCollected = { ...collected, name };

      await supabase.from("sms_intake_sessions")
        .update({ current_step: "collect_address", collected_data: newCollected, updated_at: new Date().toISOString() })
        .eq("id", session.id);

      return {
        reply: `Nice to meet you, ${name.split(" ")[0]}! 😊 What's the address where you need service?`,
        shouldEscalate: false,
      };
    }

    case "collect_address": {
      const address = body.trim();
      const trace: string[] = [`📍 Raw address input: "${address}"`];
      const { hour, timeContext } = await getTimeContext(supabase);
      const ownerName = await getOwnerName(supabase);
      const greeting = getTimeGreeting(hour);
      const department = collected.department || "Dispatch";
      const firstName = (collected.name || "").split(" ")[0] || "there";

      // ── Geocode with SA proximity bias ──
      const geocoded = await verifyAddress(address);
      
      if (geocoded && geocoded.confidence > 0.7) {
        trace.push(`✅ Google match: "${geocoded.standardized}" (confidence: ${geocoded.confidence.toFixed(2)})`);
        const miles = distanceFromSA(geocoded.lat, geocoded.lng);
        const tier = getServiceAreaTier(miles);
        trace.push(`📏 Distance from SA: ${miles.toFixed(1)} mi → ${tier}`);

        const newCollected = {
          ...collected,
          raw_address: address,
          verified_address: geocoded.standardized,
          address_lat: geocoded.lat,
          address_lng: geocoded.lng,
          distance_from_sa_miles: Math.round(miles * 10) / 10,
          service_area_tier: tier,
          time_context: timeContext,
        };

        await supabase.from("sms_intake_sessions")
          .update({ current_step: "confirm_address", collected_data: newCollected, updated_at: new Date().toISOString() })
          .eq("id", session.id);

        return {
          reply: `Just to make sure — is your address ${geocoded.standardized}? 📍`,
          shouldEscalate: false,
          trace,
        };
      } else {
        trace.push(geocoded
          ? `⚠️ Low confidence match: "${geocoded.standardized}" (${geocoded.confidence.toFixed(2)})`
          : `❌ No geocode match found`);

        const newCollected = { ...collected, raw_address: address, time_context: timeContext };
        await supabase.from("sms_intake_sessions")
          .update({ current_step: "collect_address_retry", collected_data: newCollected, updated_at: new Date().toISOString() })
          .eq("id", session.id);

        return {
          reply: `I want to make sure I've got the right spot — can you send the full address with city and zip? 🏠`,
          shouldEscalate: false,
          trace,
        };
      }
    }

    case "collect_address_retry": {
      const address = body.trim();
      const trace: string[] = [`📍 Retry address input: "${address}"`];

      const geocoded = await verifyAddress(address);
      const { hour, timeContext } = await getTimeContext(supabase);

      if (geocoded && geocoded.confidence > 0.5) {
        trace.push(`✅ Retry match: "${geocoded.standardized}" (confidence: ${geocoded.confidence.toFixed(2)})`);
        const miles = distanceFromSA(geocoded.lat, geocoded.lng);
        const tier = getServiceAreaTier(miles);
        trace.push(`📏 Distance from SA: ${miles.toFixed(1)} mi → ${tier}`);

        const newCollected = {
          ...collected,
          raw_address: address,
          verified_address: geocoded.standardized,
          address_lat: geocoded.lat,
          address_lng: geocoded.lng,
          distance_from_sa_miles: Math.round(miles * 10) / 10,
          service_area_tier: tier,
          time_context: timeContext,
        };

        await supabase.from("sms_intake_sessions")
          .update({ current_step: "confirm_address", collected_data: newCollected, updated_at: new Date().toISOString() })
          .eq("id", session.id);

        return {
          reply: `Got it — is this right? ${geocoded.standardized} 📍`,
          shouldEscalate: false,
          trace,
        };
      }

      // Still can't match — store raw and move on
      trace.push(`⚠️ Still no confident match — storing raw address and moving on`);
      const newCollected = { ...collected, address, time_context: timeContext };

      const ownerName = await getOwnerName(supabase);
      const greeting = getTimeGreeting(hour);
      const department = collected.department || "Dispatch";
      const firstName = (collected.name || "").split(" ")[0] || "there";

      if (timeContext === "after_10pm") {
        newCollected.callback_preference = "morning_contact";
        if (!dryRun) {
          const customerId = await createNewCustomer(supabase, { name: collected.name, phone: from, address });
          if (customerId) newCollected.customer_id = customerId;
          await createCallbackAction(supabase, {
            customerName: collected.name || firstName, customerId: customerId || null, phone: from,
            intent: collected.intent || "general", department, timeContext,
            callbackPreference: "morning_contact", initialMessage: collected.initial_message || "",
          });
        }
        await supabase.from("sms_intake_sessions")
          .update({ current_step: "complete", collected_data: newCollected, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() })
          .eq("id", session.id);
        return {
          reply: `Got it, ${firstName}! 👍 I've got you in our system. I'll get this to ${ownerName}'s desk and they'll contact you first thing in the morning. Have a great ${greeting}!`,
          shouldEscalate: false, trace,
        };
      }

      let handoffMsg: string;
      if (timeContext === "business_hours") {
        handoffMsg = `No worries, ${firstName}! I've got your info — let me get this right over to ${department}'s desk! What's a good number to call you back on, or do you prefer text?`;
      } else {
        handoffMsg = `Got it, ${firstName}! We're closed for the day but I can get you a call or text right away — which do you prefer?`;
      }

      await supabase.from("sms_intake_sessions")
        .update({ current_step: "callback_pref", collected_data: newCollected, updated_at: new Date().toISOString() })
        .eq("id", session.id);

      return { reply: handoffMsg, shouldEscalate: false, trace };
    }

    case "confirm_address": {
      const lower = body.toLowerCase().trim();
      const trace: string[] = [`🔍 Address confirmation response: "${body.trim()}"`];
      const isYes = /^(y|yes|yep|yeah|yup|correct|that'?s?\s*(right|it|correct)|si|sí|affirmative|looks?\s*good)$/i.test(lower);
      const isNo = /^(n|no|nope|nah|wrong|incorrect|not?\s*(right|correct))$/i.test(lower);

      if (isYes) {
        trace.push(`✅ Customer confirmed address`);
        const address = collected.verified_address || collected.raw_address;
        const newCollected = { ...collected, address, address_confirmed: true };
        const { hour, timeContext } = await getTimeContext(supabase);
        const ownerName = await getOwnerName(supabase);
        const greeting = getTimeGreeting(hour);
        const department = collected.department || "Dispatch";
        const firstName = (collected.name || "").split(" ")[0] || "there";

        newCollected.time_context = timeContext;

        if (timeContext === "after_10pm") {
          newCollected.callback_preference = "morning_contact";
          if (!dryRun) {
            const customerId = await createNewCustomer(supabase, { name: collected.name, phone: from, address });
            if (customerId) newCollected.customer_id = customerId;
            await createCallbackAction(supabase, {
              customerName: collected.name || firstName, customerId: customerId || null, phone: from,
              intent: collected.intent || "general", department, timeContext,
              callbackPreference: "morning_contact", initialMessage: collected.initial_message || "",
            });
          }
          await supabase.from("sms_intake_sessions")
            .update({ current_step: "complete", collected_data: newCollected, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() })
            .eq("id", session.id);
          return {
            reply: `Got it, ${firstName}! 👍 I've got you in our system. I'll get this to ${ownerName}'s desk and they'll contact you first thing in the morning. Have a great ${greeting}!`,
            shouldEscalate: false, trace,
          };
        }

        let handoffMsg: string;
        if (timeContext === "business_hours") {
          handoffMsg = `Perfect, ${firstName}! I've got you in our system. Let me get this right over to ${department}'s desk! What's a good number to call you back on, or do you prefer text?`;
        } else {
          handoffMsg = `Got it, ${firstName}! I've got you in our system. We're closed for the day but I can get you a call or text right away — which do you prefer?`;
        }

        await supabase.from("sms_intake_sessions")
          .update({ current_step: "callback_pref", collected_data: newCollected, updated_at: new Date().toISOString() })
          .eq("id", session.id);

        return { reply: handoffMsg, shouldEscalate: false, trace };
      }

      if (isNo) {
        trace.push(`❌ Customer rejected address — going back to collect`);
        await supabase.from("sms_intake_sessions")
          .update({ current_step: "collect_address", collected_data: { ...collected, verified_address: null }, updated_at: new Date().toISOString() })
          .eq("id", session.id);
        return {
          reply: `No problem! Can you send me the correct address? 🏠`,
          shouldEscalate: false, trace,
        };
      }

      // Treat as a corrected address — re-geocode
      trace.push(`🔄 Treating response as corrected address — re-geocoding`);
      const corrected = await verifyAddress(body.trim());
      if (corrected && corrected.confidence > 0.5) {
        const miles = distanceFromSA(corrected.lat, corrected.lng);
        const tier = getServiceAreaTier(miles);
        trace.push(`✅ Re-geocoded: "${corrected.standardized}" (${corrected.confidence.toFixed(2)}) → ${miles.toFixed(1)} mi, ${tier}`);

        const newCollected = {
          ...collected,
          raw_address: body.trim(),
          verified_address: corrected.standardized,
          address_lat: corrected.lat,
          address_lng: corrected.lng,
          distance_from_sa_miles: Math.round(miles * 10) / 10,
          service_area_tier: tier,
        };

        await supabase.from("sms_intake_sessions")
          .update({ current_step: "confirm_address", collected_data: newCollected, updated_at: new Date().toISOString() })
          .eq("id", session.id);

        return {
          reply: `Got it — is this right? ${corrected.standardized} 📍`,
          shouldEscalate: false, trace,
        };
      }

      trace.push(`⚠️ Corrected address didn't match — storing raw`);
      const newCollected = { ...collected, address: body.trim() };
      await supabase.from("sms_intake_sessions")
        .update({ current_step: "callback_pref", collected_data: newCollected, updated_at: new Date().toISOString() })
        .eq("id", session.id);

      const firstName = (collected.name || "").split(" ")[0] || "there";
      return {
        reply: `No worries, ${firstName} — I've got that noted! What's a good number to call you back on, or do you prefer text?`,
        shouldEscalate: false, trace,
      };
    }

    case "callback_pref": {
      const lower = body.toLowerCase();
      let preference = "text";
      if (lower.includes("call") || lower.includes("phone") || lower.includes("ring")) {
        preference = "call";
      } else if (lower.includes("text") || lower.includes("sms") || lower.includes("message")) {
        preference = "text";
      }

      const phoneMatch = body.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
      const callbackNumber = phoneMatch ? phoneMatch[0] : from;

      const newCollected = { ...collected, callback_preference: preference, callback_number: callbackNumber };

      if (!dryRun) {
        let customerId = collected.customer_id || null;
        if (!collected.customer_found && !customerId) {
          customerId = await createNewCustomer(supabase, {
            name: collected.name || null,
            phone: callbackNumber !== from ? callbackNumber : from,
            address: collected.address || null,
          });
          if (customerId) newCollected.customer_id = customerId;
        }
      }

      await supabase.from("sms_intake_sessions")
        .update({ current_step: "collect_time", collected_data: newCollected, updated_at: new Date().toISOString() })
        .eq("id", session.id);

      const dept = newCollected.department || "Dispatch";
      const timePrompt = dept === "Sales"
        ? `Great! What time works best for you? We're available for calls and texts Monday through Sunday, 8 AM – 10 PM! (Sundays we're at church 9–12 so no calls during that time 😊) ⏰`
        : `Great! What time works best for you? Our service visits run Monday through Friday, 8 AM – 5 PM in 2-hour blocks 🔧 ⏰`;

      return {
        reply: timePrompt,
        shouldEscalate: false,
      };
    }

    case "collect_time": {
      const timeDept = collected.department || "Dispatch";
      const isServiceDept = timeDept !== "Sales";

      const serviceRules = `Valid window: Monday–Friday, 8:00 AM – 5:00 PM ONLY. Weekends are INVALID.`;
      const salesRules = `Valid window: Monday–Sunday, 8:00 AM – 10:00 PM. EXCEPTION: Sunday 9:00 AM – 12:00 PM is INVALID (church).`;
      const validationRules = isServiceDept ? serviceRules : salesRules;

      let preferredTime = body.trim();
      try {
        const timeResp = await fetch(`${supabaseUrl}/functions/v1/ai-task-agent`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "chat",
            model: await getTaskModel(supabase, "customer_parsing"),
            messages: [{
              role: "user",
              content: `Extract the preferred appointment day and time from this customer reply.

${validationRules}

Rules:
- Return format: "DAY H:MM AM/PM" (e.g. "Monday 2:00 PM", "Tomorrow 9:30 AM")
- If they mention "tomorrow", "Monday", etc., include the day
- If no day specified, return just the time like "2:00 PM" (assume next available)
- If the time falls OUTSIDE the valid window, return "INVALID"
- If Sunday 9 AM–12 PM and this is Sales, return "CHURCH_CONFLICT"
- If weekend and this is Service, return "WEEKEND_INVALID"
- If you can't determine a time, return "UNCLEAR"

Customer reply: "${body}"

Return ONLY the result string, nothing else.`,
            }],
          }),
        });
        const timeData = await timeResp.json();
        const parsed = (timeData.reply || "").trim();
        
        if (parsed === "WEEKEND_INVALID") {
          await supabase.from("sms_intake_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session.id);
          return {
            reply: `Our service techs are available Monday through Friday, 8 AM – 5 PM — what time in that window works for you? 🔧`,
            shouldEscalate: false,
          };
        }

        if (parsed === "CHURCH_CONFLICT") {
          await supabase.from("sms_intake_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session.id);
          return {
            reply: `We're at church Sundays from 9 to 12 — could we do before 9 AM or after noon? 😊`,
            shouldEscalate: false,
          };
        }

        if (parsed === "INVALID") {
          await supabase.from("sms_intake_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session.id);
          const invalidMsg = isServiceDept
            ? `Our service techs are available Monday through Friday, 8 AM – 5 PM — what time in that window works for you? 🔧`
            : `We're available 8 AM – 10 PM, Monday through Sunday (except Sundays 9–12) — what time works? 😊`;
          return { reply: invalidMsg, shouldEscalate: false };
        }
        
        if (parsed === "UNCLEAR") {
          await supabase.from("sms_intake_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session.id);
          const unclearMsg = isServiceDept
            ? `No worries! Just let me know a time that works — Monday through Friday, 8 AM – 5 PM 🔧`
            : `No worries! Just let me know a time that works — 8 AM – 10 PM, any day! (Except Sundays 9–12) 😊`;
          return { reply: unclearMsg, shouldEscalate: false };
        }
        
        preferredTime = parsed;
      } catch (e) {
        console.error("Time parsing failed:", e);
      }

      const newCollected = { ...collected, preferred_time: preferredTime };
      const ownerName = await getOwnerName(supabase);
      const { hour } = await getTimeContext(supabase);
      const greeting = getTimeGreeting(hour);
      const firstName = (collected.name || "").split(" ")[0] || "there";
      const department = collected.department || "Dispatch";
      const preference = collected.callback_preference || "text";

      if (!dryRun) {
        await createCallbackAction(supabase, {
          customerName: collected.name || contactName || from,
          customerId: collected.customer_id || null,
          phone: collected.callback_number || from,
          intent: collected.intent || "general",
          department,
          timeContext: collected.time_context || "business_hours",
          callbackPreference: preference,
          initialMessage: collected.initial_message || "",
          preferredTime,
        });
      }

      await supabase.from("sms_intake_sessions")
        .update({ current_step: "complete", collected_data: newCollected, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() })
        .eq("id", session.id);

      const contactMethod = preference === "call" ? "call" : "text";
      let closingReply: string;

      if (department === "Sales") {
        closingReply = `All set, ${firstName}! 👍 I'll get this to ${ownerName}'s desk — he'll ${contactMethod} you around ${preferredTime}. Have a great ${greeting}! 😊`;
      } else {
        closingReply = `All set, ${firstName}! 👍 I'll get this over to Dispatch. Just so you know — our service visits are booked in 2-hour windows, and your tech will text you when he's heading your way. Sometimes the previous job runs long or short, so the actual arrival could shift a bit, but we'll always keep you in the loop! Dispatch will reach out to confirm that those times are available for you! Have a great ${greeting}! 😊`;
      }

      return { reply: closingReply, shouldEscalate: false };
    }

    default:
      return { reply: "", shouldEscalate: true };
  }
}

/** Create a new customer record (with phone dedup), return the ID */
async function createNewCustomer(supabase: any, info: { name: string | null; phone: string; address: string | null }): Promise<string | null> {
  const digits = info.phone.replace(/\D/g, "").slice(-10);
  if (digits.length >= 10) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .or(`phone.ilike.%${digits}%,mobile_phone.ilike.%${digits}%`)
      .limit(1);
    if (existing?.[0]) {
      console.log(`SMS dedup: found existing customer ${existing[0].id} for ${info.phone}`);
      if (info.address) {
        await supabase.from("customers").update({ address: info.address }).eq("id", existing[0].id).is("address", null);
      }
      return existing[0].id;
    }
  }

  if (info.address) {
    const zipMatch = info.address.match(/\b(\d{5})\b/);
    if (zipMatch) {
      const zip = zipMatch[1];
      const streetPart = info.address.replace(/,?\s*\w{2}\s*\d{5}.*$/, "").trim().toLowerCase().replace(/\b(apt|ste|suite|unit|#)\s*\S*/gi, "").trim();
      if (streetPart.length >= 5) {
        const { data: addrMatch } = await supabase
          .from("customers")
          .select("id")
          .ilike("address", `%${streetPart}%`)
          .eq("zip", zip)
          .limit(1);
        if (addrMatch?.[0]) {
          console.log(`SMS dedup (address): found existing customer ${addrMatch[0].id} at ${info.address}`);
          if (digits.length >= 10) {
            const formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
            await supabase.from("customers").update({ mobile_phone: formatted }).eq("id", addrMatch[0].id).is("mobile_phone", null);
          }
          return addrMatch[0].id;
        }
      }
    }
  }

  const nameParts = (info.name || "").split(" ");
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "";

  const { data } = await supabase.from("customers").insert({
    first_name: firstName,
    last_name: lastName,
    phone: info.phone,
    address: info.address || null,
  }).select("id").single();

  if (data?.id) {
    await supabase.from("activity_log").insert({
      action: "sms_intake_customer_created",
      details: `New customer via SMS warm handoff: ${firstName} ${lastName}`,
    });
  }

  return data?.id || null;
}

/** Route completed intake — Sales → dispatch board job, Service → Mission Control action item */
async function createCallbackAction(supabase: any, info: {
  customerName: string;
  customerId: string | null;
  phone: string;
  intent: string;
  department: string;
  timeContext: string;
  callbackPreference: string;
  initialMessage: string;
  preferredTime?: string;
}): Promise<void> {
  const ownerName = await getOwnerName(supabase);
  const prefLabel = info.callbackPreference === "call" ? "phone call" : info.callbackPreference === "morning_contact" ? "morning contact" : "text";
  const timeNote = info.preferredTime ? ` (preferred: ${info.preferredTime})` : "";

  if (info.department === "Sales") {
    const { data: ownerEmp } = await supabase
      .from("employees")
      .select("name")
      .ilike("name", `%${ownerName.split(" ")[0]}%`)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const assignTo = ownerEmp?.name || ownerName;

    const ct = getCentralNow();
    let callDate: string;
    let startHour: number;

    if (info.timeContext === "after_10pm") {
      const tomorrow = new Date(ct.getTime());
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      while (tomorrow.getUTCDay() === 0 || tomorrow.getUTCDay() === 6) {
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      }
      callDate = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
      startHour = 8;
    } else if (info.preferredTime) {
      const dayNames: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      const preferredLower = info.preferredTime.toLowerCase();
      const resolvedDate = new Date(ct.getTime());

      if (preferredLower.includes("tomorrow")) {
        resolvedDate.setUTCDate(resolvedDate.getUTCDate() + 1);
      } else {
        for (const [dayName, dayNum] of Object.entries(dayNames)) {
          if (preferredLower.includes(dayName)) {
            const currentDay = resolvedDate.getUTCDay();
            let daysAhead = dayNum - currentDay;
            if (daysAhead <= 0) daysAhead += 7;
            resolvedDate.setUTCDate(resolvedDate.getUTCDate() + daysAhead);
            break;
          }
        }
      }

      callDate = `${resolvedDate.getUTCFullYear()}-${String(resolvedDate.getUTCMonth() + 1).padStart(2, "0")}-${String(resolvedDate.getUTCDate()).padStart(2, "0")}`;
      const timeParsed = info.preferredTime.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
      if (timeParsed) {
        let h = parseInt(timeParsed[1]);
        const ampm = timeParsed[3].toUpperCase();
        if (ampm === "PM" && h !== 12) h += 12;
        if (ampm === "AM" && h === 12) h = 0;
        startHour = Math.max(8, Math.min(h, 21));
      } else {
        startHour = Math.min(ct.getUTCHours() + 1, 20);
      }
    } else {
      callDate = `${ct.getUTCFullYear()}-${String(ct.getUTCMonth() + 1).padStart(2, "0")}-${String(ct.getUTCDate()).padStart(2, "0")}`;
      startHour = Math.min(ct.getUTCHours() + 1, 20);
    }

    const arrivalStart = `${callDate}T${String(startHour).padStart(2, "0")}:00:00`;
    const endMin = startHour * 60 + 30;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const arrivalEnd = `${callDate}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;

    await supabase.from("jobs").insert({
      job_type: "phone_call",
      status: "scheduled",
      assigned_to: assignTo,
      scheduled_date: callDate,
      arrival_start: arrivalStart,
      arrival_end: arrivalEnd,
      customer_name: info.customerName,
      customer_id: info.customerId || null,
      customer_phone: info.phone,
      description: `📞 ${prefLabel.toUpperCase()} CALLBACK${timeNote} — ${info.initialMessage || "Sales inquiry via SMS"}`,
    });

    await supabase.from("activity_log").insert({
      action: "sms_sales_callback_booked",
      details: `Sales callback for ${info.customerName} booked on ${assignTo}'s schedule for ${callDate} at ${startHour}:00`,
    });
  } else {
    await supabase.from("action_items").insert({
      title: `${info.customerName} wants a ${prefLabel} from ${info.department}${timeNote}`,
      description: info.initialMessage || `Callback requested via SMS intake`,
      category: "dispatch_callback",
      priority: info.intent === "repair" ? "high" : "medium",
      source: "sms_intake",
      customer_phone: info.phone,
      status: "pending",
      metadata: {
        customer_id: info.customerId,
        preferred_contact: info.callbackPreference,
        preferred_time: info.preferredTime || null,
        callback_phone: info.phone,
        intent: info.intent,
        department: info.department,
        time_context: info.timeContext,
        initial_message: info.initialMessage,
      },
    });
  }

  // ── Inject copilot action card for dispatcher ──
  try {
    const { data: sessions } = await supabase
      .from("copilot_sessions")
      .select("id, user_id")
      .is("ended_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessions?.[0]) {
      const actionType = info.intent === "estimate" ? "book_estimate" : info.intent === "maintenance" ? "book_maintenance" : "book_job";
      const suggestedActions = [
        {
          type: actionType,
          customer_name: info.customerName,
          customer_id: info.customerId,
          phone: info.phone,
          description: info.initialMessage,
        },
        { type: "call_back", phone: info.phone, customer_name: info.customerName },
        { type: "send_text", phone: info.phone, customer_name: info.customerName },
      ];

      await supabase.from("copilot_messages").insert({
        session_id: sessions[0].id,
        user_id: sessions[0].user_id,
        role: "assistant",
        content: `💬 **SMS booking request from ${info.customerName}**: "${info.initialMessage || "Service needed"}". Ready to book or follow up?`,
        metadata: { suggested_actions: suggestedActions },
      });
      console.log(`SMS booking action card injected for ${info.customerName}`);
    }
  } catch (cardErr) {
    console.error("SMS booking action card error:", cardErr);
  }
}
