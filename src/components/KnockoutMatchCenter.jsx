import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import MatchCenter from "./MatchCenter";

const STATE_ID = "knockout_match_center_v1";
const ACTIVE_KEY = "sscup-knockout-match-center-active";
const FIXED_RULES = { halfDurationMinutes: 25, halftimeDurationMinutes: 5 };

function normalizeMatch(raw) {
  if (!raw) return null;
  return {
    ...raw,
    isKnockout: true,
    played: raw.played === true,
    live: raw.live === true,
    matchPhase: raw.matchPhase || "waiting",
    homeScore: Number(raw.homeScore || 0),
    awayScore: Number(raw.awayScore || 0),
    homePen: raw.homePen ?? "",
    awayPen: raw.awayPen ?? "",
    events: Array.isArray(raw.events) ? raw.events : [],
    elapsedSeconds: Number(raw.elapsedSeconds || 0),
    timerRunning: raw.timerRunning === true,
    timerStartedAt: raw.timerStartedAt || null,
  };
}

export default function KnockoutMatchCenter() {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const liveBroadcastRef = useRef(null);

  useEffect(() => {
    const channel = supabase.channel("sscup-knockout-live-broadcast");
    channel.subscribe();
    liveBroadcastRef.current = channel;
    return () => {
      liveBroadcastRef.current = null;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from("app_state").select("value").eq("id", STATE_ID).maybeSingle();
        if (error) throw error;
        const loaded = normalizeMatch(data?.value?.activeMatch || null);
        if (!cancelled) {
          setMatch(loaded);
          if (loaded?.id && loaded.played !== true) localStorage.setItem(ACTIVE_KEY, String(loaded.id));
        }
      } catch (error) {
        console.error("Eleme Maç Merkezi yüklenemedi:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Eleme Turu'ndan farklı bir maç merkeze alındığında component açık kalsa bile
  // yeni aktif maçı anında yükle. Böylece ÇF2 açılırken ÇF1 ekranda kalmaz.
  useEffect(() => {
    let mounted = true;
    const reloadActiveMatch = async () => {
      const { data, error } = await supabase.from("app_state").select("value").eq("id", STATE_ID).maybeSingle();
      if (error || !mounted) return;
      const loaded = normalizeMatch(data?.value?.activeMatch || null);
      setMatch(loaded);
      if (loaded?.id && loaded.played !== true) localStorage.setItem(ACTIVE_KEY, String(loaded.id));
      else localStorage.removeItem(ACTIVE_KEY);
    };
    const channel = supabase.channel(`ko-center-active-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: `id=eq.${STATE_ID}` }, reloadActiveMatch)
      .subscribe();
    const onFocus = () => void reloadActiveMatch();
    window.addEventListener("focus", onFocus);
    return () => { mounted = false; window.removeEventListener("focus", onFocus); supabase.removeChannel(channel); };
  }, []);

  const persistMatch = useCallback(async (nextMatch) => {
    const normalized = normalizeMatch(nextMatch);
    setMatch(normalized);
    if (normalized?.id && normalized.played !== true) localStorage.setItem(ACTIVE_KEY, String(normalized.id));
    if (normalized?.played === true) localStorage.removeItem(ACTIVE_KEY);

    const now = new Date().toISOString();
    try {
      // 1) Eleme Maç Merkezi'nin kendi kalıcı kaydı.
      const centerWrite = supabase.from("app_state").upsert({
        id: STATE_ID,
        value: { activeMatch: normalized },
        updated_at: now,
      });

      // 2) Canlı Takip'in okuduğu eleme kaydını AYNI işlemle güncelle.
      // Böylece gol/kart ekleme kadar GERİ ALMA/SİLME de canlıdan kaybolur.
      const { data: koRow, error: koReadError } = await supabase
        .from("app_state")
        .select("value")
        .eq("id", "knockout")
        .maybeSingle();
      if (koReadError) throw koReadError;
      const value = koRow?.value && typeof koRow.value === "object" && !Array.isArray(koRow.value)
        ? { ...koRow.value }
        : {};

      if (normalized?.knockoutKey) {
        const key = String(normalized.knockoutKey);
        const publicMatch = { ...normalized, updatedAt: now };
        const quarterMatch = key.match(/^quarter-(\d+)$/);
        const semiMatch = key.match(/^semi-(\d+)$/);
        if (quarterMatch) {
          // Yeni kura quarter-1..4 kullanıyor; canlı kayıt quarter dizisinde 0..3'tür.
          const raw = Number(quarterMatch[1]);
          const index = raw >= 1 ? raw - 1 : raw;
          const quarter = Array.isArray(value.quarter) ? [...value.quarter] : [];
          quarter[index] = { ...(quarter[index] || {}), ...publicMatch };
          value.quarter = quarter;
        } else if (semiMatch) {
          const raw = Number(semiMatch[1]);
          const index = raw >= 1 ? raw - 1 : raw;
          const semi = Array.isArray(value.semi) ? [...value.semi] : [];
          semi[index] = { ...(semi[index] || {}), ...publicMatch };
          value.semi = semi;
        } else if (key === "final-0" || key === "final-1") {
          value.finalMatch = { ...(value.finalMatch || {}), ...publicMatch };
        } else if (key === "third-place-0" || key === "third-place-1") {
          value.thirdPlace = { ...(value.thirdPlace || {}), ...publicMatch };
        }
      }

      // Maç tamamlandıysa kazananı bir sonraki eleme turuna hazırla.
      // ÇF1-ÇF3 => YF1, ÇF2-ÇF4 => YF2. Yarı final kaybedenleri 3.'lük,
      // kazananları final maçına gider. Bu kayıtlar yalnız eleme app_state'indedir.
      if (normalized?.played === true && normalized?.knockoutKey) {
        const winnerOf = (m) => {
          if (!m?.home || !m?.away || m?.played !== true) return "";
          const hs = Number(m.homeScore || 0), as = Number(m.awayScore || 0);
          if (hs > as) return m.home;
          if (as > hs) return m.away;
          const hp = Number(m.homePen ?? m.homePenalties ?? 0), ap = Number(m.awayPen ?? m.awayPenalties ?? 0);
          return hp > ap ? m.home : ap > hp ? m.away : "";
        };
        const loserOf = (m) => { const w = winnerOf(m); return !w ? "" : (w === m.home ? m.away : m.home); };
        const quarter = Array.isArray(value.quarter) ? value.quarter : [];
        const semi = Array.isArray(value.semi) ? [...value.semi] : [];
        const q1 = quarter[0], q2 = quarter[1], q3 = quarter[2], q4 = quarter[3];
        const ensureMatch = (existing, key, label, home, away) => ({
          ...(existing || {}),
          id: existing?.id || `knockout:${normalized.drawId || "draw"}:${key}`,
          drawId: normalized.drawId || existing?.drawId || "", knockoutKey: key, stageLabel: label,
          home, away, isKnockout: true, played: existing?.played === true, live: existing?.live === true,
          matchPhase: existing?.matchPhase || "waiting", homeScore: Number(existing?.homeScore || 0),
          awayScore: Number(existing?.awayScore || 0), homePen: existing?.homePen ?? "", awayPen: existing?.awayPen ?? "",
          events: Array.isArray(existing?.events) ? existing.events : [], elapsedSeconds: Number(existing?.elapsedSeconds || 0),
          timerRunning: existing?.timerRunning === true, timerStartedAt: existing?.timerStartedAt || null,
        });
        const q1w=winnerOf(q1), q2w=winnerOf(q2), q3w=winnerOf(q3), q4w=winnerOf(q4);
        // Kazanan diğer çeyrek finali beklemeden yarı final slotuna yerleşir.
        if (q1w || q3w) semi[0] = ensureMatch(semi[0], "semi-1", "Yarı Final 1", q1w || semi[0]?.home || "", q3w || semi[0]?.away || "");
        if (q2w || q4w) semi[1] = ensureMatch(semi[1], "semi-2", "Yarı Final 2", q2w || semi[1]?.home || "", q4w || semi[1]?.away || "");
        value.semi = semi;
        const s1=semi[0], s2=semi[1], s1w=winnerOf(s1), s2w=winnerOf(s2), s1l=loserOf(s1), s2l=loserOf(s2);
        // Yarı final biter bitmez kazanan finale, kaybeden 3.'lük maçına yerleşir.
        if (s1w || s2w) value.finalMatch = ensureMatch(value.finalMatch, "final-0", "Final", s1w || value.finalMatch?.home || "", s2w || value.finalMatch?.away || "");
        if (s1l || s2l) value.thirdPlace = ensureMatch(value.thirdPlace, "third-place-0", "3.'lük Maçı", s1l || value.thirdPlace?.home || "", s2l || value.thirdPlace?.away || "");
      }

      const knockoutWrite = supabase.from("app_state").upsert({
        id: "knockout",
        value,
        updated_at: now,
      });
      const publicCenterWrite = supabase.from("app_state").upsert({
        id: "public_match_center",
        value: { matchId: normalized?.played === true ? "" : (normalized?.id || "") },
        updated_at: now,
      });

      const writes = [centerWrite, knockoutWrite, publicCenterWrite];

      // Biten eleme maçını lig arşivinden tamamen bağımsız Eleme Sonuçları arşivine yaz.
      if (normalized?.played === true) {
        const { data: resultsRow, error: resultsReadError } = await supabase
          .from("app_state")
          .select("value")
          .eq("id", "knockout_results_v1")
          .maybeSingle();
        if (resultsReadError) throw resultsReadError;
        const archive = Array.isArray(resultsRow?.value) ? [...resultsRow.value] : [];
        const completed = { ...normalized, completedAt: normalized.completedAt || now };
        const existingIndex = archive.findIndex((item) => String(item?.id) === String(completed.id));
        if (existingIndex >= 0) archive[existingIndex] = completed;
        else archive.unshift(completed);

        // Eleme sonuç arşivi bağımsız kalır; gol ve kart istatistikleri genel turnuva
        // panellerinde lig + eleme maç eventlerinden birlikte hesaplanır.

        writes.push(supabase.from("app_state").upsert({ id: "knockout_results_v1", value: archive, updated_at: now }));
      }

      const results = await Promise.all(writes);
      const failed = results.find((result) => result?.error);
      if (failed?.error) throw failed.error;
      // Postgres Realtime yayını projede kapalı/gecikmeli olsa bile açık canlı
      // ekranına değişiklik sinyali gönder. Veri yine Supabase app_state'ten okunur.
      try {
        await liveBroadcastRef.current?.send({
          type: "broadcast",
          event: "knockout_changed",
          payload: { matchId: normalized?.id || "", updatedAt: now },
        });
      } catch (broadcastError) {
        console.warn("Eleme canlı yayın sinyali gönderilemedi:", broadcastError);
      }
      if (normalized?.played === true) {
        await supabase.from("app_state").upsert({ id: STATE_ID, value: { activeMatch: null }, updated_at: new Date().toISOString() });
        setMatch(null);
      }
    } catch (error) {
      console.error("Eleme maçı/canlı takip kaydedilemedi:", error);
    }
  }, []);

  const setKnockoutFixtures = useCallback((value) => {
    const current = match ? [match] : [];
    const next = typeof value === "function" ? value(current) : value;
    const nextMatch = normalizeMatch(Array.isArray(next) ? next[0] : null);
    if (nextMatch) void persistMatch(nextMatch);
  }, [match, persistMatch]);

  if (loading) return <div className="page-card"><h2>🏆 Eleme Maç Merkezi</h2><p>Yükleniyor...</p></div>;
  if (!match) return <div className="page-card"><h2>🏆 Eleme Maç Merkezi</h2><p>Maç merkezine alınmış eleme maçı yok.</p></div>;

  return (
    <div className="page-stack">
      <div className="page-card" style={{paddingBottom: 8}}>
        <h2>🏆 Eleme Maç Merkezi</h2>
        <p style={{opacity:.7, marginBottom:0}}>25 + 25 dakika • Beraberlikte uzatma yok, direkt penaltı • Lig Maç Merkezi'nden bağımsız</p>
      </div>
      <MatchCenter
        fixtures={[match]}
        standings={[]}
        goalScorers={[]}
        setFixtures={setKnockoutFixtures}
        matchRulesOverride={FIXED_RULES}
        isolatedKnockout={true}
        activeStorageKey={ACTIVE_KEY}
      />
    </div>
  );
}
