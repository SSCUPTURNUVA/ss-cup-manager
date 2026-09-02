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
  const phase = match?.matchPhase || "waiting";
  const isWaiting = match?.played !== true && phase === "waiting";

  // Bekleyen/başlamamış bir maçın runtime verisi olamaz. Eski test skorları
  // veya eski pending kayıtları yeni maça asla geri yazılmasın.
  if (isWaiting) {
    return {
      home_score: 0,
      away_score: 0,
      played: false,
      live: false,
      timer_running: false,
      timer_started_at: null,
      elapsed_seconds: 0,
      match_phase: "waiting",
      events: [],
    };
  }

  return {
    home_score: Number(match?.homeScore ?? 0),
    away_score: Number(match?.awayScore ?? 0),
    played: match?.played === true,
    live: match?.live === true,
    timer_running: match?.timerRunning === true,
    timer_started_at: match?.timerStartedAt ?? null,
    elapsed_seconds: Number(match?.elapsedSeconds ?? 0),
    match_phase: phase,
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
    const { data, error } = await supabase
      .from("fixtures")
      .update(fixtureCloudPayload(match))
      .eq("id", match.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error(`Fikstür satırı güncellenemedi: ${match.id}`);
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
      const payload =
        entry?.payload?.played !== true && (entry?.payload?.match_phase || "waiting") === "waiting"
          ? {
              home_score: 0,
              away_score: 0,
              played: false,
              live: false,
              timer_running: false,
              timer_started_at: null,
              elapsed_seconds: 0,
              match_phase: "waiting",
              events: [],
            }
          : entry.payload;

      const { data, error } = await supabase
        .from("fixtures")
        .update(payload)
        .eq("id", entry.id)
        .select("id")
        .maybeSingle();

      if (!error && data?.id !== undefined && data?.id !== null) clearQueuedFixtureSync(entry.id);
    } catch (error) {
      console.warn("Bekleyen fikstür eşitlemesi tekrar denenecek:", error);
    }
  }
}
