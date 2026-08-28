export function normalizeFixtureDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return "9999-12-31";

  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }

  m = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (m) {
    return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0"),
    ].join("-");
  }

  return "9999-12-31";
}

export function fixtureTimeMinutes(value) {
  if (value === null || value === undefined || value === "") return 1439;
  const text = String(value).trim();

  // Her türlü saat ayırıcısını kabul et: 20:00, 20.00, 20：00, 20 00.
  const pair = text.match(/(\d{1,2})\D+(\d{2})(?:\D|$)/);
  if (pair) {
    const hour = Number(pair[1]);
    const minute = Number(pair[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return hour * 60 + minute;
    }
  }

  const digits = text.replace(/\D/g, "");
  if (/^\d{1,2}$/.test(digits)) {
    const hour = Number(digits);
    if (hour >= 0 && hour <= 23) return hour * 60;
  }
  if (/^\d{3,4}$/.test(digits)) {
    const padded = digits.padStart(4, "0");
    const hour = Number(padded.slice(0, 2));
    const minute = Number(padded.slice(2, 4));
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return hour * 60 + minute;
    }
  }
  return 1439;
}

export function normalizeFixtureTime(value) {
  const total = fixtureTimeMinutes(value);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function fixtureScheduleKey(match) {
  return `${normalizeFixtureDate(match?.date)} ${String(fixtureTimeMinutes(match?.time)).padStart(4, "0")}`;
}

export function compareFixturesBySchedule(a, b) {
  const dateA = normalizeFixtureDate(a?.date);
  const dateB = normalizeFixtureDate(b?.date);

  if (dateA !== dateB) return dateA < dateB ? -1 : 1;

  const timeDiff = fixtureTimeMinutes(a?.time) - fixtureTimeMinutes(b?.time);
  if (timeDiff !== 0) return timeDiff;

  const idA = Number(a?.id);
  const idB = Number(b?.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idA - idB;
  }

  return String(a?.id ?? a?.knockoutKey ?? "").localeCompare(
    String(b?.id ?? b?.knockoutKey ?? ""),
    "tr",
    { numeric: true }
  );
}

export function sortFixturesBySchedule(fixtures = []) {
  return [...fixtures].sort(compareFixturesBySchedule);
}
