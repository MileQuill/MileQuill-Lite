import {
  types, names, formatMoney, formatQuantity, formatDate, localDay, validDate, periodRange,
  movePeriod, fromForm, tripDistance, shiftSeconds, overnight, rangeContains, totals,
  makeBackup, parseBackup, toCsv,
} from "./model.js";
import { openDatabase, readRecords, changeRecord, replaceRecords } from "./db.js";
import { setupOffline } from "./offline.js";

const $ = id => document.getElementById(id);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const sections = ["dashboard", "records", "data"];
const longLabels = { trips: "Platform or business purpose", shifts: "Platform", expenses: "Category" };
const recordIntro = {
  trips: "Log miles by distance or odometer readings.",
  shifts: "Log time worked and gross earnings.",
  expenses: "Track what you spend on work.",
};
const icons = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
  trips: '<path d="M5 20 8 4m8 0 3 16m-7-15v3m0 3v3m0 3v3"/>',
  shifts: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/>',
  expenses: '<path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8zM9 8h6m-6 4h6m-6 4h4"/>',
  data: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  net: '<path d="M4 18h16M6 14l4-4 4 2 4-6m-4 0h4v4"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
};
const emptyRecords = () => Object.fromEntries(types.map(type => [type, []]));
const state = {
  page: "dashboard",
  period: "week",
  anchors: { week: localDay(), month: localDay() },
  custom: periodRange("week", localDay()),
  db: null,
  records: emptyRecords(),
  editing: null,
  confirmation: null,
};
const editor = $("editor");
const entry = $("entry-form");
const confirmation = $("confirmation");
let noticeTimer;
let channel;

function insertIcons(root) {
  for (const target of all("[data-icon]", root)) {
    const path = icons[target.dataset.icon];
    target.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function message(id, text = "") {
  const node = $(id);
  node.textContent = text;
  node.hidden = !text;
}

function notify(text) {
  $("notice").textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $("notice").textContent = ""; }, 4800);
}

