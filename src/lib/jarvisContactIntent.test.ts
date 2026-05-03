import { describe, expect, it } from "vitest";
import {
  classifyCustomerContactIntent,
  type JarvisActiveWorkContext,
} from "../../supabase/functions/_shared/jarvisContactIntent";

const activeServiceJob: JarvisActiveWorkContext = {
  activeJob: {
    id: "job-8470",
    hcp_job_number: "8470",
    scheduled_date: "2026-05-04",
  },
  activeEstimate: null,
  pendingBooking: null,
};

const activeEstimate: JarvisActiveWorkContext = {
  activeJob: null,
  activeEstimate: {
    id: "estimate-1",
    estimate_number: "Q-1001",
    scheduled_date: "2026-05-04",
  },
  pendingBooking: null,
};

type JarvisTrainingExpectation = {
  text: string;
  activeWork?: JarvisActiveWorkContext | null;
  intent:
    | "new_service_booking"
    | "new_estimate_request"
    | "maintenance_request"
    | "quote_follow_up"
    | "reschedule_existing_work"
    | "cancel_existing_work"
    | "eta_request"
    | "access_instructions"
    | "pet_warning"
    | "callback_number_update"
    | "confirm_existing_work"
    | "customer_info_update"
    | "billing_question"
    | "warranty_or_membership_question"
    | "complaint"
    | "general_question";
  actionCategory: string;
  shouldCreateNewWork: boolean;
};

const buildTrainingCases = (
  texts: string[],
  expected: Omit<JarvisTrainingExpectation, "text">,
): JarvisTrainingExpectation[] => texts.map((text) => ({ text, ...expected }));

