import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import "./KnockoutDraw.css";

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function KnockoutDraw({ standings = [], fixtures = [], setFixtures, onOpenKnockoutMatchCenter }) {
  const topEight = useMemo(
    () => (standings || []).slice(0, 8).map((row) => row?.team).filter(Boolean),
    [standings]
  );
  const [mode, setMode] = useState("manual");
  const [pairs, setPairs] = useState([]);
  const [drawId, setDrawId] = useState("");
  const [firstTeam, setFirstTeam] = useState("");
  const [knockoutCloud, setKnockoutCloud] = useState({});
  const [knockoutResults, setKnockoutResults] = useState([]);
  const [resetting, setResetting] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [knockoutSchedule, setKnockoutSchedule] = useState({});
  const drawLoadedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const loadSchedule = async () => {
      const { data, error } = await supabase.from("app_state").select("value").eq("id", "knockout_schedule_v1").maybeSingle();
      if (!error && mounted) setKnockoutSchedule(data?.value && typeof data.value === "object" ? data.value : {});
    };
    loadSchedule();
    const channel = supabase.channel(`ko-schedule-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_schedule_v1" }, loadSchedule)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  async function updateKnockoutSchedule(slotKey, field, value) {
    const next = {
      ...knockoutSchedule,
      [slotKey]: { ...(knockoutSchedule?.[slotKey] || {}), [field]: value },
    };
    setKnockoutSchedule(next);
    const { error } = await supabase.from("app_state").upsert({
      id: "knockout_schedule_v1",
      value: next,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Eleme tarih/saat kaydedilemedi:", error);
      setNotice("Tarih/saat kaydedilemedi. Tekrar deneyin.");
    }
  }

  // Eleme kurasını Supabase'den geri yükle. İlk boş render buluttaki kuranın
  // üstüne yazmasın diye kayıt, yükleme tamamlandıktan sonra başlar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("value")
          .eq("id", "knockout_draw_v1")
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const value = data?.value;
        if (value && typeof value === "object") {
          if (["manual", "bag", "seeded"].includes(value.mode)) setMode(value.mode);
          if (Array.isArray(value.pairs)) setPairs(value.pairs.slice(0, 4));
          if (value.drawId) setDrawId(String(value.drawId));
        }
      } catch (error) {
        console.error("Eleme kurası yüklenemedi:", error);
      } finally {
        if (!cancelled) drawLoadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Kura değiştiği anda Supabase'e yaz.
  useEffect(() => {
    if (!drawLoadedRef.current) return;
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from("app_state").upsert({
        id: "knockout_draw_v1",
        value: { mode, pairs, drawId },
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("Eleme kurası kaydedilemedi:", error);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, pairs, drawId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.from("app_state").select("value").eq("id", "knockout").maybeSingle();
      if (mounted) setKnockoutCloud(data?.value && typeof data.value === "object" ? data.value : {});
    };
    load();
    const channel = supabase.channel(`ko-draw-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadResults = async () => {
      const { data } = await supabase.from("app_state").select("value").eq("id", "knockout_results_v1").maybeSingle();
      if (mounted) setKnockoutResults(Array.isArray(data?.value) ? data.value : []);
    };
    loadResults();
    const channel = supabase.channel(`ko-results-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_results_v1" }, loadResults)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);


  const usedTeams = useMemo(() => new Set(pairs.flat()), [pairs]);
  const availableTeams = topEight.filter((team) => !usedTeams.has(team));
  const secondOptions = availableTeams.filter((team) => team !== firstTeam);

  async function resetDraw({ askConfirm = false } = {}) {
    if (resetting) return;
    if (askConfirm) setResetting(true);
    // TEST MODU: Eleme sistemini tamamen sıfırla. Lig verilerine dokunma.
    const nextFixtures = fixtures.filter((match) => match?.isKnockout !== true);

    setPairs([]);
    setDrawId("");
    setFirstTeam("");
    setKnockoutCloud({});
    setKnockoutResults([]);
    setKnockoutSchedule({});

    // Ayrı Eleme Maç Merkezi aktif seçimini tamamen kaldır.
    localStorage.removeItem("sscup-knockout-match-center-active");

    // Sadece eleme maçlarına ait hazır kadroları temizle.
    // Bağımsız eleme maçlarının id'leri knockout: ile başlar; lig kadroları korunur.
    try {
      const savedLineups = JSON.parse(localStorage.getItem("sscup-match-lineups") || "{}");
      const nextLineups = Object.fromEntries(
        Object.entries(savedLineups).filter(([key]) => !String(key).startsWith("knockout:"))
      );
      localStorage.setItem("sscup-match-lineups", JSON.stringify(nextLineups));
      await supabase.from("app_state").upsert({
        id: "match_lineups",
        value: nextLineups,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Eleme kadroları temizlenemedi:", error);
    }

    // Eski yapıda fixtures içine düşmüş eleme kayıtları varsa yalnız onları çıkar.
    localStorage.setItem("sscup-fixtures", JSON.stringify(nextFixtures));
    if (typeof setFixtures === "function") setFixtures(nextFixtures);
    window.dispatchEvent(new CustomEvent("sscup-fixtures-updated", { detail: nextFixtures }));

    try {
      const now = new Date().toISOString();
      const writes = await Promise.all([
        // Kura + ÇF/YF/Final/3.'lük ilerlemesi tamamen temizlenir.
        supabase.from("app_state").upsert({
          id: "knockout_draw_v1",
          value: { mode, pairs: [], drawId: "" },
          updated_at: now,
        }),
        supabase.from("app_state").upsert({
          id: "knockout",
          value: {},
          updated_at: now,
        }),
        // Aktif eleme maçı, skor, süre, olay, penaltı kaydı tamamen temizlenir.
        supabase.from("app_state").upsert({
          id: "knockout_match_center_v1",
          value: { activeMatch: null },
          updated_at: now,
        }),
        // Canlı takip artık sıfırlanan eleme maçını aktif maç olarak tutmasın.
        supabase.from("app_state").upsert({
          id: "public_match_center",
          value: { matchId: "" },
          updated_at: now,
        }),
        // İleride/şu anda kullanılan bağımsız eleme arşiv ve istatistik kayıtları da testte sıfırlansın.
        supabase.from("app_state").upsert({ id: "knockout_results_v1", value: [], updated_at: now }),
        supabase.from("app_state").upsert({ id: "knockout_goal_scorers_v1", value: [], updated_at: now }),
        supabase.from("app_state").upsert({ id: "knockout_cards_v1", value: [], updated_at: now }),
        supabase.from("app_state").upsert({ id: "knockout_schedule_v1", value: {}, updated_at: now }),
        supabase.from("app_state").upsert({
          id: "fixtures_snapshot",
          value: nextFixtures,
          updated_at: now,
        }),
      ]);
      const failed = writes.find((result) => result?.error);
      if (failed?.error) throw failed.error;
    } catch (error) {
      console.error("Eleme sistemi tamamen sıfırlanamadı:", error);
      if (askConfirm) setNotice("Eleme sistemi sıfırlanamadı. Lütfen tekrar deneyin.");
      if (askConfirm) setResetting(false);
      return;
    }

    if (askConfirm) {
      setResetting(false);
      setNotice("Eleme sistemi sıfırlandı.");
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    resetDraw();
  }

  function addManualPair(secondTeam) {
    const selectedFirst = firstTeam;
    if (!selectedFirst || !secondTeam || selectedFirst === secondTeam) return;
    if (!drawId) setDrawId(`draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    // Kontrolü güncel prev üzerinden yap: hızlı seçimde eski render'ın usedTeams'i
    // ikinci eşleşmeye ilk maçın takımlarını tekrar sokamasın.
    setPairs((prev) => {
      if (prev.length >= 4) return prev;
      const usedNow = new Set(prev.flat());
      if (usedNow.has(selectedFirst) || usedNow.has(secondTeam)) return prev;
      return [...prev, [selectedFirst, secondTeam]];
    });
    setFirstTeam("");
  }

  function makeBagDraw() {
    if (topEight.length !== 8) return;
    setDrawId(`draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const drawn = shuffle(topEight);
    setPairs([
      [drawn[0], drawn[1]],
      [drawn[2], drawn[3]],
      [drawn[4], drawn[5]],
      [drawn[6], drawn[7]],
    ]);
    setFirstTeam("");
  }

  function makeSeededDraw() {
    if (topEight.length !== 8) return;
    setDrawId(`draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setPairs([
      [topEight[0], topEight[7]],
      [topEight[1], topEight[6]],
      [topEight[2], topEight[5]],
      [topEight[3], topEight[4]],
    ]);
    setFirstTeam("");
  }

  const complete = topEight.length === 8 && pairs.length === 4;

  async function sendQuarterToMatchCenter(index) {
    const pair = pairs[index];
    if (!pair?.[0] || !pair?.[1]) return;
    if (knockoutCloud?.quarter?.[index]?.played === true) return;

    const currentDrawId = drawId || `draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!drawId) setDrawId(currentDrawId);
    const activeMatch = {
      id: `knockout:${currentDrawId}:quarter-${index + 1}`,
      drawId: currentDrawId,
      knockoutKey: `quarter-${index + 1}`,
      stageLabel: `Çeyrek Final ${index + 1}`,
      home: pair[0],
      away: pair[1],
      date: knockoutSchedule?.[`quarter-${index}`]?.date || "",
      time: knockoutSchedule?.[`quarter-${index}`]?.time || "",
      status: "waiting",
      isKnockout: true,
      played: false,
      live: false,
      matchPhase: "waiting",
      homeScore: 0,
      awayScore: 0,
      homePen: "",
      awayPen: "",
      events: [],
      elapsedSeconds: 0,
      timerRunning: false,
      timerStartedAt: null,
      createdAt: new Date().toISOString(),
    };

    // Eleme Maç Merkezi tamamen ayrı kayıt kullanır; lig fixtures'ına dokunmaz.
    try {
      const { error } = await supabase.from("app_state").upsert({
        id: "knockout_match_center_v1",
        value: { activeMatch },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (error) {
      console.error("Eleme Maç Merkezi kaydedilemedi:", error);
      return;
    }

    if (typeof onOpenKnockoutMatchCenter === "function") onOpenKnockoutMatchCenter();
  }

  async function sendExistingToMatchCenter(source, fallbackKey, fallbackLabel, scheduleKey = fallbackKey) {
    if (!source?.home || !source?.away) return;
    const activeMatch = {
      ...source,
      date: knockoutSchedule?.[scheduleKey]?.date || source.date || "",
      time: knockoutSchedule?.[scheduleKey]?.time || source.time || "",
      id: source.id || `knockout:${drawId || "draw"}:${fallbackKey}`,
      drawId: source.drawId || drawId || "", knockoutKey: source.knockoutKey || fallbackKey, stageLabel: source.stageLabel || fallbackLabel,
      isKnockout: true, played: source.played === true, live: source.live === true, matchPhase: source.matchPhase || "waiting",
      homeScore: Number(source.homeScore || 0), awayScore: Number(source.awayScore || 0), homePen: source.homePen ?? "", awayPen: source.awayPen ?? "",
      events: Array.isArray(source.events) ? source.events : [], elapsedSeconds: Number(source.elapsedSeconds || 0), timerRunning: source.timerRunning === true, timerStartedAt: source.timerStartedAt || null,
    };
    if (activeMatch.played) return;
    const { error } = await supabase.from("app_state").upsert({ id: "knockout_match_center_v1", value: { activeMatch }, updated_at: new Date().toISOString() });
    if (error) { console.error("Eleme Maç Merkezi kaydedilemedi:", error); return; }
    if (typeof onOpenKnockoutMatchCenter === "function") onOpenKnockoutMatchCenter();
  }

  const semiCloud = Array.isArray(knockoutCloud.semi) ? knockoutCloud.semi : [];
  const finalCloud = knockoutCloud.finalMatch || null;
  const thirdCloud = knockoutCloud.thirdPlace || null;
  const resultEvents = Array.isArray(selectedResult?.events) ? selectedResult.events : [];
  const eventLabel = (event) => ({
    goal: "⚽ GOL", penalty_goal: "🥅 PENALTI GOLÜ", penalty_shootout_goal: "⚽ PENALTI GOLÜ",
    penalty_shootout_miss: "❌ PENALTI KAÇTI", penalty_miss: "❌ PENALTI KAÇTI", own_goal: "🥴 KENDİ KALESİNE",
    yellow_card: "🟨 SARI KART", red_card: "🟥 KIRMIZI KART", substitution: "🔄 DEĞİŞİKLİK", assist: "🅰️ ASİST"
  }[event?.type || event?.eventType] || String(event?.type || event?.eventType || "OLAY").toUpperCase());

  return (
    <div className="ko-page">
      <section className="ko-hero">
        <div>
          <div className="ko-kicker">S&amp;S CUP • ELEME AŞAMASI</div>
          <h2>1/8 FİNAL KURASI</h2>
          <p>Lig sıralamasındaki ilk 8 takım otomatik olarak kura havuzuna alınır.</p>
        </div>
        <button type="button" className="ko-reset" disabled={resetting} onClick={() => setResetModalOpen(true)}>{resetting ? "SIFIRLANIYOR..." : "↻ ELEMELERİ SIFIRLA"}</button>
      </section>

      <section className="ko-card">
        <div className="ko-section-title">
          <div><span>01</span><h3>Kura Yöntemi</h3></div>
          <small>Bir yöntem seç</small>
        </div>
        <div className="ko-modes">
          <button type="button" className={mode === "manual" ? "active" : ""} onClick={() => changeMode("manual")}>
            <b>✍️ Elle Kura</b><small>Eşleşmeleri tek tek sen belirle</small>
          </button>
          <button type="button" className={mode === "bag" ? "active" : ""} onClick={() => changeMode("bag")}>
            <b>🎲 Torbalı Kura</b><small>8 takım tek torbada rastgele eşleşir</small>
          </button>
          <button type="button" className={mode === "seeded" ? "active" : ""} onClick={() => changeMode("seeded")}>
            <b>🏅 Sıralama Kurası</b><small>1–8 • 2–7 • 3–6 • 4–5</small>
          </button>
        </div>
      </section>

      <section className="ko-card">
        <div className="ko-section-title">
          <div><span>02</span><h3>Lig İlk 8</h3></div>
          <small>{topEight.length}/8 takım</small>
        </div>
        {topEight.length < 8 && <div className="ko-warning">İlk 8 henüz tamamlanmadı. Şu an {topEight.length} takım bulunuyor.</div>}
        <div className="ko-top8">
          {topEight.map((team, index) => (
            <div key={`${team}-${index}`} className={usedTeams.has(team) ? "used" : ""}>
              <span className="rank">{index + 1}</span>
              <strong>{team}</strong>
              {usedTeams.has(team) && <span className="check">✓</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="ko-card">
        <div className="ko-section-title">
          <div><span>03</span><h3>{mode === "manual" ? "Elle Kura" : mode === "bag" ? "Torbalı Kura" : "Sıralama Kurası"}</h3></div>
          <small>{pairs.length}/4 eşleşme</small>
        </div>

        {mode === "manual" && (
          <div className="ko-manual">
            {pairs.length < 4 && topEight.length === 8 ? (
              <>
                <label><span>Takım</span><select value={firstTeam} onChange={(e) => setFirstTeam(e.target.value)}><option value="">Takım seç</option>{availableTeams.map((team) => <option key={team} value={team}>{team}</option>)}</select></label>
                <div className="ko-vs">VS</div>
                <label><span>Rakip</span><select value="" disabled={!firstTeam} onChange={(e) => addManualPair(e.target.value)}><option value="">{firstTeam ? "Rakip seç" : "Önce takım seç"}</option>{secondOptions.map((team) => <option key={team} value={team}>{team}</option>)}</select></label>
              </>
            ) : <div className="ko-complete">✓ 4 eşleşme tamamlandı.</div>}
          </div>
        )}

        {mode === "bag" && <div className="ko-action"><p>İlk 8 takım tek torbada karıştırılır ve her takım yalnızca bir kez çekilir.</p><button type="button" disabled={topEight.length !== 8} onClick={makeBagDraw}>🎲 KURAYI ÇEK</button></div>}
        {mode === "seeded" && <div className="ko-action"><p>Lig sıralamasına göre otomatik eşleşme: <b>1–8, 2–7, 3–6, 4–5</b>.</p><button type="button" disabled={topEight.length !== 8} onClick={makeSeededDraw}>🏅 SIRALAMAYA GÖRE EŞLEŞTİR</button></div>}
      </section>
      <section className="ko-card ko-bracket-card">
        <div className="ko-section-title"><div><span>05</span><h3>1/8 Final Eşleşmeleri</h3></div>{complete && <small className="done">KURA TAMAMLANDI ✓</small>}</div>
        <div className="ko-pairs">
          {[0,1,2,3].map((index) => {
            const pair = pairs[index];
            const playedMatch = Array.isArray(knockoutCloud.quarter) ? knockoutCloud.quarter[index] : null;
            const completed = playedMatch?.played === true;
            const home = playedMatch?.home || pair?.[0];
            const away = playedMatch?.away || pair?.[1];
            const penaltyText = completed && Number(playedMatch?.homeScore || 0) === Number(playedMatch?.awayScore || 0)
              ? ` • Penaltılar ${playedMatch?.homePen ?? 0}-${playedMatch?.awayPen ?? 0}` : "";
            return <div className={pair ? "ko-pair filled" : "ko-pair"} key={index}>
              <div className="match-no">1/8 • MAÇ {index + 1}{completed ? " • TAMAMLANDI" : ""}</div>
              <div className="team"><span>{home || "Takım bekleniyor"}</span>{completed && <b>{Number(playedMatch?.homeScore || 0)}</b>}</div>
              <div className="pair-vs">{completed ? "-" : "VS"}</div>
              <div className="team"><span>{away || "Rakip bekleniyor"}</span>{completed && <b>{Number(playedMatch?.awayScore || 0)}</b>}</div>
              {completed && <div className="ko-result-note">✓ TAMAMLANDI{penaltyText}</div>}
              <div className="ko-inline-schedule">
  <label><span>📅 TARİH</span><input type="date" value={knockoutSchedule?.[`quarter-${index}`]?.date || ""} onChange={(e) => updateKnockoutSchedule(`quarter-${index}`, "date", e.target.value)} /></label>
  <label><span>🕘 SAAT</span><input type="time" value={knockoutSchedule?.[`quarter-${index}`]?.time || ""} onChange={(e) => updateKnockoutSchedule(`quarter-${index}`, "time", e.target.value)} /></label>
</div>
{pair && !completed && <button type="button" className="ko-mc-button" onClick={() => sendQuarterToMatchCenter(index)}>🏟️ Maç Merkezine Al</button>}
            </div>;
          })}
        </div>
      </section>

      <section className="ko-card ko-road-card">
        <div className="ko-section-title"><div><span>05</span><h3>Yarı Final</h3></div><small>ÇF1–ÇF3 • ÇF2–ÇF4</small></div>
        <div className="ko-pairs">
          {[0,1].map((i) => { const m=semiCloud[i]; return <div className={m?.home && m?.away ? "ko-pair filled" : "ko-pair"} key={`semi-${i}`}>
            <div className="match-no">YARI FİNAL {i+1}</div><div className="team"><span>{m?.home || (i===0 ? "ÇF1 Kazananı" : "ÇF2 Kazananı")}</span></div><div className="pair-vs">VS</div><div className="team"><span>{m?.away || (i===0 ? "ÇF3 Kazananı" : "ÇF4 Kazananı")}</span></div>
            <div className="ko-inline-schedule"><label><span>📅 TARİH</span><input type="date" value={knockoutSchedule?.[`semi-${i}`]?.date || ""} onChange={(e) => updateKnockoutSchedule(`semi-${i}`, "date", e.target.value)} /></label><label><span>🕘 SAAT</span><input type="time" value={knockoutSchedule?.[`semi-${i}`]?.time || ""} onChange={(e) => updateKnockoutSchedule(`semi-${i}`, "time", e.target.value)} /></label></div>
{m?.home && m?.away && m?.played !== true && <button type="button" className="ko-mc-button" onClick={() => sendExistingToMatchCenter(m, `semi-${i+1}`, `Yarı Final ${i+1}`, `semi-${i}`)}>🏟️ Maç Merkezine Al</button>}
          </div>; })}
        </div>
      </section>

      <section className="ko-card ko-road-card">
        <div className="ko-section-title"><div><span>06</span><h3>Üçüncülük Maçı</h3></div></div>
        <div className="ko-pairs"><div className={thirdCloud?.home && thirdCloud?.away ? "ko-pair filled" : "ko-pair"}><div className="match-no">3.'LÜK</div><div className="team"><span>{thirdCloud?.home || "YF1 Kaybedeni"}</span></div><div className="pair-vs">VS</div><div className="team"><span>{thirdCloud?.away || "YF2 Kaybedeni"}</span></div><div className="ko-inline-schedule"><label><span>📅 TARİH</span><input type="date" value={knockoutSchedule?.["third-place-0"]?.date || ""} onChange={(e) => updateKnockoutSchedule("third-place-0", "date", e.target.value)} /></label><label><span>🕘 SAAT</span><input type="time" value={knockoutSchedule?.["third-place-0"]?.time || ""} onChange={(e) => updateKnockoutSchedule("third-place-0", "time", e.target.value)} /></label></div>{thirdCloud?.home && thirdCloud?.away && thirdCloud?.played !== true && <button type="button" className="ko-mc-button" onClick={() => sendExistingToMatchCenter(thirdCloud, "third-place-0", "3.'lük Maçı", "third-place-0")}>🏟️ Maç Merkezine Al</button>}</div></div>
      </section>

      <section className="ko-card ko-road-card">
        <div className="ko-section-title"><div><span>07</span><h3>Final</h3></div></div>
        <div className="ko-pairs"><div className={finalCloud?.home && finalCloud?.away ? "ko-pair filled" : "ko-pair"}><div className="match-no">FİNAL</div><div className="team"><span>{finalCloud?.home || "YF1 Kazananı"}</span></div><div className="pair-vs">VS</div><div className="team"><span>{finalCloud?.away || "YF2 Kazananı"}</span></div><div className="ko-inline-schedule"><label><span>📅 TARİH</span><input type="date" value={knockoutSchedule?.["final-0"]?.date || ""} onChange={(e) => updateKnockoutSchedule("final-0", "date", e.target.value)} /></label><label><span>🕘 SAAT</span><input type="time" value={knockoutSchedule?.["final-0"]?.time || ""} onChange={(e) => updateKnockoutSchedule("final-0", "time", e.target.value)} /></label></div>{finalCloud?.home && finalCloud?.away && finalCloud?.played !== true && <button type="button" className="ko-mc-button" onClick={() => sendExistingToMatchCenter(finalCloud, "final-0", "Final", "final-0")}>🏟️ Maç Merkezine Al</button>}</div></div>
      </section>

      <section className="ko-card ko-road-card">
        <div className="ko-section-title"><div><span>08</span><h3>Eleme Maçları Sonuçları</h3></div><small>{knockoutResults.length} maç</small></div>
        {knockoutResults.length === 0 ? <div className="ko-warning">Henüz tamamlanmış eleme maçı yok.</div> : (
          <div className="ko-results-list">
            {knockoutResults.map((m) => {
              const tied = Number(m?.homeScore || 0) === Number(m?.awayScore || 0);
              return <button type="button" className="ko-result-row" key={m.id} onClick={() => setSelectedResult(m)}>
                <div><b>{m.stageLabel || "Eleme Maçı"}</b><small>{m.completedAt ? new Date(m.completedAt).toLocaleString("tr-TR") : ""}</small></div>
                <div className="ko-result-score"><span>{m.home}</span><strong>{Number(m.homeScore || 0)} - {Number(m.awayScore || 0)}</strong><span>{m.away}</span></div>
                {tied && <div className="ko-result-pen">Penaltılar: {m.homePen ?? 0} - {m.awayPen ?? 0}</div>}
                <div className="ko-result-detail-hint">Maç olaylarını gör ›</div>
              </button>;
            })}
          </div>
        )}
      </section>

      {resetModalOpen && <div className="ko-confirm-backdrop" onMouseDown={() => !resetting && setResetModalOpen(false)}>
        <div className="ko-confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
          <div className="ko-confirm-icon">⚠️</div>
          <h3>Elemeleri Sıfırla</h3>
          <p>Kura, aktif maç, kadro, skor, süre, olaylar, penaltılar ve test eleme kayıtları temizlenecek. Lig verilerine dokunulmayacak.</p>
          <div className="ko-confirm-actions">
            <button type="button" className="cancel" disabled={resetting} onClick={() => setResetModalOpen(false)}>VAZGEÇ</button>
            <button type="button" className="danger" disabled={resetting} onClick={async () => { await resetDraw({ askConfirm: true }); setResetModalOpen(false); }}>{resetting ? "SIFIRLANIYOR..." : "ELEMELERİ SIFIRLA"}</button>
          </div>
        </div>
      </div>}

      {notice && <div className="ko-notice" role="status" onClick={() => setNotice("")}>✓ {notice}</div>}

      {selectedResult && <div className="ko-detail-backdrop" onMouseDown={() => setSelectedResult(null)}>
        <div className="ko-detail-modal" onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" className="ko-detail-close" onClick={() => setSelectedResult(null)}>×</button>
          <div className="ko-detail-stage">{selectedResult.stageLabel || "ELEME MAÇI"} • MAÇ SONU</div>
          <div className="ko-detail-score"><strong>{selectedResult.home}</strong><b>{Number(selectedResult.homeScore || 0)} - {Number(selectedResult.awayScore || 0)}</b><strong>{selectedResult.away}</strong></div>
          {Number(selectedResult.homeScore || 0) === Number(selectedResult.awayScore || 0) && <div className="ko-detail-pen">PENALTILAR {selectedResult.homePen ?? 0} - {selectedResult.awayPen ?? 0}</div>}
          <div className="ko-detail-title">MAÇ OLAYLARI <span>{resultEvents.length}</span></div>
          {resultEvents.length === 0 ? <div className="ko-warning">Bu maç için kayıtlı maç olayı yok.</div> : <div className="ko-detail-events">
            {resultEvents.map((event, index) => <div className="ko-detail-event" key={event?.id || index}>
              <span>{event?.minute !== undefined && event?.minute !== "" ? `${event.minute}'` : "•"}</span>
              <div><b>{eventLabel(event)}</b><strong>{event?.shirtNumber || event?.number ? `#${event.shirtNumber || event.number} ` : ""}{event?.playerName || event?.player || event?.name || ""}</strong><small>{event?.team || event?.teamName || ""}</small></div>
            </div>)}
          </div>}
        </div>
      </div>}

    </div>
  );
}


