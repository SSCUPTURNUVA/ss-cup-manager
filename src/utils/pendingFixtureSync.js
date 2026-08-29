import { supabase } from "../supabase";

export const PENDING_FIXTURE_SYNC_KEY = "sscup-pending-fixture-sync";

export function readPendingFixtureSync() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_FIXTURE_SYNC_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function fixtureCloudPayload(match) {
  return {
    home_score: match?.homeScore ?? 0,
    away_score: match?.awayScore ?? 0,
    played: match?.played === true,
    live: match?.live === true,
    timer_running: match?.timerRunning === true,
    timer_started_at: match?.timerStartedAt ?? null,
    elapsed_seconds: match?.elapsedSeconds ?? 0,
    match_phase: match?.matchPhase || "waiting",
    events: Array.isArray(match?.events) ? match.events : [],
  };
}

export function queueFixtureSync(match) {
  if (match?.isKnockout === true || match?.id === null || match?.id === undefined || match?.id === "") return;
  const pending = readPendingFixtureSync();
  pending[String(match.id)] = {
    id: match.id,
    payload: fixtureCloudPayload(match),
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(PENDING_FIXTURE_SYNC_KEY, JSON.stringify(pending));
}

export function clearQueuedFixtureSync(id) {
  const pending = readPendingFixtureSync();
  const key = String(id);
  if (!(key in pending)) return;
  delete pending[key];
  if (Object.keys(pending).length === 0) localStorage.removeItem(PENDING_FIXTURE_SYNC_KEY);
  else localStorage.setItem(PENDING_FIXTURE_SYNC_KEY, JSON.stringify(pending));
}

export async function syncLeagueFixtureWithRetry(match) {
  if (match?.isKnockout === true || match?.id === null || match?.id === undefined || match?.id === "") return true;

  try {
    const { error } = await supabase
      .from("fixtures")
      .update(fixtureCloudPayload(match))
      .eq("id", match.id);

    if (error) throw error;
    clearQueuedFixtureSync(match.id);
    return true;
  } catch (error) {
    console.error("Fikstür bulut eşitlemesi beklemeye alındı:", error);
    queueFixtureSync(match);
    return false;
  }
}

export async function flushPendingFixtureSync() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const pending = readPendingFixtureSync();
  for (const entry of Object.values(pending)) {
    if (entry?.id === null || entry?.id === undefined || entry?.id === "" || !entry?.payload) continue;

    try {
      const { error } = await supabase
        .from("fixtures")
        .update(entry.payload)
        .eq("id", entry.id);

      if (!error) clearQueuedFixtureSync(entry.id);
    } catch (error) {
      console.warn("Bekleyen fikstür eşitlemesi tekrar denenecek:", error);
    }
  }
}
