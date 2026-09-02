import { supabase } from "../supabase";

export const PENDING_APP_STATE_SYNC_KEY = "sscup-pending-app-state-sync-v2";


function eventKey(event, index = 0) {
  return String(
    event?.id ||
    event?.actionId ||
    `${event?.type || event?.eventType || "event"}|${event?.team || event?.teamName || ""}|${event?.playerId || event?.playerName || event?.name || ""}|${event?.minute ?? ""}|${index}`
  );
}

function mergeEvents(cloudEvents, localEvents) {
  const merged = [];
  const seen = new Set();
  [...(Array.isArray(cloudEvents) ? cloudEvents : []), ...(Array.isArray(localEvents) ? localEvents : [])]
    .forEach((event, index) => {
      const key = eventKey(event, index);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(event);
    });
  return merged;
}

function matchKey(match, index = 0) {
  return String(match?.id ?? match?.knockoutKey ?? `${match?.home || ""}|${match?.away || ""}|${match?.date || ""}|${match?.time || ""}|${index}`);
}

function mergeFixtureSnapshots(cloudValue, localValue, cloudRowUpdatedAt = "", localSavedAt = "") {
  const cloud = Array.isArray(cloudValue) ? cloudValue : [];
  const local = Array.isArray(localValue) ? localValue : [];
  if (!cloud.length) return local;
  if (!local.length) return cloud;

  const cloudMap = new Map(cloud.map((m, i) => [matchKey(m, i), m]));
  const localMap = new Map(local.map((m, i) => [matchKey(m, i), m]));
  const keys = [...new Set([...cloudMap.keys(), ...localMap.keys()])];
  const cloudRowTs = toTime(cloudRowUpdatedAt);
  const localRowTs = toTime(localSavedAt);

  return keys.map((key) => {
    const c = cloudMap.get(key);
    const l = localMap.get(key);
    if (!c) return l;
    if (!l) return c;

    const ct = Math.max(toTime(c?.runtimeUpdatedAt), cloudRowTs);
    const lt = Math.max(toTime(l?.runtimeUpdatedAt), localRowTs);

    // KRİTİK: event listelerini UNION yapma. Yeni snapshot otoritedir.
    // Böylece kart/gol/değişiklik silinince eski cihaz onu yeniden diriltemez.
    // Eşit zamanda yerel kullanıcı işlemi kazanır (remove-wins/local-write-wins).
    const newer = lt >= ct ? l : c;
    const older = lt >= ct ? c : l;
    return {
      ...older,
      ...newer,
      events: Array.isArray(newer?.events) ? newer.events : [],
      goals: Array.isArray(newer?.goals) ? newer.goals : [],
      runtimeUpdatedAt: newer?.runtimeUpdatedAt || new Date(Math.max(ct, lt, Date.now())).toISOString(),
    };
  });
}

async function prepareAppStateValue(id, value, savedAt) {
  if (String(id) !== "fixtures_snapshot") return value;
  try {
    const { data, error } = await supabase
      .from("app_state")
      .select("value,updated_at")
      .eq("id", "fixtures_snapshot")
      .maybeSingle();
    if (error) throw error;
    return mergeFixtureSnapshots(data?.value, value, data?.updated_at, savedAt);
  } catch (error) {
    console.warn("fixtures_snapshot birleştirme okunamadı; yerel kayıt korunuyor:", error);
    return value;
  }
}

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

  const savedAt = new Date().toISOString();
  queueAppStateSync(id, value);

  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  try {
    const mergedValue = await prepareAppStateValue(id, value, savedAt);
    // Birleştirilmiş veri de kuyruğa alınır; tam bu anda kapanırsa event kaybolmaz.
    queueAppStateSync(id, mergedValue);
    const { data, error } = await supabase.from("app_state").upsert({
      id: String(id),
      value: mergedValue,
      updated_at: new Date().toISOString(),
    }).select("id,updated_at").maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error(`app_state/${id} bulutta doğrulanamadı; kayıt kuyrukta korunuyor.`);

    // Telefon/PWA'da yalnız upsert cevabını başarı sayma. Sunucudan tekrar okuyup
    // gerçekten yazıldığını doğrula; doğrulanmazsa kuyruk ASLA silinmez.
    const { data: verifyRow, error: verifyError } = await supabase
      .from("app_state")
      .select("value,updated_at")
      .eq("id", String(id))
      .maybeSingle();
    if (verifyError) throw verifyError;
    if (!verifyRow) throw new Error(`app_state/${id} geri okunamadı; kayıt kuyrukta korunuyor.`);

    if (String(id) === "fixtures_snapshot" && Array.isArray(mergedValue)) {
      const wantedJson = JSON.stringify(mergedValue);
      const gotJson = JSON.stringify(Array.isArray(verifyRow.value) ? verifyRow.value : []);
      if (gotJson !== wantedJson) throw new Error("fixtures_snapshot sunucuda farklı; yerel kayıt korunuyor.");
    }

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
      const mergedValue = await prepareAppStateValue(entry.id, entry.value, entry.savedAt);
      const { data, error } = await supabase.from("app_state").upsert({
        id: String(entry.id),
        value: mergedValue,
        updated_at: new Date().toISOString(),
      }).select("id,updated_at").maybeSingle();
      if (!error && data?.id) {
        const { data: verifyRow, error: verifyError } = await supabase
          .from("app_state").select("value").eq("id", String(entry.id)).maybeSingle();
        if (!verifyError && verifyRow) {
          if (String(entry.id) !== "fixtures_snapshot") clearQueuedAppStateSync(entry.id);
          else {
            const wanted = JSON.stringify(Array.isArray(mergedValue) ? mergedValue : []);
            const got = JSON.stringify(Array.isArray(verifyRow.value) ? verifyRow.value : []);
            if (got === wanted) clearQueuedAppStateSync(entry.id);
          }
        }
      }
    } catch (error) {
      console.warn(`Bekleyen app_state/${entry.id} eşitlemesi tekrar denenecek:`, error);
    }
  }
}
