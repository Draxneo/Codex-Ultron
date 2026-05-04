/**
 * Mock data constants for the System Test Runner.
 * All records are prefixed with [TEST] for easy identification and cleanup.
 */

export const TEST_PREFIX = "[TEST]";

export const TEST_CUSTOMER_ID = "114fc104-b667-4ffa-8648-7f10d09d849a";

export const MOCK_CUSTOMER = {
  first_name: "[TEST] QA",
  last_name: "Tester",
  email: "qa.tester@ultramode.test",
  phone: "(210) 555-0100",
  mobile_phone: "(210) 555-0101",
  address: "9999 Test Loop",
  city: "San Antonio",
  state: "TX",
  zip: "78245",
  company: "[TEST] Ultra Mode QA",
};

export const MOCK_INSTALL_ESTIMATE = {
  customer_name: "[TEST] QA Tester",
  customer_phone: "(210) 555-0100",
  customer_email: "qa.tester@ultramode.test",
  address: "9999 Test Loop, San Antonio, TX 78245",
  description: "[TEST] Full system replacement — 3 ton Carrier Infinity 24VNA6",
  work_status: "new",
};

export const MOCK_SERVICE_ESTIMATE = {
  customer_name: "[TEST] QA Tester",
  customer_phone: "(210) 555-0100",
  customer_email: "qa.tester@ultramode.test",
  address: "9999 Test Loop, San Antonio, TX 78245",
  description: "[TEST] AC not cooling — needs diagnostic",
  work_status: "new",
};

export const MOCK_INSTALL_JOB = {
  customer_name: "[TEST] QA Tester",
  customer_phone: "(210) 555-0100",
  customer_email: "qa.tester@ultramode.test",
  address: "9999 Test Loop, San Antonio, TX 78245",
  job_type: "install",
  description: "[TEST] Install job from system test",
  status: "scheduled",
};

export const MOCK_SERVICE_JOB = {
  customer_name: "[TEST] QA Tester",
  customer_phone: "(210) 555-0100",
  customer_email: "qa.tester@ultramode.test",
  address: "9999 Test Loop, San Antonio, TX 78245",
  job_type: "service",
  description: "[TEST] Service job from system test",
  status: "scheduled",
};

export const MOCK_MAINTENANCE_JOB = {
  customer_name: "[TEST] QA Tester",
  customer_phone: "(210) 555-0100",
  customer_email: "qa.tester@ultramode.test",
  address: "9999 Test Loop, San Antonio, TX 78245",
  job_type: "maintenance",
  description: "[TEST] Maintenance job from system test",
  status: "scheduled",
};


// 1x1 transparent PNG as base64
export const MOCK_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const MOCK_EQUIPMENT = {
  equipment_type: "ac",
  brand: "[TEST] Carrier",
  model_number: "24VNA636A003",
  serial_number: "TEST-SN-001",
  location_note: "[TEST] Backyard, left side",
  notes: "[TEST] Extracted from mock data plate photo",
};

export const MOCK_INVOICE_LINE_ITEMS = [
  { description: "[TEST] Labor — system installation", quantity: 1, unit_price: 2500, total: 2500 },
  { description: "[TEST] Carrier 24VNA6 condenser", quantity: 1, unit_price: 4200, total: 4200 },
  { description: "[TEST] Carrier CNPVP coil", quantity: 1, unit_price: 1800, total: 1800 },
];
