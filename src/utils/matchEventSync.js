import { supabase } from "../supabase";

export const MATCH_EVENT_PREFIX = "match_event::";

export function getMatchEventKey(match, index = 0) {
  if (match?.id !== undefined && match?.id !== null && String(match.id) !== "") {
    return `id:${String(match.id)}`;
  }
  if (match?.knockoutKey) return `ko:${String(match.knockoutKey)}`;
  return `fallback:${String(match?.home || "")}|${String(match?.away || "")}|${String(match?.date || "")}|${String(match?.time || "")}|${index}`;
}

function rowId(matchKey, eventId) {
  return `${MATCH_EVENT_PREFIX}${encodeURIComponent(matchKey)}::${encodeURIComponent(String(eventId))}`;
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.filter((row) => row?.value && typeof row.value === "object") : [];
}

export async function fetchMatchEventRows() {
  const { data, error } = await supabase
    .from("app_state")
    .select("id,value,updated_at")
    .like("id", `${MATCH_EVENT_PREFIX}%`);
  if (error) throw error;
  return normalizeRows(data);
}

export function applyMatchEventRowsToFixtures(fixtures, rows) {
  const grouped = new Map();
  normalizeRows(rows).forEach((row) => {
    const value = row.value || {};
    const matchKey = String(value.matchKey || "");
    const eventId = String(value.eventId || value.event?.id || "");
    if (!matchKey || !eventId) return;
    if (!grouped.has(matchKey)) grouped.set(matchKey, []);
    grouped.get(matchKey).push({ ...value, eventId, rowUpdatedAt: row.updated_at || value.updatedAt || "" });
  });

  return (Array.isArray(fixtures) ? fixtures : []).map((match, index) => {
    const matchKey = getMatchEventKey(match, index);
    const changes = grouped.get(matchKey);
    if (!changes?.length) return match;

    const deleted = new Set((Array.isArray(match?.deletedEventIds) ? match.deletedEventIds : []).map(String));
    const byId = new Map();
    (Array.isArray(match?.events) ? match.events : []).forEach((event) => {
      const id = String(event?.id ?? "");
      if (id && !deleted.has(id)) byId.set(id, event);
    });

    changes.forEach((change) => {
      const id = String(change.eventId || "");
      if (!id) return;
      if (change.deleted === true) {
        deleted.add(id);
        byId.delete(id);
      } else if (change.event && typeof change.event === "object") {
        deleted.delete(id);
        byId.set(id, { ...change.event, id: change.event.id || id });
      }
    });

    return {
      ...match,
      events: Array.from(byId.values()),
      deletedEventIds: Array.from(deleted),
    };
  });
}

function eventsById(match) {
  const deleted = new Set((Array.isArray(match?.deletedEventIds) ? match.deletedEventIds : []).map(String));
  const map = new Map();
  (Array.isArray(match?.events) ? match.events : []).forEach((event) => {
    const id = String(event?.id ?? "");
    if (id && !deleted.has(id)) map.set(id, event);
  });
  return { map, deleted };
}

async function upsertEventState(matchKey, eventId, event, deleted) {
  const now = new Date().toISOString();
  const payload = {
    id: rowId(matchKey, eventId),
    value: {
      matchKey,
      eventId: String(eventId),
      event: event && typeof event === "object" ? event : null,
      deleted: deleted === true,
      updatedAt: now,
    },
    updated_at: now,
  };
  const { error } = await supabase.from("app_state").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function syncMatchEventChanges(previousFixtures, nextFixtures) {
  const previous = Array.isArray(previousFixtures) ? previousFixtures : [];
  const next = Array.isArray(nextFixtures) ? nextFixtures : [];
  const previousByKey = new Map(previous.map((match, index) => [getMatchEventKey(match, index), match]));
  const jobs = [];

  next.forEach((match, index) => {
    const matchKey = getMatchEventKey(match, index);
    const before = previousByKey.get(matchKey) || {};
    const beforeState = eventsById(before);
    const afterState = eventsById(match);
    const ids = new Set([
      ...beforeState.map.keys(),
      ...afterState.map.keys(),
      ...beforeState.deleted,
      ...afterState.deleted,
    ]);

    ids.forEach((id) => {
      const beforeEvent = beforeState.map.get(id);
      const afterEvent = afterState.map.get(id);
      const wasDeleted = beforeState.deleted.has(id);
      const isDeleted = afterState.deleted.has(id) || (!afterEvent && !!beforeEvent);

      if (isDeleted) {
        if (!wasDeleted || beforeEvent) {
          jobs.push(upsertEventState(matchKey, id, beforeEvent || null, true));
        }
        return;
      }

      if (afterEvent && JSON.stringify(afterEvent) !== JSON.stringify(beforeEvent)) {
        jobs.push(upsertEventState(matchKey, id, afterEvent, false));
      }
    });
  });

  if (jobs.length === 0) return true;
  const results = await Promise.allSettled(jobs);
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return true;
}
