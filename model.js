export const types = ["trips", "shifts", "expenses"];
export const names = { trips: "trip", shifts: "shift", expenses: "expense" };
const dayMs = 86_400_000;
const backupFormat = "milequill-lite";
const maxEntry = 999_999_999; // Stored in hundredths of a mile or cents.
const fields = {
  trips: { distance: ["distance"], odometer: ["start", "end"] },
  shifts: { hours: ["seconds"], clock: ["start", "end"] },
  expenses: { amount: ["cents"] },
};
const labels = { trips: "Platform or business purpose", shifts: "Platform", expenses: "Category" };
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const key = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});
const clockMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export const formatMoney = cents => money.format(cents / 100);
export const formatQuantity = value => quantity.format(value);
export const formatDate = date => shortDate.format(new Date(date + "T00:00:00Z"));
export const tripDistance = trip => trip.method === "distance" ? trip.distance : trip.end - trip.start;
export const shiftSeconds = shift => shift.method === "hours" ? shift.seconds
  : ((clockMinutes(shift.end) - clockMinutes(shift.start) + 1440) % 1440) * 60;
export const overnight = shift => shift.method === "clock" && shift.end < shift.start;
export const rangeContains = (range, date) => date >= range.start && date <= range.end;

export function localDay(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
}

export function validDate(value) {
  if (typeof value !== "string" || !isoDate.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

function dayString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function periodRange(period, anchor) {
  const date = new Date(anchor + "T00:00:00Z");
  if (period === "week") {
    const daysFromMonday = (date.getUTCDay() + 6) % 7;
    const start = +date - daysFromMonday * dayMs;
    return { start: dayString(start), end: dayString(start + 6 * dayMs) };
  }
  date.setUTCDate(1);
  const start = dayString(+date);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { start, end: dayString(+date) };
}

export function movePeriod(period, anchor, direction) {
  const date = new Date(anchor + "T00:00:00Z");
  if (period === "week") return dayString(+date + direction * 7 * dayMs);
  date.setUTCMonth(date.getUTCMonth() + direction, 1);
  return dayString(+date);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}

function bounded(value, min, max = maxEntry) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function validateRecord(type, record) {
  const methods = fields[type];
  assert(record && Object.hasOwn(methods, record.method), "Choose a valid entry method.");
  const common = ["id", "date", "label", "notes", "method", "createdAt"];
  const extra = type === "shifts" ? ["cents"] : [];
  assert(hasKeys(record, [...common, ...extra, ...methods[record.method]]), "Unexpected record fields.");
  assert(typeof record.id === "string" && key.test(record.id), "Invalid record ID.");
  const createdAt = Date.parse(record.createdAt);
  assert(typeof record.createdAt === "string" && Number.isFinite(createdAt)
    && new Date(createdAt).toISOString() === record.createdAt, "Invalid registration time.");
  assert(validDate(record.date), "Enter a valid date.");
  assert(typeof record.label === "string" && record.label.trim() && record.label.length <= 80,
    labels[type] + " must be 1–80 characters.");
  assert(typeof record.notes === "string" && record.notes.length <= 1000,
    "Notes must be 1,000 characters or shorter.");
  if (type === "trips" && record.method === "distance") {
    assert(bounded(record.distance, 1), "Enter a distance greater than zero.");
  }
  if (type === "trips" && record.method === "odometer") {
    assert(bounded(record.start, 0) && bounded(record.end, 1) && record.end > record.start,
      "End odometer must be greater than start odometer.");
  }
  if (type === "shifts" && record.method === "hours") {
    assert(bounded(record.seconds, 36, 86_400) && record.seconds % 36 === 0,
      "Enter hours between 0.01 and 24.");
  }
  if (type === "shifts" && record.method === "clock") {
    assert(typeof record.start === "string" && typeof record.end === "string"
      && clock.test(record.start) && clock.test(record.end), "Enter a valid start and end time.");
    assert(record.end !== record.start, "Use Hours worked to enter a 24-hour shift.");
  }
  if (type === "shifts") assert(bounded(record.cents, 0), "Enter gross earnings of zero or more.");
  if (type === "expenses") assert(bounded(record.cents, 1), "Enter an expense greater than zero.");
  return record;
}

function hundredths(value, label, maximum = maxEntry) {
  const normalized = value.trim().replace(",", ".");
  const parts = /^(?:([0-9]{1,7})(?:\.([0-9]{0,2}))?|\.([0-9]{1,2}))$/.exec(normalized);
  assert(parts, label + " needs a number with up to two decimal places.");
  const whole = Number(parts[1] || "0");
  const fraction = Number((parts[2] || parts[3] || "").padEnd(2, "0"));
  assert(whole * 100 + fraction <= maximum, label + " is too large.");
  return whole * 100 + fraction;
}

export function fromForm(type, form, previous) {
  const { date, label, notes, method } = form;
  const record = {
    id: previous?.id || crypto.randomUUID(), createdAt: previous?.createdAt || new Date().toISOString(),
    date, label: label.trim(), notes: notes.trim(), method,
  };
  if (type === "trips" && method === "distance") {
    record.distance = hundredths(form.distance, "Distance");
  }
  if (type === "trips" && method === "odometer") {
    record.start = hundredths(form.start, "Start odometer");
    record.end = hundredths(form.end, "End odometer");
  }
  if (type === "shifts" && method === "hours") {
    record.seconds = hundredths(form.hours, "Hours worked", 2400) * 36;
  }
  if (type === "shifts" && method === "clock") {
    record.start = form.start;
    record.end = form.end;
  }
  if (type !== "trips") record.cents = hundredths(form.money, type === "shifts" ? "Gross earnings" : "Amount");
  return validateRecord(type, record);
}

export function totals(records, range) {
  let miles = 0;
  let seconds = 0;
  let gross = 0;
  let expenses = 0;
  for (const trip of records.trips) {
    if (rangeContains(range, trip.date)) miles += tripDistance(trip);
  }
  for (const shift of records.shifts) {
    if (!rangeContains(range, shift.date)) continue;
    seconds += shiftSeconds(shift);
    gross += shift.cents;
  }
  for (const expense of records.expenses) {
    if (rangeContains(range, expense.date)) expenses += expense.cents;
  }
  const net = gross - expenses;
  return { miles, seconds, gross, expenses, net, perHour: seconds ? net / (seconds / 3600) : null };
}

export function makeBackup(records) {
  return { format: backupFormat, version: 1, exportedAt: new Date().toISOString(), records };
}

export function parseBackup(text) {
  let backup;
  try { backup = JSON.parse(text); }
  catch { throw new Error("This file is not valid JSON."); }
  assert(hasKeys(backup, ["format", "version", "exportedAt", "records"])
    && backup.format === backupFormat && backup.version === 1
    && typeof backup.exportedAt === "string" && Number.isFinite(Date.parse(backup.exportedAt))
    && hasKeys(backup.records, types), "Choose a version 1 MileQuill Lite backup.");
  for (const type of types) {
    const records = backup.records[type];
    assert(Array.isArray(records), "The backup is missing its " + type + " list.");
    const ids = new Set();
    records.forEach((record, index) => {
      try {
        validateRecord(type, record);
        assert(!ids.has(record.id), "Duplicate record ID.");
        ids.add(record.id);
      } catch (error) {
        throw new Error(type[0].toUpperCase() + type.slice(1) + " row " + (index + 1) + " · " + error.message);
      }
    });
  }
  return backup.records;
}

const csvColumns = {
  trips: ["date", "platform_or_purpose", "distance_miles", "start_odometer_miles", "end_odometer_miles", "notes"],
  shifts: ["date", "platform", "start_time", "end_time", "ends_next_day", "hours_worked", "elapsed_seconds", "gross_usd", "notes"],
  expenses: ["date", "category", "amount_usd", "notes"],
};

function csvRow(values) {
  return values.map(value => {
    // Protect text cells opened in a spreadsheet, including leading whitespace before formulas.
    const safe = /^[\u0000-\u0020]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(",");
}

export function toCsv(type, records) {
  const rows = [csvRow(csvColumns[type])];
  for (const record of records) {
    const { date, label, method, start, end, cents, notes } = record;
    if (type === "trips") {
      rows.push(csvRow([date, label, (tripDistance(record) / 100).toFixed(2),
        method === "odometer" ? (start / 100).toFixed(2) : "",
        method === "odometer" ? (end / 100).toFixed(2) : "", notes]));
    }
    if (type === "shifts") {
      const seconds = shiftSeconds(record);
      rows.push(csvRow([date, label, method === "clock" ? start : "", method === "clock" ? end : "",
        method === "clock" ? String(overnight(record)) : "", (seconds / 3600).toFixed(4),
        String(seconds), (cents / 100).toFixed(2), notes]));
    }
    if (type === "expenses") rows.push(csvRow([date, label, (cents / 100).toFixed(2), notes]));
  }
  return rows.join("\r\n") + "\r\n";
}
