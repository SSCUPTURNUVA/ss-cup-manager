export function normalizeFixtureDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  const tr = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (tr) {
    return `${tr[3]}-${String(tr[2]).padStart(2, "0")}-${String(tr[1]).padStart(2, "0")}`;
  }

  return text.slice(0, 10);
}

export function normalizeFixtureTime(value) {
  const text = String(value || "").trim();
  if (!text) return "23:59";
  const match = text.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return "23:59";
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}

export function fixtureScheduleKey(match) {
  const date = normalizeFixtureDate(match?.date) || "9999-12-31";
  const time = normalizeFixtureTime(match?.time);
  return `${date} ${time}`;
}

export function compareFixturesBySchedule(a, b) {
  const scheduleDiff = fixtureScheduleKey(a).localeCompare(fixtureScheduleKey(b));
  if (scheduleDiff !== 0) return scheduleDiff;

  const weekDiff = (Number(a?.week) || 0) - (Number(b?.week) || 0);
  if (weekDiff !== 0) return weekDiff;

  return String(a?.id ?? a?.knockoutKey ?? "").localeCompare(
    String(b?.id ?? b?.knockoutKey ?? ""),
    "tr",
    { numeric: true }
  );
}

export function sortFixturesBySchedule(fixtures = []) {
  return [...fixtures].sort(compareFixturesBySchedule);
}