function sortRecords(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

function rangeLabel(range) {
  const from = formatDate(range.start);
  const through = formatDate(range.end);
  if (range.start === range.end) return from;
  return (range.start.slice(0, 4) === range.end.slice(0, 4) ? from.replace(/, \d+$/, "") : from)
    + " – " + through;
}

function shownRange() {
  return state.period === "custom" ? state.custom : periodRange(state.period, state.anchors[state.period]);
}

function recordList(items, editable) {
  const list = element("ul", "record-list");
  for (const { type, record } of items) {
    const row = element("li", "record");
    const badge = element("span", "metric-icon " + { trips: "teal", shifts: "blue", expenses: "sand" }[type]);
    badge.dataset.icon = type;
    const description = element("div", "record-description");
    description.append(element("strong", "", record.label));
    const subtitle = [formatDate(record.date)];
    if (type === "trips" && record.method === "odometer") {
      subtitle.push(formatQuantity(record.start / 100) + " to " + formatQuantity(record.end / 100) + " mi");
    }
    if (type === "shifts") {
      subtitle.push(formatQuantity(shiftSeconds(record) / 3600) + " hr");
      if (record.method === "clock") subtitle.push(record.start + "–" + record.end + (overnight(record) ? " next day" : ""));
    }
    description.append(element("p", "record-meta", subtitle.join(" · ")));
    if (editable && record.notes) description.append(element("p", "record-note", record.notes));
    const value = type === "trips" ? formatQuantity(tripDistance(record) / 100) + " mi" : formatMoney(record.cents);
    row.append(badge, description, element("strong", "record-value", value));
    if (editable) {
      const actions = element("div", "record-actions");
      for (const action of ["Edit", "Delete"]) {
        const button = element("button", "text-button " + action.toLowerCase(), action);
        button.type = "button";
        button.setAttribute("aria-label", action + " " + names[type] + " for " + record.label);
        button.dataset[action.toLowerCase()] = record.id;
        button.disabled = !state.db;
        actions.append(button);
      }
      row.append(actions);
    }
    list.append(row);
  }
  insertIcons(list);
  return list;
}

function emptyState(title, copy, icon) {
  const body = element("div", "empty");
  const badge = element("span", "metric-icon teal");
  badge.dataset.icon = icon;
  body.append(badge, element("strong", "", title), element("p", "", copy));
  insertIcons(body);
  return body;
}

function renderDashboard() {
  const range = shownRange();
  const custom = state.period === "custom";
  $("custom-range").hidden = !custom;
  $("custom-applied").hidden = !custom;
  $("period-navigation").hidden = custom;
  $("custom-applied").textContent = "Showing " + rangeLabel(range);
  $("range-label").textContent = rangeLabel(range);
  $("period-back").setAttribute("aria-label", "Previous " + state.period);
  $("period-forward").setAttribute("aria-label", "Next " + state.period);
  for (const button of all("[data-period]")) button.setAttribute("aria-pressed", String(button.dataset.period === state.period));

  const values = totals(state.records, range);
  for (const [id, text] of Object.entries({
    net: formatMoney(values.net), gross: formatMoney(values.gross), spent: formatMoney(values.expenses),
    miles: formatQuantity(values.miles / 100), hours: formatQuantity(values.seconds / 3600),
    "per-hour": values.perHour === null ? "—" : formatMoney(values.perHour),
  })) $(id).textContent = state.db ? text : "—";
  $("per-hour-hint").hidden = values.perHour !== null;
  const recent = types.flatMap(type => state.records[type]
    .filter(record => rangeContains(range, record.date)).map(record => ({ type, record })))
    .sort((a, b) => sortRecords(a.record, b.record)).slice(0, 5);
  $("recent").replaceChildren(recent.length ? recordList(recent, false)
    : emptyState("No activity in this range", "Log a trip, shift, or expense to see it here.", "net"));
}

function renderRecords() {
  const type = state.page;
  $("records-title").textContent = type[0].toUpperCase() + type.slice(1);
  $("records-intro").textContent = recordIntro[type];
  $("add-record").dataset.add = type;
  $("add-label").textContent = "Log " + names[type];
  const records = [...state.records[type]].sort(sortRecords);
  const focused = document.activeElement?.dataset;
  $("record-list").replaceChildren(records.length ? recordList(records.map(record => ({ type, record })), true)
    : emptyState("No " + type + " yet", recordIntro[type], type));
  if (focused?.edit || focused?.delete) {
    const action = focused.edit ? "edit" : "delete";
    const replacement = all("[data-" + action + "]").find(button => button.dataset[action] === focused[action]);
    (replacement || $("add-record")).focus({ preventScroll: true });
  }
}

function render() {
  for (const control of all("[data-requires-storage]")) control.disabled = !state.db;
  if (state.page === "dashboard") renderDashboard();
  if (types.includes(state.page)) renderRecords();
}

function route(focus = false) {
  const hash = location.hash.slice(1);
  if (hash === "main") return;
  state.page = [...types, "data"].includes(hash) ? hash : "dashboard";
  const active = types.includes(state.page) ? "records" : state.page;
  for (const name of sections) $("view-" + name).hidden = name !== active;
  for (const link of all("[data-page]")) {
    if (link.dataset.page === state.page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  render();
  if (focus) {
    window.scrollTo(0, 0);
    $(active + "-title").focus({ preventScroll: true });
  }
}

async function refresh() {
  state.records = await readRecords(state.db);
  render();
}

function showStorageError() {
  state.db = null;
  state.records = emptyRecords();
  render();
  message("storage-error", "Local storage is unavailable. Reload MileQuill Lite to try again.");
}

async function afterWrite(text) {
  channel?.postMessage("records-changed");
  notify(text);
  try { await refresh(); }
  catch { showStorageError(); }
}

function numericField(labelText, name, placeholder) {
  const label = element("label", "", labelText);
  const input = document.createElement("input");
  input.name = name;
  input.inputMode = "decimal";
  input.placeholder = placeholder;
  input.required = true;
  label.append(input);
  return label;
}

function timeField(labelText, name) {
  const label = element("label", "", labelText);
  const input = document.createElement("input");
  input.type = "time";
  input.name = name;
  input.required = true;
  label.append(input);
  return label;
}

function modePicker(choices, initial) {
  const fieldset = element("fieldset", "mode-picker");
  fieldset.append(element("legend", "", "Entry method"));
  const choicesNode = element("div", "mode-options");
  for (const [value, labelText] of choices) {
    const label = element("label", "", "");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "method";
    radio.value = value;
    radio.checked = value === initial;
    label.append(radio, element("span", "", labelText));
    choicesNode.append(label);
  }
  fieldset.append(choicesNode);
  return fieldset;
}

function drawFields(type, record) {
  const fields = $("entry-fields");
  fields.replaceChildren();
  const grid = element("div", "form-grid");
  if (type === "expenses") {
    const method = document.createElement("input");
    method.type = "hidden";
    method.name = "method";
    method.value = "amount";
    fields.append(method);
  } else {
    const trip = type === "trips";
    const choices = trip ? [["distance", "Distance"], ["odometer", "Odometer"]]
      : [["clock", "Start and end"], ["hours", "Hours worked"]];
    const picker = modePicker(choices, record?.method || choices[0][0]);
    fields.append(picker);
    const first = element("div", "form-grid mode-group");
    const second = element("div", "form-grid mode-group");
    if (trip) {
      first.append(numericField("Distance (mi)", "distance", "0.00"));
      second.append(numericField("Start odometer (mi)", "start", "0.00"), numericField("End odometer (mi)", "end", "0.00"));
    } else {
      first.append(timeField("Start time", "start"), timeField("End time", "end"));
      second.append(numericField("Hours worked", "hours", "0.00"));
      const hint = element("p", "field-hint", "An earlier end time means the shift ends the next day.");
      first.append(hint);
      first.addEventListener("input", () => {
        const start = entry.elements.start.value;
        const end = entry.elements.end.value;
        hint.textContent = start && end && end < start ? "Ends next day. All hours and earnings go on the start date."
          : "An earlier end time means the shift ends the next day.";
      });
    }
    const toggle = () => {
      for (const [index, node] of [first, second].entries()) {
        node.hidden = entry.elements.method.value !== choices[index][0];
        for (const input of all("input", node)) input.disabled = node.hidden;
      }
      message("entry-error");
    };
    fields.append(first, second);
    picker.addEventListener("change", toggle);
    toggle();
  }

  if (type !== "trips") {
    grid.append(numericField(type === "shifts" ? "Gross earnings (USD)" : "Amount (USD)", "money", "0.00"));
    fields.append(grid);
  }
  if (!record) return;
  if (record.method === "distance") entry.elements.distance.value = record.distance / 100;
  if (record.method === "odometer" || record.method === "clock") {
    const divisor = record.method === "odometer" ? 100 : 1;
    entry.elements.start.value = divisor === 1 ? record.start : record.start / divisor;
    entry.elements.end.value = divisor === 1 ? record.end : record.end / divisor;
    entry.elements.end.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (record.method === "hours") entry.elements.hours.value = record.seconds / 3600;
  if (type !== "trips") entry.elements.money.value = (record.cents / 100).toFixed(2);
}

function openEditor(type, previous = null) {
  if (!state.db) return;
  state.editing = { type, previous };
  const action = previous ? "Edit " : "Log ";
  $("editor-title").textContent = action + names[type];
  $("entry-label").textContent = longLabels[type];
  $("save").textContent = previous ? "Save changes" : "Save " + names[type];
  entry.elements.date.value = previous?.date || localDay();
  entry.elements.label.value = previous?.label || "";
  entry.elements.notes.value = previous?.notes || "";
  message("entry-error");
  drawFields(type, previous);
  editor.showModal();
}

function lockDialog(dialog, locked) {
  dialog.dataset.busy = String(locked);
  for (const button of all("button", dialog)) button.disabled = locked;
}

entry.addEventListener("submit", async event => {
  event.preventDefault();
  if (editor.dataset.busy === "true" || !state.db) return;
  const { type, previous } = state.editing;
  message("entry-error");
  try {
    const next = fromForm(type, Object.fromEntries(new FormData(entry)), previous);
    lockDialog(editor, true);
    await changeRecord(state.db, type, next, previous);
    editor.close();
    await afterWrite(names[type][0].toUpperCase() + names[type].slice(1) + " saved.");
  } catch (error) {
    message("entry-error", error.message || "Unable to save this record.");
  } finally {
    lockDialog(editor, false);
  }
});

function ask(title, details, label, run, success) {
  state.confirmation = { run, success };
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = details;
  $("confirm-action").textContent = label;
  message("confirm-error");
  confirmation.showModal();
}

$("confirm-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (confirmation.dataset.busy === "true" || !state.db) return;
  const { run, success } = state.confirmation;
  lockDialog(confirmation, true);
  try {
    await run();
    confirmation.close();
    await afterWrite(success);
  } catch (error) {
    message("confirm-error", error.message || "Unable to complete this change.");
  } finally {
    lockDialog(confirmation, false);
  }
});

for (const dialog of [editor, confirmation]) {
  dialog.addEventListener("cancel", event => {
    if (dialog.dataset.busy === "true") event.preventDefault();
  });
}

function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = element("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function exportRecords(type) {
  if (!state.db) return;
  try {
    const records = await readRecords(state.db);
    const name = "milequill-lite-" + localDay();
    if (type) {
      download(name + "-" + type + ".csv", "\uFEFF" + toCsv(type, records[type].sort(sortRecords)), "text/csv;charset=utf-8");
    } else {
      download(name + "-backup.json", JSON.stringify(makeBackup(records), null, 2) + "\n", "application/json;charset=utf-8");
    }
    notify(type ? "CSV prepared." : "JSON backup prepared.");
  } catch {
    notify("The download could not be prepared. Try again.");
  }
}

async function checkRestore() {
  const input = $("restore-file");
  const file = input.files[0];
  input.value = "";
  if (!file || !state.db) return;
  message("restore-error");
  $("choose-restore").disabled = true;
  try {
    const records = parseBackup(await file.text());
    const counts = types.map(type => records[type].length + " " + (records[type].length === 1 ? names[type] : type));
    ask("Replace saved records?",
      "This backup contains " + counts.join(", ") + ". Restoring replaces all trips, shifts, and expenses currently saved here.",
      "Replace records", () => replaceRecords(state.db, records), "Backup restored.");
  } catch (error) {
    message("restore-error", "Backup rejected. " + (error.message || "The file could not be read."));
  } finally {
    $("choose-restore").disabled = !state.db;
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.add) openEditor(button.dataset.add);
  if (button.dataset.export) void exportRecords(button.dataset.export);
  if (Object.hasOwn(button.dataset, "closeEditor")) editor.close();
  if (button.dataset.period) {
    state.period = button.dataset.period;
    if (state.period === "custom") {
      $("custom-range").elements.from.value = state.custom.start;
      $("custom-range").elements.through.value = state.custom.end;
      message("range-error");
    }
    renderDashboard();
  }
  const recordId = button.dataset.edit || button.dataset.delete;
  if (!recordId || !state.db || !types.includes(state.page)) return;
  const type = state.page;
  const previous = state.records[type].find(record => record.id === recordId);
  if (!previous) return;
  if (button.dataset.edit) openEditor(type, previous);
  else ask("Delete this " + names[type] + "?",
    previous.label + " · " + formatDate(previous.date) + ". This permanently removes the entry from this browser.",
    "Delete " + names[type], () => changeRecord(state.db, type, null, previous),
    names[type][0].toUpperCase() + names[type].slice(1) + " deleted.");
});

$("custom-range").addEventListener("submit", event => {
  event.preventDefault();
  const start = event.currentTarget.elements.from.value;
  const end = event.currentTarget.elements.through.value;
  if (!validDate(start) || !validDate(end) || start > end) {
    message("range-error", "Choose a valid end date on or after the start date.");
    return;
  }
  message("range-error");
  state.custom = { start, end };
  renderDashboard();
});

for (const [id, direction] of [["period-back", -1], ["period-forward", 1]]) {
  $(id).addEventListener("click", () => {
    const { period, anchors } = state;
    const next = movePeriod(period, anchors[period], direction);
    if (validDate(next)) {
      anchors[period] = next;
      renderDashboard();
    }
  });
}

$("backup").addEventListener("click", () => void exportRecords());
$("choose-restore").addEventListener("click", () => $("restore-file").click());
$("restore-file").addEventListener("change", () => void checkRestore());
$("cancel-confirm").addEventListener("click", () => confirmation.close());
window.addEventListener("hashchange", () => route(true));

insertIcons(document);
route();
setupOffline();

try {
  state.db = await openDatabase();
  await refresh();
  if ("BroadcastChannel" in window) {
    try { channel = new BroadcastChannel("milequill-lite-changes"); }
    catch { /* A returning tab refreshes through the focus event. */ }
    channel?.addEventListener("message", () => {
      if (state.db) void refresh().catch(showStorageError);
    });
  }
  window.addEventListener("focus", () => {
    if (state.db) void refresh().catch(showStorageError);
  });
} catch {
  showStorageError();
}