const southTexasTrainingCases: JarvisTrainingExpectation[] = [
  ...buildTrainingCases([
    "Hey y'all, the AC is blowing hot air again. Can somebody come by today in Floresville?",
    "My outside unit is humming but the fan ain't spinning.",
    "The house is 84 degrees and the unit won't cool down.",
    "Our AC quit sometime last night. We need service in La Vernia.",
    "Air handler is leaking water through the ceiling.",
    "The condenser keeps tripping the breaker every time it starts.",
    "We have no cool air at all and we've got babies in the house.",
    "Can y'all send a tech? The unit is making a loud buzzing noise.",
    "The drain line backed up and water is all over the hallway.",
    "My heat pump is iced over outside.",
    "The thermostat says cool on but nothing is running.",
    "A/C isn't keeping up after lunch, can you come look at it?",
    "The fan outside won't kick on and it's getting hot in here.",
    "My inside unit is running but the outside unit is dead.",
    "The heater smells funny when it turns on.",
    "Our furnace won't light this morning.",
    "The mini split in the shop stopped cooling.",
    "Can I get a service call for an AC not cooling in Adkins?",
    "The air coming out is barely cool and the line is frozen.",
    "My unit keeps turning on and off every few minutes.",
  ], {
    activeWork: null,
    intent: "new_service_booking",
    actionCategory: "new_appointment",
    shouldCreateNewWork: true,
  }),
  ...buildTrainingCases([
    "Can y'all put us down for our spring tune up?",
    "I need to schedule my Comfort Club maintenance.",
    "Is it time for our fall check?",
    "We need our yearly AC maintenance before summer.",
    "Can Jonathan come do the tune-up next week?",
    "I want to renew and schedule the maintenance plan visit.",
    "Please schedule our service agreement check.",
    "Need our filters checked and system tuned up.",
    "Can someone do our seasonal maintenance in Poth?",
    "We are club members and need the spring check.",
    "I'd like to get on the calendar for a maintenance visit.",
    "Y'all usually come twice a year, can we set that up?",
    "Can we book a tune up for the upstairs and downstairs units?",
    "Need the fall heat check when y'all have time.",
    "Our Comfort Club inspection is due.",
    "Can you do a maintenance check before it gets hot?",
    "Please schedule the preseason checkup.",
    "I need a tune-up on my carrier system.",
    "Can we get our maintenance done Friday morning?",
    "We missed our spring check and need to reschedule it.",
  ], {
    activeWork: null,
    intent: "maintenance_request",
    actionCategory: "new_appointment",
    shouldCreateNewWork: true,
  }),
  ...buildTrainingCases([
    "How much for a 3 ton Carrier system installed?",
    "Can you send pricing for a Day and Night unit?",
    "I need a bid for a carport in the backyard.",
    "Can Clint work up a quote for replacing the ductwork?",
    "What would a Goodman five ton system cost?",
    "Please send me an estimate for a metal roof on the porch.",
    "Can y'all price a new condenser only?",
    "I want a proposal for the upstairs replacement.",
    "Need numbers on a Carrier Performance gas system.",
    "How much would financing be on option two?",
    "Can you send that bid over today?",
    "What is the price difference between good better best?",
    "Do you have an estimate for the flat roof carport?",
    "Can y'all quote a mini split for the garage?",
    "Please build me a proposal for a new heat pump.",
    "I'm ready for pricing on the 4 ton system.",
    "Can you send the replacement options again?",
    "What was the total on the install proposal?",
    "Need a quote for replacing both systems.",
    "Can you price the repair and the replacement both ways?",
  ], {
    activeWork: null,
    intent: "quote_follow_up",
    actionCategory: "follow_up",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "I think we need to replace our old unit.",
    "We want a new system upstairs before summer.",
    "Can Clint come look at an install for our house?",
    "Need someone to look at replacing the whole AC.",
    "Our unit is 20 years old and we want replacement options.",
    "I want to install central air in the addition.",
    "Can y'all come out for a new unit consultation?",
    "We need to replace the gas heat system in the attic.",
    "I'd like someone to look at a new heat pump.",
    "Can you come measure for a replacement system?",
    "We are thinking about installing a mini split.",
    "The downstairs unit needs to be replaced.",
    "Can we schedule Clint for a replacement visit?",
    "I need a new AC system for my rental.",
    "We're adding on and need an AC install.",
    "Can someone come size a new system?",
    "We need a new air handler and condenser.",
    "I'm interested in replacing my old Carrier unit.",
    "Can y'all come inspect for a full system changeout?",
    "I need an install appointment for a new unit.",
  ], {
    activeWork: null,
    intent: "new_estimate_request",
    actionCategory: "new_appointment",
    shouldCreateNewWork: true,
  }),
  ...buildTrainingCases([
    "Gate code is 2580.",
    "Use gate code #1945 and turn left at the barn.",
    "The lockbox code is 7788.",
    "Come through the side gate, code 4321.",
    "Garage code is 0909 if nobody answers.",
    "The key is under the blue pot by the front door.",
    "Entry code is 2468 star.",
    "Use the keypad on the black gate, code 5555.",
    "Gate will be locked, code is 1010.",
    "Please use the side door by the carport.",
    "The ranch gate code is 3712.",
    "Lockbox on the meter loop is 8080.",
    "Drive around back and use code 6161.",
    "The front door keypad is 2026.",
    "Gate instructions: press 1234 then pound.",
    "The access code for the community gate is 8899.",
    "Key is with my neighbor if the gate is closed.",
    "Door code changed to 7007.",
    "Tell Jonathan the gate code is 1470.",
    "Use garage entry, code 3333.",
  ], {
    activeWork: activeServiceJob,
    intent: "access_instructions",
    actionCategory: "access_note",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "We have two dogs but they will be put up.",
    "Dog is friendly but loud.",
    "Please don't let the cats out.",
    "The big dog is in the backyard.",
    "I will put the dogs away before Jonathan gets there.",
    "Watch out for the German shepherd by the shop.",
    "The pets are inside today.",
    "My dog may bark but he doesn't bite.",
    "Cats will be in the laundry room.",
    "Please call before walking in because of the dogs.",
    "The dog is loose in the yard until noon.",
    "I have a puppy in the garage.",
    "The backyard has dogs, use the front gate.",
    "Dogs are put away in the bedroom.",
    "Please make sure the gate closes so the dog stays in.",
    "There are goats near the unit but they are friendly.",
    "My wife will put the cats up.",
    "Dog warning: he is loud when strangers show up.",
    "The tech needs to know about the dog in the side yard.",
    "Don't open the back door because of the pets.",
  ], {
    activeWork: activeServiceJob,
    intent: "pet_warning",
    actionCategory: "pet_warning",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "Please tell the tech to call my husband Jose at 210-555-4100.",
    "Use my wife's number today, 210-555-1111.",
    "Can Jonathan text me at this number instead?",
    "Have the installer call my son when he's close.",
    "Different number for today is 210-555-2222.",
    "Call my husband before heading over.",
    "Text my daughter when y'all are on the way.",
    "Please call me on my cell, not the house phone.",
    "Use this phone number for the appointment.",
    "Ask the technician to call Raul when he arrives.",
    "My wife has the gate code, call her first.",
    "The best callback number is 210-555-3333.",
    "Don't call my work number, call this one.",
    "Have Jonathan call the tenant at 210-555-4444.",
    "Please text my husband with the ETA.",
    "Use 210-555-5555 for all updates today.",
    "Can the tech call my dad before he gets there?",
    "Please have Clint text me instead of calling.",
    "The number changed to 210-555-6666.",
    "Tell the tech to call the office manager.",
  ], {
    activeWork: activeServiceJob,
    intent: "callback_number_update",
    actionCategory: "contact_update",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "Can we move tomorrow's appointment to Friday?",
    "I can't make it today, can we reschedule?",
    "Can y'all push us to next week?",
    "Friday morning would work better.",
    "Need to move the service call later in the day.",
    "Can we change the appointment to after lunch?",
    "I won't be home tomorrow.",
    "Can we do Wednesday instead?",
    "Please reschedule my tune up.",
    "Can you move job 8470 to Monday?",
    "Something came up, can we pick another day?",
    "Can we push the install date back?",
    "Need to change the time window.",
    "Tomorrow afternoon works better than morning.",
    "Can we slide this to the 15th?",
    "I'm stuck at work and need a later appointment.",
    "Can we move the visit to first thing Friday?",
    "Please change our appointment day.",
    "Can y'all come Saturday instead?",
    "We need to bump the job to next week.",
  ], {
    activeWork: activeServiceJob,
    intent: "reschedule_existing_work",
    actionCategory: "schedule_change",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "Don't send anybody. It's working now.",
    "Please cancel our appointment.",
    "We no longer need the service call.",
    "Cancel Friday, my brother fixed it.",
    "We're good now, no need to come.",
    "Don't come out today.",
    "Please take us off the schedule.",
    "I need to cancel the install for now.",
    "Never mind, don't send the tech.",
    "We got it handled.",
    "Cancel my tune up this week.",
    "I don't need the appointment anymore.",
    "Please cancel job 8470.",
    "We decided not to do the work.",
    "Don't need y'all after all.",
    "Cancel the visit, landlord sent someone else.",
    "Please stop the appointment for tomorrow.",
    "No longer need a tech.",
    "We're going to wait, cancel it.",
    "Take me off for Monday.",
  ], {
    activeWork: activeServiceJob,
    intent: "cancel_existing_work",
    actionCategory: "schedule_change",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "Is Jonathan still coming between 2 and 4?",
    "What's the ETA?",
    "Do you know when the tech will be here?",
    "Is he on the way yet?",
    "Can I get a 30 minute heads up?",
    "What time should we expect y'all?",
    "Is the installer already headed this way?",
    "When will Clint arrive?",
    "Are y'all still coming today?",
    "Any update on arrival time?",
    "Can you tell me when he is close?",
    "Is the tech running behind?",
    "What time is Jonathan showing up?",
    "Are we still on for 10 to 12?",
    "Do I need to stay home all afternoon?",
    "Please text me when the tech is on the way.",
    "Is someone still coming this morning?",
    "Can I get an ETA for job 8470?",
    "Do you know if he's close?",
    "When are y'all headed out here?",
  ], {
    activeWork: activeServiceJob,
    intent: "eta_request",
    actionCategory: "eta_request",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "Yes sir, that time works.",
    "Sounds good, see you then.",
    "Confirmed for tomorrow.",
    "That works for us.",
    "Yes, we'll be home.",
    "10 to 12 is fine.",
    "Friday morning works.",
    "Ok that's good.",
    "Perfect, thank you.",
    "We can do that time.",
    "Yes ma'am, confirmed.",
    "That appointment time is good.",
    "We'll see Jonathan then.",
    "Works for me.",
    "That's fine with us.",
    "Yes please keep us on the schedule.",
    "Good deal, see y'all tomorrow.",
    "That window works.",
    "Confirmed, gate will be open.",
    "Yes, my wife will be there.",
  ], {
    activeWork: activeServiceJob,
    intent: "confirm_existing_work",
    actionCategory: "confirmation",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "Can you send me the link to pay my invoice?",
    "I paid but don't see a receipt.",
    "What's my balance?",
    "Can I use a card?",
    "Please resend the invoice.",
    "Did my payment go through?",
    "Can you email the receipt?",
    "I need to pay the deposit.",
    "Where do I pay online?",
    "Can you send the bill again?",
    "I was charged twice.",
    "Need a copy of the paid invoice.",
    "Can I split payment between two cards?",
    "Do you take financing payments?",
    "I need the invoice for my records.",
    "My card declined, can you resend the link?",
    "Can I pay when the tech arrives?",
    "Please text me the payment link.",
    "I need a receipt for taxes.",
    "What's left owed on the job?",
  ], {
    activeWork: null,
    intent: "billing_question",
    actionCategory: "thread_attention",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "Did you register my warranty?",
    "What is going on with the CPS rebate?",
    "Do we still have labor warranty?",
    "Is my Comfort Club still active?",
    "When does our membership expire?",
    "Can you send the warranty paperwork?",
    "Did the city inspection get scheduled?",
    "Who submits the CPS form?",
    "Do I have parts warranty on this system?",
    "Can you check my service agreement?",
    "Is the labor warranty one year or ten?",
    "Need help with the rebate paperwork.",
    "Did Carrier get registered?",
    "Can you send proof of warranty?",
    "Is the maintenance plan paid up?",
    "When is my next Comfort Club visit?",
    "Do I need to do anything for CPS?",
    "Can you check if my install warranty is active?",
    "Was my equipment registered with Day and Night?",
    "Did the inspection pass?",
  ], {
    activeWork: null,
    intent: "warranty_or_membership_question",
    actionCategory: "thread_attention",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "The system you fixed yesterday is still not cooling.",
    "Y'all came out and it's still doing the same thing.",
    "I'm not happy, the AC already quit again.",
    "The repair never fixed the problem.",
    "The tech left and now it is leaking again.",
    "Still not working after the visit.",
    "We paid yesterday and it's hot again today.",
    "The unit is still freezing after Jonathan worked on it.",
    "It started making the same noise again.",
    "This is the third time for the same issue.",
    "The house is still hot after the repair.",
    "Y'all said it was fixed but it ain't.",
    "The drain backed up again after service.",
    "The new motor is making noise.",
    "I'm upset because nobody called me back.",
    "The thermostat still isn't working after the tech came.",
    "The system still won't heat after the repair.",
    "The job was completed but the problem is back.",
    "We need somebody to come back out.",
    "The same code came back on the unit.",
  ], {
    activeWork: activeServiceJob,
    intent: "complaint",
    actionCategory: "thread_attention",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "My name is Raul Sanchez, 9988 McAway Rd, raul@example.com, 210-555-3300.",
    "This is Jenny Maguire, email is jenny@example.com.",
    "Address is 8602 Keila Orchard.",
    "Phone number is 210-555-1212.",
    "My last name is Gonzales with a z.",
    "Email is maria.g@gmail.com.",
    "The service address is 412 Oak Valley Dr.",
    "Use my billing address at PO Box 55.",
    "My name is Hector Rodriguez.",
    "This is for Lupita Reyna at 8602 Keila Orchard.",
    "Best email is draxnaught@gmail.com.",
    "Customer name is John Herring.",
    "The address is 9988 Macaway Road.",
    "It's under my wife's name, Angela Perez.",
    "Please update my phone to 210-555-7777.",
    "My email changed to raul.sanchez@example.com.",
    "The job is at my rental on Bluebonnet Lane.",
    "Name is Robert Diaz, phone 210-555-8888.",
    "I'm at 123 County Road 321 in Stockdale.",
    "The contact is Clay Hayes, clay@example.com.",
  ], {
    activeWork: null,
    intent: "customer_info_update",
    actionCategory: "thread_attention",
    shouldCreateNewWork: false,
  }),
  ...buildTrainingCases([
    "Y'all do work out in Floresville?",
    "Are you open Saturdays?",
    "Do you service mobile homes?",
    "Can someone call me when y'all open?",
    "What areas do you cover?",
    "Do you work on commercial units?",
    "Are you licensed and insured?",
    "Do you sell filters?",
    "Do y'all do duct cleaning?",
    "What's your office address?",
    "Can I get your email?",
    "Do you work in Pleasanton?",
    "Are you family owned?",
    "Do you install thermostats?",
    "What brands do you carry?",
    "Do y'all offer financing?",
    "Can I talk to Clint?",
    "Is there a trip charge?",
    "Do you do second opinions?",
    "What time do y'all close?",
  ], {
    activeWork: null,
    intent: "general_question",
    actionCategory: "new_lead",
    shouldCreateNewWork: false,
  }),
].flatMap((item) => item).filter((_, index) => index % 20 !== 19).slice(0, 300);

