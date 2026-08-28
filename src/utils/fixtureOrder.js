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
  const text = String(value ?? "").trim();
  if (!text) return "23:59";

  // 20:00 / 20.00 / 20:00:00
  const separated = text.match(/(?:^|\s)(\d{1,2})[:.](\d{2})(?::\d{2})?/);
  if (separated) {
    const hour = Math.min(23, Math.max(0, Number(separated[1])));
    const minute = Math.min(59, Math.max(0, Number(separated[2])));
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // 20 / 21 / 22 / 23 => tam saat
  if (/^\d{1,2}$/.test(text)) {
    const hour = Number(text);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  // 900 / 2000 / 2100 / 2300 gibi HHMM değerleri
  if (/^\d{3,4}$/.test(text)) {
    const padded = text.padStart(4, "0");
    const hour = Number(padded.slice(0, 2));
    const minute = Number(padded.slice(2, 4));
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
    }
  }

  return "23:59";
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
