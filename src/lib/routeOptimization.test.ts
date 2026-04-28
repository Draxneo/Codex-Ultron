import { describe, expect, it } from "vitest";
import {
  buildRouteSmsDrafts,
  buildRouteSuggestion,
  detectRouteStopFlexibility,
  groupRouteStopsByTechnicianAndZip,
  normalizeRouteStops,
} from "./routeOptimization";

describe("routeOptimization", () => {
  it("normalizes job and estimate stops from app-style fields", () => {
    const [job, estimate] = normalizeRouteStops([
      {
        id: "job-1",
        customer_name: "Avery Reed",
        customer_phone: "210-555-1000",
        address: "101 Main St, San Antonio, TX 78201",
        assigned_to: "Sam Tech",
        scheduled_date: "2026-04-28T08:00:00.000Z",
        job_number: "42",
      },
      {
        id: "estimate-1",
        item_type: "estimate",
        customerName: "Blake Chen",
        postalCode: "78209-1234",
        technicianId: "tech-2",
        estimate_number: "77",
      },
    ]);

    expect(job.kind).toBe("job");
    expect(job.zip).toBe("78201");
    expect(job.technicianKey).toBe("Sam Tech");
    expect(job.reference).toBe("Job #42");

    expect(estimate.kind).toBe("estimate");
    expect(estimate.zip).toBe("78209");
    expect(estimate.technicianKey).toBe("tech-2");
    expect(estimate.reference).toBe("Estimate #77");
  });

  it("detects fixed and flexible timing from structured fields and notes", () => {
    expect(detectRouteStopFlexibility({ id: "a", is_fixed: true }).fixed).toBe(true);
    expect(detectRouteStopFlexibility({ id: "b", time_flexibility: "flexible" }).flexibility).toBe("flexible");
    expect(detectRouteStopFlexibility({ id: "c", notes: "Customer requested first stop, do not move" }).fixed).toBe(true);
    expect(detectRouteStopFlexibility({ id: "d", hcp_note: "Any time is fine, can move around" }).flexibility).toBe("flexible");
  });

  it("groups by technician and suggests one ordered route across ZIP clusters", () => {
    const normalized = normalizeRouteStops([
      {
        id: "flex",
        customer_name: "Flexible Customer",
        address: "300 Third St, San Antonio, TX 78201",
        assigned_to: "Sam Tech",
        notes: "Any time is fine",
      },
      {
        id: "fixed",
        customer_name: "Fixed Customer",
        address: "100 First St, San Antonio, TX 78201",
        assigned_to: "Sam Tech",
        arrival_start: "2026-04-28T09:00:00.000Z",
        notes: "Promised morning appointment",
      },
      {
        id: "other-zip",
        customer_name: "Other Zip",
        address: "200 Second St, San Antonio, TX 78209",
        assigned_to: "Sam Tech",
      },
    ]);

    const groups = groupRouteStopsByTechnicianAndZip(normalized);
    expect(groups).toHaveLength(1);

    const suggestion = buildRouteSuggestion(normalized);
    const [samRoute] = suggestion.groups;
    expect(samRoute.suggestedStops.map((item) => item.stop.id)).toEqual(["fixed", "flex", "other-zip"]);
    expect(samRoute.suggestedStops.map((item) => item.suggestedOrder)).toEqual([1, 2, 3]);
    expect(samRoute.suggestedStops[0].reasons.join(" ")).toContain("promised");
  });

  it("generates editable SMS drafts without sending anything", () => {
    const suggestion = buildRouteSuggestion([
      {
        id: "job-1",
        customer_name: "Avery Reed",
        customer_phone: "210-555-1000",
        assigned_to: "Sam Tech",
        arrival_start: "2026-04-28T14:00:00.000Z",
        arrival_end: "2026-04-28T16:00:00.000Z",
        job_number: "42",
      },
    ]);

    const [draft] = buildRouteSmsDrafts(suggestion, {
      companyName: "Carnes and Sons",
      includeStopNumber: true,
    });

    expect(draft.editable).toBe(true);
    expect(draft.to).toBe("210-555-1000");
    expect(draft.body).toContain("Hi Avery");
    expect(draft.body).toContain("Carnes and Sons");
    expect(draft.body).toContain("Job #42");
    expect(draft.body).toContain("stop 1");
  });
});
