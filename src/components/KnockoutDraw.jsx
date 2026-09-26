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
  const drawLoadedRef = useRef(false);

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

  const usedTeams = useMemo(() => new Set(pairs.flat()), [pairs]);
  const availableTeams = topEight.filter((team) => !usedTeams.has(team));
  const secondOptions = availableTeams.filter((team) => team !== firstTeam);

  async function resetDraw() {
    // Yalnız eleme turunu temizle; lig maçlarına dokunma.
    const knockoutFixtures = fixtures.filter((match) => match?.isKnockout === true);
    const knockoutIds = new Set(
      knockoutFixtures.flatMap((match) => [match?.id, match?.knockoutKey].filter(Boolean).map(String))
    );
    const nextFixtures = fixtures.filter((match) => match?.isKnockout !== true);

    setPairs([]);
    setDrawId("");
    setFirstTeam("");

    // Maç Merkezi'nde seçili olan maç bir eleme maçıysa kaldır.
    const activeKey = localStorage.getItem("sscup-match-center-active") || "";
    if (knockoutIds.has(String(activeKey))) {
      localStorage.removeItem("sscup-match-center-active");
    }

    // Yalnız eleme maçlarına ait hazır kadroları temizle.
    try {
      const savedLineups = JSON.parse(localStorage.getItem("sscup-match-lineups") || "{}");
      const nextLineups = { ...savedLineups };
      knockoutIds.forEach((id) => delete nextLineups[id]);
      localStorage.setItem("sscup-match-lineups", JSON.stringify(nextLineups));
      await supabase.from("app_state").upsert({
        id: "match_lineups",
        value: nextLineups,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Eleme kadroları temizlenemedi:", error);
    }

    // Eleme maçlarını fixture listesinden çıkar ve hem yerelde hem bulutta kalıcılaştır.
    localStorage.setItem("sscup-fixtures", JSON.stringify(nextFixtures));
    if (typeof setFixtures === "function") setFixtures(nextFixtures);
    window.dispatchEvent(new CustomEvent("sscup-fixtures-updated", { detail: nextFixtures }));

    try {
      const now = new Date().toISOString();
      await Promise.all([
        supabase.from("app_state").upsert({
          id: "knockout_draw_v1",
          value: { mode, pairs: [], drawId: "" },
          updated_at: now,
        }),
        supabase.from("app_state").upsert({
          id: "knockout_match_center_v1",
          value: { activeMatch: null },
          updated_at: now,
        }),
        supabase.from("app_state").upsert({
          id: "fixtures_snapshot",
          value: nextFixtures,
          updated_at: now,
        }),
      ]);
    } catch (error) {
      console.error("Eleme sıfırlama buluta kaydedilemedi:", error);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    resetDraw();
  }

  function addManualPair(secondTeam) {
    if (!firstTeam || !secondTeam || firstTeam === secondTeam) return;
    if (usedTeams.has(firstTeam) || usedTeams.has(secondTeam)) return;
    if (!drawId) setDrawId(`draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setPairs((prev) => [...prev, [firstTeam, secondTeam]]);
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

    const currentDrawId = drawId || `draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!drawId) setDrawId(currentDrawId);
    const activeMatch = {
      id: `knockout:${currentDrawId}:quarter-${index + 1}`,
      drawId: currentDrawId,
      knockoutKey: `quarter-${index + 1}`,
      stageLabel: `Çeyrek Final ${index + 1}`,
      home: pair[0],
      away: pair[1],
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

  async function sendExistingToMatchCenter(source, fallbackKey, fallbackLabel) {
    if (!source?.home || !source?.away) return;
    const activeMatch = {
      ...source,
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

  return (
    <div className="ko-page">
      <section className="ko-hero">
        <div>
          <div className="ko-kicker">S&amp;S CUP • ELEME AŞAMASI</div>
          <h2>1/8 FİNAL KURASI</h2>
          <p>Lig sıralamasındaki ilk 8 takım otomatik olarak kura havuzuna alınır.</p>
        </div>
        <button type="button" className="ko-reset" onClick={resetDraw}>↻ ELEMELERİ SIFIRLA</button>
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
        <div className="ko-section-title"><div><span>04</span><h3>1/8 Final Eşleşmeleri</h3></div>{complete && <small className="done">KURA TAMAMLANDI ✓</small>}</div>
        <div className="ko-pairs">
          {[0,1,2,3].map((index) => {
            const pair = pairs[index];
            return <div className={pair ? "ko-pair filled" : "ko-pair"} key={index}>
              <div className="match-no">1/8 • MAÇ {index + 1}</div>
              <div className="team"><span>{pair?.[0] || "Takım bekleniyor"}</span></div>
              <div className="pair-vs">VS</div>
              <div className="team"><span>{pair?.[1] || "Rakip bekleniyor"}</span></div>
              {pair && <button type="button" className="ko-mc-button" onClick={() => sendQuarterToMatchCenter(index)}>🏟️ Maç Merkezine Al</button>}
            </div>;
          })}
        </div>
      </section>

      <section className="ko-card ko-road-card">
        <div className="ko-section-title"><div><span>05</span><h3>Yarı Final</h3></div><small>ÇF1–ÇF3 • ÇF2–ÇF4</small></div>
        <div className="ko-pairs">
          {[0,1].map((i) => { const m=semiCloud[i]; return <div className={m?.home && m?.away ? "ko-pair filled" : "ko-pair"} key={`semi-${i}`}>
            <div className="match-no">YARI FİNAL {i+1}</div><div className="team"><span>{m?.home || (i===0 ? "ÇF1 Kazananı" : "ÇF2 Kazananı")}</span></div><div className="pair-vs">VS</div><div className="team"><span>{m?.away || (i===0 ? "ÇF3 Kazananı" : "ÇF4 Kazananı")}</span></div>
            {m?.home && m?.away && m?.played !== true && <button type="button" className="ko-mc-button" onClick={() => sendExistingToMatchCenter(m, `semi-${i+1}`, `Yarı Final ${i+1}`)}>🏟️ Maç Merkezine Al</button>}
          </div>; })}
        </div>
      </section>

      <section className="ko-card ko-road-card">
        <div className="ko-section-title"><div><span>06</span><h3>Üçüncülük Maçı</h3></div></div>
        <div className="ko-pairs"><div className={thirdCloud?.home && thirdCloud?.away ? "ko-pair filled" : "ko-pair"}><div className="match-no">3.'LÜK</div><div className="team"><span>{thirdCloud?.home || "YF1 Kaybedeni"}</span></div><div className="pair-vs">VS</div><div className="team"><span>{thirdCloud?.away || "YF2 Kaybedeni"}</span></div>{thirdCloud?.home && thirdCloud?.away && thirdCloud?.played !== true && <button type="button" className="ko-mc-button" onClick={() => sendExistingToMatchCenter(thirdCloud, "third-place-0", "3.'lük Maçı")}>🏟️ Maç Merkezine Al</button>}</div></div>
      </section>

      <section className="ko-card ko-road-card">
        <div className="ko-section-title"><div><span>07</span><h3>Final</h3></div></div>
        <div className="ko-pairs"><div className={finalCloud?.home && finalCloud?.away ? "ko-pair filled" : "ko-pair"}><div className="match-no">FİNAL</div><div className="team"><span>{finalCloud?.home || "YF1 Kazananı"}</span></div><div className="pair-vs">VS</div><div className="team"><span>{finalCloud?.away || "YF2 Kazananı"}</span></div>{finalCloud?.home && finalCloud?.away && finalCloud?.played !== true && <button type="button" className="ko-mc-button" onClick={() => sendExistingToMatchCenter(finalCloud, "final-0", "Final")}>🏟️ Maç Merkezine Al</button>}</div></div>
      </section>
    </div>
  );
}
