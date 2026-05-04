import { describe, expect, it } from "vitest";
import { interpretTechCartSpeech, type TechCartEquipmentMatchup, type TechCartRepairCatalogItem } from "./techCartInterpreter";

const repairs: TechCartRepairCatalogItem[] = [
  {
    id: "repair-cap",
    name: "Capacitor Replacement",
    category: "Electrical",
    customer_description: "Replace failed run capacitor.",
    keywords: ["capacitor", "run cap", "dual run cap", "microfarad"],
    default_severity: "necessary",
    base_price: 289,
  },
  {
    id: "repair-contactor",
    name: "Contactor Replacement",
    category: "Electrical",
    customer_description: "Replace pitted contactor.",
    keywords: ["contactor", "single pole", "two pole", "pitted"],
    default_severity: "necessary",
    base_price: 319,
  },
  {
    id: "repair-motor",
    name: "Condenser Fan Motor Replacement",
    category: "Motors",
    customer_description: "Replace condenser fan motor.",
    keywords: ["condenser fan motor", "outdoor fan motor", "fan motor"],
    default_severity: "necessary",
    base_price: 749,
  },
];

const equipment: TechCartEquipmentMatchup[] = [
  {
    id: "carrier-performance-3-gas-horizontal",
    brand: "Carrier",
    tonnage: 3,
    tier: "Better",
    system_type: "gas_heat",
    application: "Horizontal",
    condenser_model: "24TPA736",
    furnace_model: "59TP6",
    coil_model: "CNPVP",
    seer2: 16.2,
    eer2: 12,
    total_price: 14850,
  },
  {
    id: "carrier-comfort-3-gas-horizontal",
    brand: "Carrier",
    tonnage: 3,
    tier: "Comfort",
    system_type: "gas_heat",
    application: "Horizontal",
    condenser_model: "24SCA536",
    furnace_model: "59SC5",
    coil_model: "CNPVP",
    seer2: 14.3,
    total_price: 11950,
  },
  {
    id: "carrier-infinity-4-heatpump-vertical",
    brand: "Carrier",
    tonnage: 4,
    tier: "Best",
    system_type: "heat_pump",
    application: "Vertical",
    condenser_model: "25VNA8",
    furnace_model: null,
    coil_model: "FE4A",
    seer2: 19,
    hspf2: 8.5,
    total_price: 21400,
  },
  {
    id: "day-night-performance-3-electric-horizontal",
    brand: "Day & Night",
    tonnage: 3,
    tier: "Performance",
    system_type: "electric",
    application: "Horizontal",
    condenser_model: "N4A7T36",
    furnace_model: null,
    coil_model: "FEM4X",
    seer2: 15.2,
    total_price: 12800,
  },
];

describe("techCartInterpreter", () => {
  it("understands run cap field language", () => {
    const result = interpretTechCartSpeech("Need to add a 35x5 run cap.", repairs, equipment);
    expect(result.matches[0].sourceId).toBe("repair-cap");
    expect(result.matches[0].name).toContain("35/5 MFD");
    expect(result.matches[0].missingSpecs).toEqual([]);
  });

  it("asks for capacitor size when the tech leaves it out", () => {
    const result = interpretTechCartSpeech("Need a dual run cap.", repairs, equipment);
    expect(result.matches[0].sourceId).toBe("repair-cap");
    expect(result.matches[0].missingSpecs).toContain("mfd");
    expect(result.questions[0].question).toContain("size");
  });

  it("captures contactor pole detail", () => {
    const result = interpretTechCartSpeech("Add a two pole contactor.", repairs, equipment);
    expect(result.matches[0].sourceId).toBe("repair-contactor");
    expect(result.matches[0].name).toContain("Two-pole");
    expect(result.matches[0].missingSpecs).toEqual([]);
  });

  it("captures motor horsepower and voltage", () => {
    const result = interpretTechCartSpeech("Need a one third horsepower 240 volt condenser fan motor.", repairs, equipment);
    expect(result.matches[0].sourceId).toBe("repair-motor");
    expect(result.matches[0].name).toContain("1/3 HP");
    expect(result.matches[0].name).toContain("240V");
    expect(result.matches[0].missingSpecs).toEqual([]);
  });

  it("matches Carrier Performance gas heat horizontal attic quote language", () => {
    const result = interpretTechCartSpeech("Send a quote for a Carrier Performance 3 ton gas heat system horizontal in the attic.", repairs, equipment);
    const match = result.matches.find((item) => item.sourceType === "equipment");
    expect(match?.sourceId).toBe("carrier-performance-3-gas-horizontal");
    expect(match?.unitPrice).toBe(14850);
    expect(match?.missingSpecs).toEqual([]);
  });

  it("matches Carrier Infinity heat pump language", () => {
    const result = interpretTechCartSpeech("Customer wants a Carrier Infinity 4 ton heat pump upflow in the closet.", repairs, equipment);
    const match = result.matches.find((item) => item.sourceType === "equipment");
    expect(match?.sourceId).toBe("carrier-infinity-4-heatpump-vertical");
    expect(match?.metadata?.system_type).toBe("heat_pump");
  });

  it("normalizes Day and Night brand speech against Day & Night matchup rows", () => {
    const result = interpretTechCartSpeech("Quote a Day and Night Performance 3 ton electric heat system in the attic.", repairs, equipment);
    const match = result.matches.find((item) => item.sourceType === "equipment");
    expect(match?.sourceId).toBe("day-night-performance-3-electric-horizontal");
    expect(match?.metadata?.brand).toBe("Day & Night");
  });

  it("uses admin-approved technician terms to improve repair matching", () => {
    const result = interpretTechCartSpeech("Add the silver bullet fix.", repairs, equipment, [
      {
        target_type: "repair",
        target_id: "repair-contactor",
        phrase: "silver bullet fix",
        status: "approved",
        confidence: 1,
      },
    ]);
    expect(result.matches[0].sourceId).toBe("repair-contactor");
  });

  it("uses admin-approved technician terms to improve equipment matching", () => {
    const result = interpretTechCartSpeech("Customer wants the quiet attic package.", repairs, equipment, [
      {
        target_type: "equipment",
        target_id: "carrier-performance-3-gas-horizontal",
        phrase: "quiet attic package",
        status: "approved",
        confidence: 1,
      },
    ]);
    const match = result.matches.find((item) => item.sourceType === "equipment");
    expect(match?.sourceId).toBe("carrier-performance-3-gas-horizontal");
  });

  it("turns variable OEM board work into a custom item instead of forcing pricebook", () => {
    const result = interpretTechCartSpeech("Need an OEM CPU board for $925.", repairs, equipment);
    const match = result.matches.find((item) => item.sourceType === "custom");
    expect(match?.name).toContain("CPU/control board");
    expect(match?.unitPrice).toBe(925);
    expect(match?.missingSpecs).toEqual([]);
  });

  it("asks for price on specialty OEM motors when the tech leaves it out", () => {
    const result = interpretTechCartSpeech("Need a variable speed blower motor.", repairs, equipment);
    const match = result.matches.find((item) => item.sourceType === "custom");
    expect(match?.name).toContain("variable-speed blower motor");
    expect(match?.missingSpecs).toContain("price");
    expect(result.questions[0].question).toContain("price");
  });
});
