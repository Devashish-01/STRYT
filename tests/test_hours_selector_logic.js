// Test logic of HoursSelector parsing and normalization

function normalizeTimeStr(tStr) {
  if (!tStr) return "09:00 AM";
  const cleaned = tStr.trim().toUpperCase();
  const hasPM = cleaned.includes("PM");
  const hasAM = cleaned.includes("AM");
  const numPart = cleaned.replace(/(AM|PM)/g, "").trim();
  const parts = numPart.split(":");
  let hour = parseInt(parts[0], 10) || 0;
  let minute = parseInt(parts[1], 10) || 0;
  const isPM = hasPM || (hour >= 12 && !hasAM);
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  const displayHStr = displayHour < 10 ? `0${displayHour}` : `${displayHour}`;
  const displayMStr = minute < 10 ? `0${minute}` : `${minute}`;
  const ampm = isPM ? "PM" : "AM";
  return `${displayHStr}:${displayMStr} ${ampm}`;
}

function parseAvailability(raw) {
  const defaults = { days: "Everyday", from: "09:00 AM", to: "09:00 PM" };
  if (!raw) return defaults;
  
  let main = raw.trim();
  if (main.includes("duration=")) {
    const pipeIdx = main.lastIndexOf("|");
    if (pipeIdx !== -1) {
      main = main.substring(0, pipeIdx).trim();
    }
  }
  
  if (main.includes("from ") && main.includes(" to ")) {
    const parts = main.split(" from ");
    const daysPattern = parts[0]?.trim() || "Everyday";
    const times = parts[1]?.split(" to ");
    const fromTime = normalizeTimeStr(times?.[0] || "09:00 AM");
    const toTime = normalizeTimeStr(times?.[1] || "09:00 PM");
    return { days: daysPattern, from: fromTime, to: toTime };
  }
  
  if (main.includes("|")) {
    const parts = main.split("|");
    const daysPattern = parts[0]?.trim() || "Everyday";
    const times = (parts[1] || "").split(/-|–/);
    const fromTime = normalizeTimeStr(times?.[0] || "09:00 AM");
    const toTime = normalizeTimeStr(times?.[1] || "09:00 PM");
    return { days: daysPattern, from: fromTime, to: toTime };
  }
  
  if (main.includes("-") || main.includes("–")) {
    const sep = main.includes("–") ? "–" : "-";
    const parts = main.split(sep);
    const daysPattern = parts[0]?.trim() || "Everyday";
    const times = (parts[1] || "").split(/-|–/);
    const fromTime = normalizeTimeStr(times?.[0] || "09:00 AM");
    const toTime = normalizeTimeStr(times?.[1] || "09:00 PM");
    return { days: daysPattern, from: fromTime, to: toTime };
  }
  
  return defaults;
}

// Assert helper
function assertEqual(actual, expected, message) {
  const actualStr = typeof actual === "object" ? JSON.stringify(actual) : String(actual);
  const expectedStr = typeof expected === "object" ? JSON.stringify(expected) : String(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
  }
}

function runTests() {
  console.log("=== Running HoursSelector Logic Tests ===");

  // 1. Test normalizeTimeStr
  assertEqual(normalizeTimeStr("9:00 AM"), "09:00 AM", "Simple time string");
  assertEqual(normalizeTimeStr("9 AM"), "09:00 AM", "Hour only");
  assertEqual(normalizeTimeStr("11:30 PM"), "11:30 PM", "Late night");
  assertEqual(normalizeTimeStr("14:00"), "02:00 PM", "24h format PM conversion");
  assertEqual(normalizeTimeStr("08:30"), "08:30 AM", "24h format AM conversion");
  assertEqual(normalizeTimeStr(""), "09:00 AM", "Empty input fallback");
  console.log("✓ normalizeTimeStr tests passed.");

  // 2. Test parseAvailability
  assertEqual(
    parseAvailability("Mon–Sat from 09:00 AM to 07:00 PM"),
    { days: "Mon–Sat", from: "09:00 AM", to: "07:00 PM" },
    "Standard from-to format"
  );
  assertEqual(
    parseAvailability("Everyday from 09:00 AM to 09:00 PM|duration=30"),
    { days: "Everyday", from: "09:00 AM", to: "09:00 PM" },
    "From-to with slot duration config"
  );
  assertEqual(
    parseAvailability("Mon-Sun | 11:00 AM - 9:00 PM"),
    { days: "Mon-Sun", from: "11:00 AM", to: "09:00 PM" },
    "Fallback format with pipes and dash"
  );
  assertEqual(
    parseAvailability(""),
    { days: "Everyday", from: "09:00 AM", to: "09:00 PM" },
    "Empty string fallback"
  );
  assertEqual(
    parseAvailability(undefined),
    { days: "Everyday", from: "09:00 AM", to: "09:00 PM" },
    "Undefined fallback"
  );
  console.log("✓ parseAvailability tests passed.");
  console.log("=== ALL TESTS PASSED SUCCESSFULLY! ===");
}

try {
  runTests();
} catch (e) {
  console.error("✗ Tests failed:", e.message);
  process.exit(1);
}