describe("jarvisContactIntent", () => {
  it("keeps a quote thread as a quote follow-up when the latest text is only contact info", () => {
    const thread = [
      "Customer: Can you quote a carport with a flat roof option?",
      "Office: Yes sir, I can work this up Monday morning.",
      "Customer: David and Erica Mora, 16214 River Cliff, erodri516@gmail.com, 210-555-1212",
    ].join("\n");

    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: thread,
      extracted: {
        intent: "info_reply",
        phone: "210-555-1212",
        email: "erodri516@gmail.com",
        address: "16214 River Cliff",
        quote_subject: "carport with flat roof option",
        follow_up_due: "Monday morning",
      },
      activeWork: null,
    });

    expect(result.intent).toBe("quote_follow_up");
    expect(result.actionCategory).toBe("follow_up");
    expect(result.shouldCreateNewWork).toBe(false);
  });

  it("treats quote approval as moving the proposal forward instead of a generic confirmation", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "The customer approved option B and said let's do it with financing.",
      extracted: { call_intent: "estimate_followup" },
      activeWork: activeEstimate,
    });

    expect(result.intent).toBe("quote_follow_up");
    expect(result.suggestedAction).toContain("move the quote");
  });

  it("attaches gate codes and pet warnings to an existing job", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Gate code is 2468 and the dogs will be in the backyard.",
      extracted: {},
      activeWork: activeServiceJob,
    });

    expect(result.intent).toBe("access_instructions");
    expect(result.shouldAttachToExistingWork).toBe(true);
    expect(result.shouldCreateNewWork).toBe(false);
  });

  it("recognizes a reschedule request for existing work", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Can we move tomorrow's appointment to Friday morning instead?",
      activeWork: activeServiceJob,
    });

    expect(result.intent).toBe("reschedule_existing_work");
    expect(result.actionCategory).toBe("schedule_change");
  });

  it("recognizes an answering service service-call text as a new booking", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Answering Service: Caller Jane Wilson, phone 210-555-8080, 123 Main St. AC is not cooling and wants someone today.",
      activeWork: null,
    });

    expect(result.intent).toBe("new_service_booking");
    expect(result.shouldCreateNewWork).toBe(true);
  });

  it("does not create a new booking when a customer asks for ETA on active work", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Do you know when Jonathan will be here?",
      activeWork: activeServiceJob,
    });

    expect(result.intent).toBe("eta_request");
    expect(result.shouldCreateNewWork).toBe(false);
  });

  it("recognizes warranty and CPS rebate questions after install", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Did you register my warranty yet and what is going on with the CPS rebate?",
      activeWork: null,
    });

    expect(result.intent).toBe("warranty_or_membership_question");
    expect(result.actionCategory).toBe("thread_attention");
  });

  it("treats plain contact details as enrichment when there is no quote context", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "My name is Jenny Maguire. My email is jenny@example.com and my phone number is 210-555-2222.",
      extracted: { intent: "info_reply", phone: "210-555-2222", email: "jenny@example.com" },
      activeWork: null,
    });

    expect(result.intent).toBe("customer_info_update");
  });

  it.each([
    {
      text: "Hey y'all my AC is blowing hot air. Can somebody come out today? I'm in La Vernia.",
      activeWork: null,
      intent: "new_service_booking",
      actionCategory: "new_appointment",
      shouldCreateNewWork: true,
    },
    {
      text: "Our unit froze up again last night and now it's leaking in the hallway.",
      activeWork: null,
      intent: "new_service_booking",
      actionCategory: "new_appointment",
      shouldCreateNewWork: true,
    },
    {
      text: "Thermostat is blank and the outside unit won't kick on.",
      activeWork: null,
      intent: "new_service_booking",
      actionCategory: "new_appointment",
      shouldCreateNewWork: true,
    },
    {
      text: "Can y'all come do our spring tune up next week?",
      activeWork: null,
      intent: "maintenance_request",
      actionCategory: "new_appointment",
      shouldCreateNewWork: true,
    },
    {
      text: "I need a quote on replacing our old upstairs unit before summer gets bad.",
      activeWork: null,
      intent: "quote_follow_up",
      actionCategory: "follow_up",
      shouldCreateNewWork: false,
    },
    {
      text: "How much for a 3 ton Carrier system installed?",
      activeWork: null,
      intent: "quote_follow_up",
      actionCategory: "follow_up",
      shouldCreateNewWork: false,
    },
    {
      text: "Gate code is #2580. Dog is friendly but loud.",
      activeWork: activeServiceJob,
      intent: "access_instructions",
      actionCategory: "access_note",
      shouldCreateNewWork: false,
    },
    {
      text: "Please tell the tech to call my husband Jose at 210-555-4100.",
      activeWork: activeServiceJob,
      intent: "callback_number_update",
      actionCategory: "contact_update",
      shouldCreateNewWork: false,
    },
    {
      text: "Can we push tomorrow to Friday? My wife has a doctor appointment.",
      activeWork: activeServiceJob,
      intent: "reschedule_existing_work",
      actionCategory: "schedule_change",
      shouldCreateNewWork: false,
    },
    {
      text: "Don't send anybody. It's working now.",
      activeWork: activeServiceJob,
      intent: "cancel_existing_work",
      actionCategory: "schedule_change",
      shouldCreateNewWork: false,
    },
    {
      text: "Is Jonathan still coming between 2 and 4?",
      activeWork: activeServiceJob,
      intent: "eta_request",
      actionCategory: "eta_request",
      shouldCreateNewWork: false,
    },
    {
      text: "Yes sir, that time works for us.",
      activeWork: activeServiceJob,
      intent: "confirm_existing_work",
      actionCategory: "confirmation",
      shouldCreateNewWork: false,
    },
    {
      text: "We liked option 2. Go ahead with financing.",
      activeWork: activeEstimate,
      intent: "quote_follow_up",
      actionCategory: "follow_up",
      shouldCreateNewWork: false,
    },
    {
      text: "Can you send me the link to pay my invoice?",
      activeWork: null,
      intent: "billing_question",
      actionCategory: "thread_attention",
      shouldCreateNewWork: false,
    },
    {
      text: "Do we still have labor warranty on the install from last year?",
      activeWork: null,
      intent: "warranty_or_membership_question",
      actionCategory: "thread_attention",
      shouldCreateNewWork: false,
    },
    {
      text: "Is our Comfort Club about to expire? Need to renew it.",
      activeWork: null,
      intent: "warranty_or_membership_question",
      actionCategory: "thread_attention",
      shouldCreateNewWork: false,
    },
    {
      text: "The system you fixed yesterday is still not cooling. We need help.",
      activeWork: activeServiceJob,
      intent: "complaint",
      actionCategory: "thread_attention",
      shouldCreateNewWork: false,
    },
    {
      text: "This is the answering service. Caller Maria Gonzales at 210-555-9090 says her heater won't turn on in Adkins.",
      activeWork: null,
      intent: "new_service_booking",
      actionCategory: "new_appointment",
      shouldCreateNewWork: true,
    },
    {
      text: "My name is Raul Sanchez, 9988 McAway Rd, raul@example.com. Phone is 210-555-3300.",
      activeWork: null,
      intent: "customer_info_update",
      actionCategory: "thread_attention",
      shouldCreateNewWork: false,
    },
    {
      text: "Y'all do work out in Floresville?",
      activeWork: null,
      intent: "general_question",
      actionCategory: "new_lead",
      shouldCreateNewWork: false,
    },
  ] as const)("routes South Texas customer SMS: $text", ({ text, activeWork, intent, actionCategory, shouldCreateNewWork }) => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text,
      activeWork,
    });

    expect(result.intent).toBe(intent);
    expect(result.actionCategory).toBe(actionCategory);
    expect(result.shouldCreateNewWork).toBe(shouldCreateNewWork);
  });

  it("keeps the extended South Texas SMS training suite at 300 examples", () => {
    expect(southTexasTrainingCases).toHaveLength(300);
  });

  it.each(southTexasTrainingCases)(
    "routes extended South Texas SMS training: $text",
    ({ text, activeWork, intent, actionCategory, shouldCreateNewWork }) => {
      const result = classifyCustomerContactIntent({
        channel: "sms",
        text,
        activeWork,
      });

      expect(result.intent).toBe(intent);
      expect(result.actionCategory).toBe(actionCategory);
      expect(result.shouldCreateNewWork).toBe(shouldCreateNewWork);
    },
  );
});
