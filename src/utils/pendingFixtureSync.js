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
  // fixtures tablosunda sahada kesin bulunan kalıcı kolonlar bunlar.
  // Canlı faz/süre/olay verileri app_state.fixture_runtime + fixtures_snapshot içinde tutulur.
  // Böylece şemada bulunmayan live/match_phase/events vb. kolonlara PATCH atıp 400 üretmeyiz.
  const isWaiting = match?.played !== true && (match?.matchPhase || "waiting") === "waiting";
  return {
    home_score: isWaiting ? 0 : Number(match?.homeScore ?? 0),
    away_score: isWaiting ? 0 : Number(match?.awayScore ?? 0),
    played: isWaiting ? false : match?.played === true,
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
      // Eski sürümler kuyruğa şemada olmayan runtime kolonlarını yazmış olabilir.
      // Flush sırasında yalnız fixtures tablosunun gerçek çekirdek kolonlarını gönder.
      const payload = {
        home_score: Number(entry?.payload?.home_score ?? 0),
        away_score: Number(entry?.payload?.away_score ?? 0),
        played: entry?.payload?.played === true,
      };

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
