import { supabase } from "../supabase";

export const PENDING_APP_STATE_SYNC_KEY = "sscup-pending-app-state-sync-v2";

export function readPendingAppStateSync() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_APP_STATE_SYNC_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function queueAppStateSync(id, value) {
  if (!id) return;
  const pending = readPendingAppStateSync();
  pending[String(id)] = {
    id: String(id),
    value,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(PENDING_APP_STATE_SYNC_KEY, JSON.stringify(pending));
}

export function clearQueuedAppStateSync(id) {
  const pending = readPendingAppStateSync();
  const key = String(id);
  if (!(key in pending)) return;
  delete pending[key];
  if (Object.keys(pending).length === 0) localStorage.removeItem(PENDING_APP_STATE_SYNC_KEY);
  else localStorage.setItem(PENDING_APP_STATE_SYNC_KEY, JSON.stringify(pending));
}

export async function syncAppStateWithRetry(id, value) {
  if (!id) return true;

  // Önce yerel kuyruk: uygulama bu await sırasında kapanırsa bile veri kaybolmaz.
  queueAppStateSync(id, value);

  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  try {
    const { data, error } = await supabase.from("app_state").upsert({
      id: String(id),
      value,
      updated_at: new Date().toISOString(),
    }).select("id,updated_at").maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error(`app_state/${id} bulutta doğrulanamadı; kayıt kuyrukta korunuyor.`);
    clearQueuedAppStateSync(id);
    return true;
  } catch (error) {
    console.error(`app_state/${id} bulut eşitlemesi beklemeye alındı:`, error);
    return false;
  }
}

export async function flushPendingAppStateSync() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const pending = readPendingAppStateSync();
  for (const entry of Object.values(pending)) {
    if (!entry?.id) continue;
    try {
      const { data, error } = await supabase.from("app_state").upsert({
        id: String(entry.id),
        value: entry.value,
        updated_at: entry.savedAt || new Date().toISOString(),
      }).select("id,updated_at").maybeSingle();
      if (!error && data?.id) clearQueuedAppStateSync(entry.id);
    } catch (error) {
      console.warn(`Bekleyen app_state/${entry.id} eşitlemesi tekrar denenecek:`, error);
    }
  }
}
