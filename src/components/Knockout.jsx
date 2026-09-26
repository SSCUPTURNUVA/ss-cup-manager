import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CompletedMatches from "./CompletedMatches";
import { supabase } from "../supabase";

function createEmptyQuarter() {
  return Array.from({ length: 4 }, () => ({
    id: Date.now() + Math.floor(Math.random() * 10000),
    home: "",
    away: "",
    homeScore: "",
    awayScore: "",
    homePen: "",
    awayPen: "",
    date: "",
    time: "",
    field: "Saha 1",
  }));
}

function createEmptySemi() {
  return Array.from({ length: 2 }, () => ({
    id: Date.now() + Math.floor(Math.random() * 10000),
    homeScore: "",
    awayScore: "",
    homePen: "",
    awayPen: "",
    date: "",
    time: "",
    field: "Saha 1",
  }));
}

function createEmptyFinal() {
  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    homeScore: "",
    awayScore: "",
    homePen: "",
    awayPen: "",
    date: "",
    time: "",
    field: "Saha 1",
  };
}

function safeReadStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export default function Knockout({
  fixtures = [],
  setFixtures,
  onOpenMatchCenter,
}) {
  const [quarter, setQuarter] = useState(() =>
    safeReadStorage("sscup-quarter", createEmptyQuarter())
  );

  const [semi, setSemi] = useState(() =>
    safeReadStorage("sscup-semi", createEmptySemi())
  );

  const [finalMatch, setFinalMatch] = useState(() =>
    safeReadStorage("sscup-final", createEmptyFinal())
  );

  const [thirdPlace, setThirdPlace] = useState(() =>
    safeReadStorage("sscup-third-place", createEmptyFinal())
  );

  const [leagueFixtures, setLeagueFixtures] = useState(() =>
    safeReadStorage("sscup-fixtures", [])
  );

  useEffect(() => {
    const currentLeague = (fixtures || []).filter((match) => match?.isKnockout !== true);
    if (currentLeague.length > 0) setLeagueFixtures(currentLeague);
  }, [fixtures]);

  const [drawPotOne, setDrawPotOne] = useState(() =>
    safeReadStorage("sscup-quarter-pot-one", [])
  );

  const [drawPotTwo, setDrawPotTwo] = useState(() =>
    safeReadStorage("sscup-quarter-pot-two", [])
  );

  const [drawStarted, setDrawStarted] = useState(() =>
    safeReadStorage("sscup-quarter-draw-started", false)
  );

  const [quarterMode, setQuarterMode] = useState(() =>
    safeReadStorage("sscup-quarter-mode", "draw")
  );

  const [isDrawing, setIsDrawing] = useState(false);
  const [lastDrawnMatch, setLastDrawnMatch] = useState(null);
  const [cloudReady, setCloudReady] = useState(false);
  const cloudWriteLockRef = useRef(false);
  const matchCenterStartLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCloudState() {
      const { data, error } = await supabase
        .from("app_state")
        .select("value")
        .eq("id", "knockout")
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Eleme bulut verisi yüklenemedi:", error);
        setCloudReady(true);
        return;
      }

      const value = data?.value;
      if (value && typeof value === "object") {
        if (Array.isArray(value.quarter)) setQuarter(value.quarter);
        if (Array.isArray(value.semi)) setSemi(value.semi);
        if (value.finalMatch) setFinalMatch(value.finalMatch);
        if (value.thirdPlace) setThirdPlace(value.thirdPlace);
        if (Array.isArray(value.drawPotOne)) setDrawPotOne(value.drawPotOne);
        if (Array.isArray(value.drawPotTwo)) setDrawPotTwo(value.drawPotTwo);
        if (typeof value.drawStarted === "boolean") setDrawStarted(value.drawStarted);
        if (["draw", "ranking", "free", "manual"].includes(value.quarterMode)) setQuarterMode(value.quarterMode);
      }

      setCloudReady(true);
    }

    loadCloudState();

    const channel = supabase
      .channel("sscup-knockout-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout" },
        (payload) => {
          if (cloudWriteLockRef.current) return;
          const value = payload.new?.value;
          if (!value || typeof value !== "object") return;
          const preserveRunningRuntime = (current, incoming) => {
            if (!incoming) return current;
            const phase = current?.matchPhase || "waiting";
            const running = current?.played !== true && current?.live === true &&
              ["first_half", "halftime", "second_half", "penalty"].includes(phase);
            const incomingPhase = incoming?.matchPhase || "waiting";
            const incomingWouldReset = running && (incoming?.live !== true || incomingPhase === "waiting");
            if (!incomingWouldReset) return incoming;
            return {
              ...incoming,
              live: current.live,
              matchPhase: current.matchPhase,
              timerRunning: current.timerRunning,
              timerStartedAt: current.timerStartedAt,
              elapsedSeconds: current.elapsedSeconds,
              homeScore: current.homeScore,
              awayScore: current.awayScore,
              events: Array.isArray(current.events) ? current.events : [],
              goals: Array.isArray(current.goals) ? current.goals : [],
              deletedEventIds: Array.isArray(current.deletedEventIds) ? current.deletedEventIds : [],
            };
          };
          // Manuel kura sırasında gecikmiş realtime snapshot'ı kullanıcının yeni
          // seçimini geri silemez. Manuel quarter/pot cihazda önceliklidir.
          const incomingMode = value.quarterMode;
          const manualSelectionActive = incomingMode === "manual";
          if (!manualSelectionActive && Array.isArray(value.quarter)) setQuarter((current) =>
            value.quarter.map((incoming, i) => preserveRunningRuntime(current?.[i], incoming))
          );
          if (Array.isArray(value.semi)) setSemi((current) =>
            value.semi.map((incoming, i) => preserveRunningRuntime(current?.[i], incoming))
          );
          if (value.finalMatch) setFinalMatch((current) => preserveRunningRuntime(current, value.finalMatch));
          if (value.thirdPlace) setThirdPlace((current) => preserveRunningRuntime(current, value.thirdPlace));
          if (!manualSelectionActive && Array.isArray(value.drawPotOne)) setDrawPotOne(value.drawPotOne);
          if (!manualSelectionActive && Array.isArray(value.drawPotTwo)) setDrawPotTwo(value.drawPotTwo);
          if (typeof value.drawStarted === "boolean") setDrawStarted(value.drawStarted);
          if (["draw", "ranking", "free", "manual"].includes(value.quarterMode)) setQuarterMode(value.quarterMode);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!cloudReady) return;

    const timeout = window.setTimeout(async () => {
      const value = {
        quarter,
        semi,
        finalMatch,
        thirdPlace,
        drawPotOne,
        drawPotTwo,
        drawStarted,
        quarterMode,
      };

      const { error } = await supabase
        .from("app_state")
        .upsert({ id: "knockout", value, updated_at: new Date().toISOString() });

      if (error) {
        console.error("Eleme bulut verisi kaydedilemedi:", error);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [cloudReady, quarter, semi, finalMatch, thirdPlace, drawPotOne, drawPotTwo, drawStarted, quarterMode]);

  useEffect(() => {
    localStorage.setItem("sscup-quarter", JSON.stringify(quarter));
  }, [quarter]);

  useEffect(() => {
    localStorage.setItem("sscup-semi", JSON.stringify(semi));
  }, [semi]);

  useEffect(() => {
    localStorage.setItem("sscup-final", JSON.stringify(finalMatch));
  }, [finalMatch]);

  useEffect(() => {
    localStorage.setItem("sscup-third-place", JSON.stringify(thirdPlace));
  }, [thirdPlace]);

  useEffect(() => {
    localStorage.setItem("sscup-quarter-pot-one", JSON.stringify(drawPotOne));
  }, [drawPotOne]);

  useEffect(() => {
    localStorage.setItem("sscup-quarter-pot-two", JSON.stringify(drawPotTwo));
  }, [drawPotTwo]);

  useEffect(() => {
    localStorage.setItem("sscup-quarter-draw-started", JSON.stringify(drawStarted));
  }, [drawStarted]);

  useEffect(() => {
    localStorage.setItem("sscup-quarter-mode", JSON.stringify(quarterMode));
  }, [quarterMode]);

  useEffect(() => {
    // Manuel kura sırasında quarter state'inin tek sahibi manuel seçim ekranıdır.
    // Eski knockout fixture'ları seçimi geri ezmesin / mobil select'i gecikmeli değiştirmesin.
    if (quarterMode === "manual") return;

    const knockoutMatches = fixtures.filter(
      (match) => match?.isKnockout === true
    );

    if (knockoutMatches.length === 0) return;

    function syncMatch(currentMatch, storedMatch) {
      if (!storedMatch) return currentMatch;

      const nextMatch = {
        ...currentMatch,
        // Eleme kimlikleri "knockout:semi-0" gibi metindir. Number() kullanmak
        // kimliği NaN yaparak aynı maçın tekrar canlı açılmasına yol açıyordu.
        id: storedMatch.id ?? currentMatch.id,
        homeScore: storedMatch.homeScore ?? currentMatch.homeScore,
        awayScore: storedMatch.awayScore ?? currentMatch.awayScore,
        homePen: storedMatch.homePen ?? currentMatch.homePen,
        awayPen: storedMatch.awayPen ?? currentMatch.awayPen,
        date: storedMatch.date ?? currentMatch.date,
        time: storedMatch.time ?? currentMatch.time,
        field: storedMatch.field ?? storedMatch.pitch ?? currentMatch.field,
        played: storedMatch.played === true,
        live: storedMatch.live === true,
        matchPhase: storedMatch.matchPhase ?? currentMatch.matchPhase ?? "waiting",
        timerRunning: storedMatch.timerRunning === true,
        timerStartedAt: storedMatch.timerStartedAt ?? null,
        elapsedSeconds: storedMatch.elapsedSeconds ?? currentMatch.elapsedSeconds ?? 0,
        events: Array.isArray(storedMatch.events)
          ? storedMatch.events
          : currentMatch.events || [],
      };

      return JSON.stringify(nextMatch) === JSON.stringify(currentMatch)
        ? currentMatch
        : nextMatch;
    }

    setQuarter((current) =>
      current.map((match, index) =>
        syncMatch(
          match,
          knockoutMatches.find(
            (item) => item.knockoutKey === `quarter-${index}`
          )
        )
      )
    );

    setSemi((current) =>
      current.map((match, index) =>
        syncMatch(
          match,
          knockoutMatches.find(
            (item) => item.knockoutKey === `semi-${index}`
          )
        )
      )
    );

    setFinalMatch((current) =>
      syncMatch(
        current,
        knockoutMatches.find(
          (item) => item.knockoutKey === "final-0"
        )
      )
    );

    setThirdPlace((current) =>
      syncMatch(
        current,
        knockoutMatches.find(
          (item) => item.knockoutKey === "third-place-0"
        )
      )
    );
  }, [fixtures, quarterMode]);

  const standings = useMemo(() => {
    const table = {};

    leagueFixtures.forEach((match) => {
      const homeTeam = match.home;
      const awayTeam = match.away;

      if (homeTeam && !table[homeTeam]) {
        table[homeTeam] = {
          team: homeTeam,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
        };
      }

      if (awayTeam && !table[awayTeam]) {
        table[awayTeam] = {
          team: awayTeam,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
        };
      }

      if (match.played !== true || !homeTeam || !awayTeam) {
        return;
      }

      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);

      if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
        return;
      }

      table[homeTeam].played += 1;
      table[awayTeam].played += 1;
      table[homeTeam].goalsFor += homeScore;
      table[homeTeam].goalsAgainst += awayScore;
      table[awayTeam].goalsFor += awayScore;
      table[awayTeam].goalsAgainst += homeScore;

      if (homeScore > awayScore) {
        table[homeTeam].won += 1;
        table[homeTeam].points += 3;
        table[awayTeam].lost += 1;
      } else if (awayScore > homeScore) {
        table[awayTeam].won += 1;
        table[awayTeam].points += 3;
        table[homeTeam].lost += 1;
      } else {
        table[homeTeam].drawn += 1;
        table[awayTeam].drawn += 1;
        table[homeTeam].points += 1;
        table[awayTeam].points += 1;
      }
    });

    return Object.values(table)
      .map((team) => ({
        ...team,
        goalDifference: team.goalsFor - team.goalsAgainst,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.team.localeCompare(b.team, "tr");
      });
  }, [leagueFixtures]);

  const topEight = standings.slice(0, 8);
  const firstPot = topEight.slice(0, 4);
  const secondPot = topEight.slice(4, 8);

  // Tur tebrik mesajlari: bir etap tamamen bittiginde bir sonraki etaba
  // katilacak takimlar icin yonetimde WhatsApp butonlari acilir.
  const leagueMatches = leagueFixtures.filter((match) => match?.isKnockout !== true && match?.home && match?.away);
  const leagueFinished = leagueMatches.length > 0 && leagueMatches.every((match) => match.played === true);
  const quarterFinished = quarter.length === 4 && quarter.every((match) => match?.home && match?.away && match?.played === true);
  const semiFinished = semi.length === 2 && semi.every((match) => match?.played === true);

  const [teamContacts, setTeamContacts] = useState(() => safeReadStorage("sscup-team-contacts", {}));

  useEffect(() => {
    let cancelled = false;
    async function loadTeamContacts() {
      const { data, error } = await supabase.from("app_state").select("value").eq("id", "team_contacts").maybeSingle();
      if (cancelled || error) return;
      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        setTeamContacts(data.value);
        localStorage.setItem("sscup-team-contacts", JSON.stringify(data.value));
      }
    }
    loadTeamContacts();
    const channel = supabase.channel(`sscup-knockout-contacts-${Math.random().toString(36).slice(2)}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_state", filter: "id=eq.team_contacts" },
      (payload) => {
        const value = payload?.new?.value;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          setTeamContacts(value);
          localStorage.setItem("sscup-team-contacts", JSON.stringify(value));
        }
      }
    ).subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  function normalizeWhatsappPhone(phone) {
    const clean = String(phone || "").replace(/\D/g, "");
    if (!clean) return "";
    if (clean.startsWith("90")) return clean;
    return `90${clean.replace(/^0/, "")}`;
  }

  function buildStageMessage(stage, teamName) {
    const messages = {
      quarter: `🏆 *TEBRİKLER!*\n\n${teamName} göstermiş olduğu mücadele ve başarılı performans sonucunda *S&S CUP ÇEYREK FİNAL* etabına yükselmeye hak kazanmıştır. ⚽🔥\n\nBu güzel başarıdan dolayı takımınızı, oyuncularınızı ve emeği geçen herkesi tebrik ediyor; çeyrek final mücadelenizde başarılar diliyoruz.\n\n*S&S CUP Organizasyon*\n*Serkan Toy & Soner Özkan*`,
      semi: `🏆 *TEBRİKLER, YARI FİNALDESİNİZ!*\n\n${teamName}, S&S CUP'taki başarılı mücadelesini sürdürerek *YARI FİNAL* etabına yükselmeye hak kazanmıştır. ⚽🔥\n\nArtık finale sadece *bir adım* kaldı!\n\nTakımınızı ve tüm oyuncularınızı tebrik ediyor, yarı final mücadelenizde başarılar diliyoruz.\n\n*S&S CUP Organizasyon*\n*Serkan Toy & Soner Özkan*`,
      final: `🏆 *TEBRİKLER, FİNALDESİNİZ!*\n\nBüyük mücadele, büyük emek ve artık *BÜYÜK FİNAL!* 🔥🏆\n\n${teamName}, S&S CUP'ta finale yükselerek şampiyonluk mücadelesi vermeye hak kazanmıştır.\n\nTurnuva boyunca göstermiş olduğunuz mücadeleden dolayı takımınızı ve tüm oyuncularınızı tebrik ediyoruz.\n\nŞimdi sırada son maç, son mücadele ve *S&S CUP ŞAMPİYONLUĞU* var! 🏆⚽\n\nFinalde başarılar diliyoruz.\n\n*S&S CUP Organizasyon*\n*Serkan Toy & Soner Özkan*`,
      third: `🏆 *S&S CUP 3.'LÜK MAÇI*\n\n${teamName}, turnuva boyunca göstermiş olduğu mücadeleyle *3.'LÜK MAÇI* oynamaya hak kazanmıştır. ⚽🔥\n\nTakımınızı ve tüm oyuncularınızı tebrik ediyor, S&S CUP üçüncülük mücadelesinde başarılar diliyoruz.\n\n*S&S CUP Organizasyon*\n*Serkan Toy & Soner Özkan*`,
    };
    return messages[stage] || "";
  }

  function sendStageWhatsapp(teamName, stage, managerKey) {
    const info = teamContacts?.[teamName] || {};
    const phone = normalizeWhatsappPhone(info[managerKey === "manager2" ? "phone2" : "phone1"]);
    if (!phone) { alert("Bu sorumlu için telefon numarası kayıtlı değil."); return; }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildStageMessage(stage, teamName))}`, "_blank", "noopener,noreferrer");
  }

  function StageMessagePanel({ title, stage, teams, ready, waitingText }) {
    const cleanTeams = [...new Set((teams || []).filter((name) => name && name !== "PENALTY_WAIT"))];
    return (
      <div style={{ margin: "18px 0", padding: "18px", borderRadius: "16px", background: ready ? "linear-gradient(135deg,#102518,#173b24)" : "#151922", border: ready ? "1px solid #2f7d48" : "1px solid #303746", color: "white" }}>
        <div style={{ fontWeight: 900, fontSize: "17px", marginBottom: "6px" }}>{title}</div>
        {!ready ? <div style={{ opacity: .72, fontSize: "13px" }}>🔒 {waitingText}</div> : cleanTeams.length === 0 ? <div style={{ opacity: .72 }}>Takımlar henüz belirlenmedi.</div> : (
          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
            {cleanTeams.map((teamName) => {
              const info = teamContacts?.[teamName] || {};
              return <div key={`${stage}-${teamName}`} style={{ padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,.06)", display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <strong>{teamName}</strong>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" disabled={!normalizeWhatsappPhone(info.phone1)} onClick={() => sendStageWhatsapp(teamName, stage, "manager1")}>📲 {info.manager1 || "Sorumlu 1"}</button>
                  <button type="button" disabled={!normalizeWhatsappPhone(info.phone2)} onClick={() => sendStageWhatsapp(teamName, stage, "manager2")}>📲 {info.manager2 || "Sorumlu 2"}</button>
                </div>
              </div>;
            })}
          </div>
        )}
      </div>
    );
  }

  const completedQuarterMatches = quarter.filter(
    (match) => match.home && match.away
  ).length;

  const drawCompleted = completedQuarterMatches === 4;

  function refreshLeagueStandings() {
    const fixturesData = safeReadStorage("sscup-fixtures", []);
    setLeagueFixtures(fixturesData);
    alert("Lig sıralaması güncellendi.");
  }

  async function prepareQuarterDraw() {
    if (isDrawing) return;

    const latestFixtures = safeReadStorage("sscup-fixtures", []);
    setLeagueFixtures(latestFixtures);

    const table = {};
    latestFixtures.forEach((match) => {
      const homeTeam = match.home;
      const awayTeam = match.away;

      if (homeTeam && !table[homeTeam]) {
        table[homeTeam] = { team: homeTeam, played: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
      }
      if (awayTeam && !table[awayTeam]) {
        table[awayTeam] = { team: awayTeam, played: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
      }

      if (match.played !== true || !homeTeam || !awayTeam) return;

      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);
      if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return;

      table[homeTeam].played += 1;
      table[awayTeam].played += 1;
      table[homeTeam].goalsFor += homeScore;
      table[homeTeam].goalsAgainst += awayScore;
      table[awayTeam].goalsFor += awayScore;
      table[awayTeam].goalsAgainst += homeScore;

      if (homeScore > awayScore) table[homeTeam].points += 3;
      else if (awayScore > homeScore) table[awayTeam].points += 3;
      else {
        table[homeTeam].points += 1;
        table[awayTeam].points += 1;
      }
    });

    const latestTopEight = Object.values(table)
      .map((team) => ({
        ...team,
        goalDifference: team.goalsFor - team.goalsAgainst,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.team.localeCompare(b.team, "tr");
      })
      .slice(0, 8);

    if (latestTopEight.length < 8) {
      alert("Çeyrek final kurası için puan durumunda en az 8 takım bulunmalıdır.");
      return;
    }

    if (drawStarted || completedQuarterMatches > 0) {
      const confirmed = window.confirm(
        "Mevcut çeyrek final kurası, skorlar ve sonraki turlar silinip yeniden hazırlanacak. Devam edilsin mi?"
      );
      if (!confirmed) return;
    }

    setIsDrawing(true);
    cloudWriteLockRef.current = true;

    const nextPotOne = shuffleArray(latestTopEight.slice(0, 4).map((team) => team.team));
    const nextPotTwo = shuffleArray(latestTopEight.slice(4, 8).map((team) => team.team));
    const nextQuarter = createEmptyQuarter();
    const nextSemi = createEmptySemi();
    const nextFinal = createEmptyFinal();
    const nextThirdPlace = createEmptyFinal();

    const value = {
      quarter: nextQuarter,
      semi: nextSemi,
      finalMatch: nextFinal,
      thirdPlace: nextThirdPlace,
      drawPotOne: nextPotOne,
      drawPotTwo: nextPotTwo,
      drawStarted: true,
      quarterMode: "draw",
    };

    try {
      const { error } = await supabase
        .from("app_state")
        .upsert({ id: "knockout", value, updated_at: new Date().toISOString() });

      if (error) throw error;

      const remainingFixtures = fixtures.filter((match) => match?.isKnockout !== true);
      if (typeof setFixtures === "function") setFixtures(remainingFixtures);
      localStorage.setItem("sscup-fixtures", JSON.stringify(remainingFixtures));

      setDrawPotOne(nextPotOne);
      setDrawPotTwo(nextPotTwo);
      setQuarter(nextQuarter);
      setSemi(nextSemi);
      setFinalMatch(nextFinal);
      setThirdPlace(nextThirdPlace);
      setDrawStarted(true);
      setQuarterMode("draw");
      setLastDrawnMatch(null);

      alert("Çeyrek final torbaları hazırlandı. Şimdi eşleşmeleri tek tuşla çekebilirsiniz.");
    } catch (error) {
      console.error("Torbalar hazırlanamadı:", error);
      alert("Torbalar kaydedilemedi. İnternet bağlantısını kontrol edip tekrar deneyin.");
    } finally {
      window.setTimeout(() => {
        cloudWriteLockRef.current = false;
        setIsDrawing(false);
      }, 700);
    }
  }

  async function prepareFreeQuarterDraw() {
    if (isDrawing) return;

    const latestFixtures = safeReadStorage("sscup-fixtures", []);
    setLeagueFixtures(latestFixtures);
    const table = {};
    latestFixtures.forEach((match) => {
      const homeTeam = match.home; const awayTeam = match.away;
      if (homeTeam && !table[homeTeam]) table[homeTeam] = { team: homeTeam, goalsFor: 0, goalsAgainst: 0, points: 0 };
      if (awayTeam && !table[awayTeam]) table[awayTeam] = { team: awayTeam, goalsFor: 0, goalsAgainst: 0, points: 0 };
      if (match.played !== true || !homeTeam || !awayTeam) return;
      const hs = Number(match.homeScore); const as = Number(match.awayScore);
      if (!Number.isInteger(hs) || !Number.isInteger(as)) return;
      table[homeTeam].goalsFor += hs; table[homeTeam].goalsAgainst += as;
      table[awayTeam].goalsFor += as; table[awayTeam].goalsAgainst += hs;
      if (hs > as) table[homeTeam].points += 3; else if (as > hs) table[awayTeam].points += 3; else { table[homeTeam].points += 1; table[awayTeam].points += 1; }
    });
    const ranked = Object.values(table).map((t) => ({ ...t, goalDifference: t.goalsFor - t.goalsAgainst }))
      .sort((a,b) => b.points-a.points || b.goalDifference-a.goalDifference || b.goalsFor-a.goalsFor || a.team.localeCompare(b.team,"tr"))
      .slice(0,8);
    if (ranked.length < 8) { alert("Serbest kura için lig sıralamasında ilk 8 takım oluşmalıdır."); return; }
    if (drawStarted || completedQuarterMatches > 0) {
      if (!window.confirm("Mevcut çeyrek final kurası, skorlar ve sonraki turlar silinip SERBEST KURA hazırlanacak. Devam edilsin mi?")) return;
    }
    setIsDrawing(true); cloudWriteLockRef.current = true;
    const allTeams = shuffleArray(ranked.map((team) => team.team));
    const nextQuarter = createEmptyQuarter(); const nextSemi = createEmptySemi(); const nextFinal = createEmptyFinal(); const nextThirdPlace = createEmptyFinal();
    const value = { quarter: nextQuarter, semi: nextSemi, finalMatch: nextFinal, thirdPlace: nextThirdPlace, drawPotOne: allTeams, drawPotTwo: [], drawStarted: true, quarterMode: "free" };
    try {
      const { error } = await supabase.from("app_state").upsert({ id: "knockout", value, updated_at: new Date().toISOString() });
      if (error) throw error;
      const remainingFixtures = fixtures.filter((match) => match?.isKnockout !== true);
      if (typeof setFixtures === "function") setFixtures(remainingFixtures);
      localStorage.setItem("sscup-fixtures", JSON.stringify(remainingFixtures));
      setQuarter(nextQuarter); setSemi(nextSemi); setFinalMatch(nextFinal); setThirdPlace(nextThirdPlace);
      setDrawPotOne(allTeams); setDrawPotTwo([]); setDrawStarted(true); setQuarterMode("free"); setLastDrawnMatch(null);
      alert("🔥 SERBEST KURA hazır! İlk 8 tek torbada. Şimdi TAKIM ÇEK butonuna her basışta bir takım yerleşecek.");
    } catch (error) { console.error("Serbest kura hazırlanamadı:", error); alert("Serbest kura kaydedilemedi. İnternet bağlantısını kontrol edin."); }
    finally { window.setTimeout(() => { cloudWriteLockRef.current = false; setIsDrawing(false); }, 700); }
  }

  async function drawNextFreeTeam() {
    if (!drawStarted || quarterMode !== "free") return;
    if (isDrawing || drawPotOne.length === 0) return;
    const filled = quarter.reduce((count, match) => count + (match.home ? 1 : 0) + (match.away ? 1 : 0), 0);
    if (filled >= 8) { alert("Çeyrek final serbest kurası tamamlandı."); return; }
    // İlk 4 çekiliş ÇF1-2-3-4'ün ilk takımını, sonraki 4 çekiliş rakiplerini doldurur.
    const slotIndex = filled < 4 ? filled : filled - 4;
    const field = filled < 4 ? "home" : "away";
    const team = drawPotOne[0];
    const nextQuarter = quarter.map((match, index) => index === slotIndex ? { ...match, [field]: team, homeScore: "", awayScore: "", homePen: "", awayPen: "" } : { ...match });
    const nextPot = drawPotOne.slice(1);
    setIsDrawing(true); cloudWriteLockRef.current = true;
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      const value = { quarter: nextQuarter, semi, finalMatch, thirdPlace, drawPotOne: nextPot, drawPotTwo: [], drawStarted: true, quarterMode: "free" };
      const { error } = await supabase.from("app_state").upsert({ id: "knockout", value, updated_at: new Date().toISOString() });
      if (error) throw error;
      setQuarter(nextQuarter); setDrawPotOne(nextPot);
      setLastDrawnMatch({ number: slotIndex + 1, home: field === "home" ? team : nextQuarter[slotIndex].home, away: field === "away" ? team : "", drawnTeam: team, slot: `ÇEYREK FİNAL ${slotIndex + 1}`, role: field === "home" ? "İLK TAKIM" : "RAKİP" });
    } catch (error) { console.error("Serbest kura çekimi kaydedilemedi:", error); alert("Takım çekimi kaydedilemedi. Tekrar deneyin."); }
    finally { window.setTimeout(() => { cloudWriteLockRef.current = false; setIsDrawing(false); }, 500); }
  }

  async function prepareManualQuarter() {
    if (isDrawing) return;
    const teams = topEight.map((team) => team.team).filter(Boolean);
    if (teams.length < 8) { alert("Manuel kura için ilk 8 takım oluşmalıdır."); return; }
    if (drawStarted || completedQuarterMatches > 0) {
      if (!window.confirm("Mevcut çeyrek final kurası, skorlar ve sonraki turlar silinip MANUEL KURA hazırlanacak. Devam edilsin mi?")) return;
    }
    setIsDrawing(true); cloudWriteLockRef.current = true;
    const nextQuarter = createEmptyQuarter();
    const nextSemi = createEmptySemi();
    const nextFinal = createEmptyFinal();
    const nextThirdPlace = createEmptyFinal();
    const value = { quarter: nextQuarter, semi: nextSemi, finalMatch: nextFinal, thirdPlace: nextThirdPlace, drawPotOne: teams, drawPotTwo: [], drawStarted: true, quarterMode: "manual" };
    try {
      const { error } = await supabase.from("app_state").upsert({ id: "knockout", value, updated_at: new Date().toISOString() });
      if (error) throw error;
      const remainingFixtures = fixtures.filter((match) => match?.isKnockout !== true);
      if (typeof setFixtures === "function") setFixtures(remainingFixtures);
      localStorage.setItem("sscup-fixtures", JSON.stringify(remainingFixtures));
      // Eski eleme maçına ait kadro seçimini yeni kuraya taşımıyoruz.
      try {
        const allLineups = JSON.parse(localStorage.getItem("sscup-match-lineups") || "{}");
        const clean = Object.fromEntries(Object.entries(allLineups).filter(([key]) => !String(key).startsWith("knockout:")));
        localStorage.setItem("sscup-match-lineups", JSON.stringify(clean));
        await supabase.from("app_state").upsert({ id: "match_lineups", value: clean, updated_at: new Date().toISOString() });
      } catch {}
      setQuarter(nextQuarter); setSemi(nextSemi); setFinalMatch(nextFinal); setThirdPlace(nextThirdPlace);
      setDrawPotOne(teams); setDrawPotTwo([]); setDrawStarted(true); setQuarterMode("manual"); setLastDrawnMatch(null);
    } catch (error) { console.error("Manuel kura hazırlanamadı:", error); alert("Manuel kura kaydedilemedi. İnternet bağlantısını kontrol edin."); }
    finally { window.setTimeout(() => { cloudWriteLockRef.current = false; setIsDrawing(false); }, 500); }
  }

  async function setManualQuarterTeam(matchIndex, field, team) {
    if (quarterMode !== "manual" || !drawStarted || isDrawing) return;
    const usedElsewhere = quarter.some((m, i) => i !== matchIndex && (m.home === team || m.away === team));
    const sameMatchOther = field === "home" ? quarter[matchIndex]?.away : quarter[matchIndex]?.home;
    if (team && (usedElsewhere || sameMatchOther === team)) { alert("Bu takım zaten kurada seçildi."); return; }
    const nextQuarter = quarter.map((m, i) => i === matchIndex ? { ...m, [field]: team, homeScore: "", awayScore: "", homePen: "", awayPen: "", played: false, live: false, matchPhase: "waiting", timerRunning: false, timerStartedAt: null, elapsedSeconds: 0, events: [] } : m);
    const used = new Set(nextQuarter.flatMap(m => [m.home, m.away]).filter(Boolean));
    const remaining = topEight.map(t => t.team).filter(name => name && !used.has(name));
    // Manuel kura hazırlanırken yarı/final zaten sıfırlandı.
    // Her takım dokunuşunda bütün eleme ağacını yeniden yaratmak mobilde render +
    // fixture + realtime zincirini tetikliyordu. Burada yalnız değişen iki state'i güncelle.
    setQuarter(nextQuarter);
    setDrawPotOne(remaining);

    // Üstteki merkezi 250ms debounce bulut kaydı bu state'i zaten kalıcı yazar.
    // Burada ikinci bir Supabase upsert yapmıyoruz; tek dokunuş = tek state değişimi.
    cloudWriteLockRef.current = true;
    window.setTimeout(() => { cloudWriteLockRef.current = false; }, 350);
  }

  async function prepareRankedQuarter() {
    if (isDrawing) return;

    const latestFixtures = safeReadStorage("sscup-fixtures", []);
    setLeagueFixtures(latestFixtures);

    const table = {};
    latestFixtures.forEach((match) => {
      const homeTeam = match.home;
      const awayTeam = match.away;
      if (homeTeam && !table[homeTeam]) table[homeTeam] = { team: homeTeam, goalsFor: 0, goalsAgainst: 0, points: 0 };
      if (awayTeam && !table[awayTeam]) table[awayTeam] = { team: awayTeam, goalsFor: 0, goalsAgainst: 0, points: 0 };
      if (match.played !== true || !homeTeam || !awayTeam) return;
      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);
      if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return;
      table[homeTeam].goalsFor += homeScore;
      table[homeTeam].goalsAgainst += awayScore;
      table[awayTeam].goalsFor += awayScore;
      table[awayTeam].goalsAgainst += homeScore;
      if (homeScore > awayScore) table[homeTeam].points += 3;
      else if (awayScore > homeScore) table[awayTeam].points += 3;
      else { table[homeTeam].points += 1; table[awayTeam].points += 1; }
    });

    const ranked = Object.values(table).map((team) => ({ ...team, goalDifference: team.goalsFor - team.goalsAgainst }))
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team, "tr"))
      .slice(0, 8);

    if (ranked.length < 8) {
      alert("Sıralamaya göre çeyrek final için puan durumunda en az 8 takım bulunmalıdır.");
      return;
    }

    if (drawStarted || completedQuarterMatches > 0) {
      const confirmed = window.confirm("Mevcut çeyrek final eşleşmeleri, skorlar ve sonraki turlar silinip 1-8 / 2-7 / 3-6 / 4-5 olarak hazırlanacak. Devam edilsin mi?");
      if (!confirmed) return;
    }

    setIsDrawing(true);
    cloudWriteLockRef.current = true;
    const pairs = [[0,7],[1,6],[2,5],[3,4]];
    const nextQuarter = createEmptyQuarter().map((match, index) => ({ ...match, home: ranked[pairs[index][0]].team, away: ranked[pairs[index][1]].team }));
    const nextSemi = createEmptySemi();
    const nextFinal = createEmptyFinal();
    const nextThirdPlace = createEmptyFinal();
    const value = { quarter: nextQuarter, semi: nextSemi, finalMatch: nextFinal, thirdPlace: nextThirdPlace, drawPotOne: [], drawPotTwo: [], drawStarted: true, quarterMode: "ranking" };

    try {
      const { error } = await supabase.from("app_state").upsert({ id: "knockout", value, updated_at: new Date().toISOString() });
      if (error) throw error;
      const remainingFixtures = fixtures.filter((match) => match?.isKnockout !== true);
      if (typeof setFixtures === "function") setFixtures(remainingFixtures);
      localStorage.setItem("sscup-fixtures", JSON.stringify(remainingFixtures));
      setQuarter(nextQuarter); setSemi(nextSemi); setFinalMatch(nextFinal); setThirdPlace(nextThirdPlace);
      setDrawPotOne([]); setDrawPotTwo([]); setDrawStarted(true); setQuarterMode("ranking"); setLastDrawnMatch(null);
      alert("Çeyrek final sıralamaya göre hazırlandı: 1-8 / 2-7 / 3-6 / 4-5.");
    } catch (error) {
      console.error("Sıralamalı çeyrek final kaydedilemedi:", error);
      alert("Eşleşmeler kaydedilemedi. İnternet bağlantısını kontrol edip tekrar deneyin.");
    } finally {
      window.setTimeout(() => { cloudWriteLockRef.current = false; setIsDrawing(false); }, 700);
    }
  }

  async function drawNextQuarterMatch() {
    if (!drawStarted) {
      alert("Önce çeyrek final torbalarını hazırlayın.");
      return;
    }
    if (isDrawing) return;
    cloudWriteLockRef.current = true;

    if (drawPotOne.length === 0 || drawPotTwo.length === 0) {
      cloudWriteLockRef.current = false;
      alert("Çeyrek final kurası tamamlandı.");
      return;
    }

    setIsDrawing(true);
    setLastDrawnMatch(null);

    try {
      const availableSlots = quarter
        .map((match, index) => ({ match, index }))
        .filter(({ match }) => !match.home || !match.away);

      const drawCount = Math.min(
        availableSlots.length,
        drawPotOne.length,
        drawPotTwo.length
      );

      const nextQuarter = quarter.map((match) => ({ ...match }));
      const drawnMatches = [];

      for (let offset = 0; offset < drawCount; offset += 1) {
        const matchIndex = availableSlots[offset].index;
        const firstTeam = drawPotOne[offset];
        const secondTeam = drawPotTwo[offset];

        nextQuarter[matchIndex] = {
          ...nextQuarter[matchIndex],
          home: firstTeam,
          away: secondTeam,
          homeScore: "",
          awayScore: "",
          homePen: "",
          awayPen: "",
        };

        drawnMatches.push({
          number: matchIndex + 1,
          home: firstTeam,
          away: secondTeam,
        });
      }

      const nextPotOne = drawPotOne.slice(drawCount);
      const nextPotTwo = drawPotTwo.slice(drawCount);

      await new Promise((resolve) => window.setTimeout(resolve, 900));

      const value = {
        quarter: nextQuarter,
        semi,
        finalMatch,
        thirdPlace,
        drawPotOne: nextPotOne,
        drawPotTwo: nextPotTwo,
        drawStarted: true,
        quarterMode: "draw",
      };

      const { error } = await supabase
        .from("app_state")
        .upsert({ id: "knockout", value, updated_at: new Date().toISOString() });

      if (error) throw error;

      setQuarter(nextQuarter);
      setDrawPotOne(nextPotOne);
      setDrawPotTwo(nextPotTwo);
      setLastDrawnMatch(drawnMatches.at(-1) || null);
    } catch (error) {
      console.error("Kura eşleşmeleri kaydedilemedi:", error);
      alert("Kura kaydedilemedi. İnternet bağlantısını kontrol edip tekrar deneyin.");
    } finally {
      window.setTimeout(() => {
        cloudWriteLockRef.current = false;
        setIsDrawing(false);
      }, 700);
    }
  }

  function updateQuarter(index, field, value) {
    setQuarter((current) =>
      current.map((match, matchIndex) =>
        matchIndex === index ? { ...match, [field]: value } : match
      )
    );
  }

  function updateSemi(index, field, value) {
    setSemi((current) =>
      current.map((match, matchIndex) =>
        matchIndex === index ? { ...match, [field]: value } : match
      )
    );
  }

  function updateFinal(field, value) {
    setFinalMatch((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateThirdPlace(field, value) {
    setThirdPlace((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startKnockoutMatch({ key, stageLabel, home, away, match }) {
    if (matchCenterStartLockRef.current) return;
    matchCenterStartLockRef.current = true;
    window.setTimeout(() => { matchCenterStartLockRef.current = false; }, 900);

    if (!home || !away) {
      matchCenterStartLockRef.current = false;
      alert("Bu maçın takımları henüz belli değil.");
      return;
    }

    if (typeof setFixtures !== "function") {
      matchCenterStartLockRef.current = false;
      alert("App.jsx bağlantısı bulunamadı.");
      return;
    }

    const anotherLiveMatch = fixtures.find(
      (item) => item.live === true && item.knockoutKey !== key
    );

    if (anotherLiveMatch) {
      matchCenterStartLockRef.current = false;
      alert(`${anotherLiveMatch.home} - ${anotherLiveMatch.away} maçı hâlâ canlı. Önce o maçı bitirin.`);
      return;
    }

    const existingIndex = fixtures.findIndex((item) => item.knockoutKey === key);

    // Aynı ÇF/YF slotu yeni takımlarla tekrar kullanıldığında eski event/kadro kayıtları
    // yeni maça yapışmasın. Kimlik slot + gerçek katılımcılardan oluşur.
    const participantToken = `${encodeURIComponent(String(home))}::${encodeURIComponent(String(away))}`;
    const stableId = `knockout:${key}:${participantToken}`;

    const baseMatch = {
      id: stableId,
      knockoutKey: key,
      isKnockout: true,
      stageLabel,
      home,
      away,
      homeScore: Number(match.homeScore || 0),
      awayScore: Number(match.awayScore || 0),
      homePen: match.homePen || "",
      awayPen: match.awayPen || "",
      date: match.date || "",
      time: match.time || "",
      field: match.field || "Saha 1",
      pitch: match.field || "Saha 1",
      played: false,
      live: false,
      matchPhase: "waiting",
      timerRunning: false,
      timerStartedAt: null,
      elapsedSeconds: 0,
      events: [],
    };

    let updatedFixtures;

    if (existingIndex >= 0) {
      const existing = fixtures[existingIndex];
      const restart = existing.played === true
        ? window.confirm("Bu maç daha önce tamamlanmış. Maç Merkezi'nde yeniden açmak istiyor musunuz?")
        : true;

      if (!restart) {
        matchCenterStartLockRef.current = false;
        return;
      }

      const sameParticipants = String(existing.home || "") === String(home) && String(existing.away || "") === String(away);
      updatedFixtures = fixtures.map((item, index) =>
        index === existingIndex
          ? (sameParticipants
              ? (existing.played === true
                  ? {
                      ...baseMatch,
                      id: stableId,
                      events: [],
                      goals: [],
                      deletedEventIds: [],
                      homeScore: 0,
                      awayScore: 0,
                      elapsedSeconds: 0,
                      matchPhase: "waiting",
                    }
                  : {
                      ...baseMatch,
                      ...existing,
                      id: stableId,
                      home,
                      away,
                      knockoutKey: key,
                      isKnockout: true,
                      stageLabel,
                      // DEVAM EDEN MAÇ: runtime kesinlikle sıfırlanmaz.
                      live: existing.live === true,
                      timerRunning: existing.timerRunning === true,
                      timerStartedAt: existing.timerStartedAt ?? null,
                      elapsedSeconds: Number(existing.elapsedSeconds || 0),
                      matchPhase: existing.matchPhase || "waiting",
                      events: Array.isArray(existing.events) ? existing.events : [],
                      goals: Array.isArray(existing.goals) ? existing.goals : [],
                      deletedEventIds: Array.isArray(existing.deletedEventIds) ? existing.deletedEventIds : [],
                      homeScore: Number(existing.homeScore || 0),
                      awayScore: Number(existing.awayScore || 0),
                    })
              : { ...baseMatch, goals: [], deletedEventIds: [] })
          : item
      );
    } else {
      updatedFixtures = [...fixtures, baseMatch];
    }

    setFixtures(updatedFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));

    // Maç Merkezi seçimi yalnız React ekranında kalmasın. Kullanıcı başka sekmeye
    // geçse veya yönetim ekranını yeniden açsa da bu maç, bitirilene/çıkarılana kadar seçili kalır.
    localStorage.setItem("sscup-match-center-active", stableId);
    // Tek basışta Maç Merkezi aynı sekmede anında seçilsin; Realtime beklenmez.
    window.dispatchEvent(new CustomEvent("sscup-match-center-active-changed", {
      detail: stableId,
    }));
    syncAppStateWithRetry("public_match_center", { matchId: stableId, updatedAt: new Date().toISOString() });

    window.dispatchEvent(
      new CustomEvent("sscup-fixtures-updated", {
        detail: updatedFixtures,
      })
    );

    if (typeof onOpenMatchCenter === "function") {
      onOpenMatchCenter();
    }
  }

  function isDraw(match) {
    const home = Number(match.homeScore);
    const away = Number(match.awayScore);

    return (
      match.homeScore !== "" &&
      match.awayScore !== "" &&
      !Number.isNaN(home) &&
      !Number.isNaN(away) &&
      home === away
    );
  }

  function getWinner(homeTeam, awayTeam, match) {
    if (!homeTeam || !awayTeam || match.homeScore === "" || match.awayScore === "") {
      return "";
    }

    const homeScore = Number(match.homeScore);
    const awayScore = Number(match.awayScore);

    if (homeScore > awayScore) return homeTeam;
    if (awayScore > homeScore) return awayTeam;

    if (match.homePen === "" || match.awayPen === "") {
      return "PENALTY_WAIT";
    }

    const homePen = Number(match.homePen);
    const awayPen = Number(match.awayPen);

    if (homePen > awayPen) return homeTeam;
    if (awayPen > homePen) return awayTeam;

    return "";
  }

  function getLoser(homeTeam, awayTeam, match) {
    const winner = getWinner(homeTeam, awayTeam, match);
    if (!winner || winner === "PENALTY_WAIT") return "";
    return winner === homeTeam ? awayTeam : homeTeam;
  }

  const quarterWinners = quarter.map((match) =>
    getWinner(match.home, match.away, match)
  );

  const semiTeams = [
    { home: quarterWinners[0], away: quarterWinners[2] },
    { home: quarterWinners[1], away: quarterWinners[3] },
  ];

  const semiWinners = semi.map((match, index) =>
    getWinner(semiTeams[index].home, semiTeams[index].away, match)
  );

  const semiLosers = semi.map((match, index) =>
    getLoser(semiTeams[index].home, semiTeams[index].away, match)
  );

  // Eleme kurası oluştuğu anda bütün şampiyonluk yolunu Maç Merkezi'ne taşı.
  // Henüz takımı belli olmayan turlar yer tutucu isimlerle görünür; gerçek takım
  // belli olduğunda aynı kayıt güncellenir, maç olayları/skorlar korunur.
  useEffect(() => {
    if (!drawStarted || typeof setFixtures !== "function") return;

    // Manuel kurada 8 slot tamamlanana kadar fixtures üretme.
    // Böylece her seçimde App/fixtures/realtime zinciri çalışıp seçimi geri silemez.
    const manualQuarterComplete =
      quarterMode !== "manual" ||
      quarter.every((match) => Boolean(match?.home) && Boolean(match?.away));
    if (!manualQuarterComplete) return;

    const isRealTeam = (name) => Boolean(name) && !/(Galibi|Mağlubu|PENALTY_WAIT)/i.test(String(name));
    const makeMatch = (key, stageLabel, home, away, source) => ({
      id: `knockout:${key}:${encodeURIComponent(String(home))}::${encodeURIComponent(String(away))}`,
      knockoutKey: key,
      isKnockout: true,
      stageLabel,
      home,
      away,
      participantsReady: isRealTeam(home) && isRealTeam(away),
      homeScore: source?.homeScore ?? "",
      awayScore: source?.awayScore ?? "",
      homePen: source?.homePen ?? "",
      awayPen: source?.awayPen ?? "",
      date: source?.date || "",
      time: source?.time || "",
      field: source?.field || "Saha 1",
      pitch: source?.field || "Saha 1",
      played: source?.played === true,
      live: source?.live === true,
      matchPhase: source?.matchPhase || "waiting",
      timerRunning: source?.timerRunning === true,
      timerStartedAt: source?.timerStartedAt ?? null,
      elapsedSeconds: source?.elapsedSeconds ?? 0,
      events: Array.isArray(source?.events) ? source.events : [],
    });

    const bracket = [
      ...quarter.map((m, i) => makeMatch(`quarter-${i}`, `Çeyrek Final ${i + 1}`, m.home || `ÇF ${i + 1} Takım 1`, m.away || `ÇF ${i + 1} Takım 2`, m)),
      makeMatch("semi-0", "Yarı Final 1", semiTeams[0].home || "ÇF 1 Galibi", semiTeams[0].away || "ÇF 3 Galibi", semi[0]),
      makeMatch("semi-1", "Yarı Final 2", semiTeams[1].home || "ÇF 2 Galibi", semiTeams[1].away || "ÇF 4 Galibi", semi[1]),
      makeMatch("third-place-0", "3.'lük Maçı", semiLosers[0] || "YF 1 Mağlubu", semiLosers[1] || "YF 2 Mağlubu", thirdPlace),
      makeMatch("final-0", "Final", semiWinners[0] || "YF 1 Galibi", semiWinners[1] || "YF 2 Galibi", finalMatch),
    ];

    setFixtures((current) => {
      const league = current.filter((m) => m?.isKnockout !== true);
      const oldKo = new Map(current.filter((m) => m?.isKnockout === true).map((m) => [m.knockoutKey, m]));
      const merged = bracket.map((fresh) => {
        const old = oldKo.get(fresh.knockoutKey);
        if (!old) return fresh;
        const sameParticipants = String(old.home || "") === String(fresh.home || "") && String(old.away || "") === String(fresh.away || "");
        if (!sameParticipants) return fresh;
        return {
          ...fresh,
          ...old,
          home: fresh.home,
          away: fresh.away,
          participantsReady: fresh.participantsReady,
          stageLabel: fresh.stageLabel,
          knockoutKey: fresh.knockoutKey,
          isKnockout: true,
          id: old.id || fresh.id,
        };
      });
      const next = [...league, ...merged];
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      localStorage.setItem("sscup-fixtures", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("sscup-fixtures-updated", { detail: next }));
      return next;
    });
  }, [drawStarted, quarterMode, quarter, semi, finalMatch, thirdPlace, semiTeams[0].home, semiTeams[0].away, semiTeams[1].home, semiTeams[1].away, semiWinners[0], semiWinners[1], semiLosers[0], semiLosers[1], setFixtures]);

  const champion = getWinner(semiWinners[0], semiWinners[1], finalMatch);
  const thirdPlaceWinner = getWinner(semiLosers[0], semiLosers[1], thirdPlace);

  async function resetKnockout() {
    const confirmed = window.confirm(
      "Eleme turundaki bütün kura sonuçları ve skorlar silinecek. Emin misiniz?"
    );
    if (!confirmed) return;

    setQuarter(createEmptyQuarter());
    setSemi(createEmptySemi());
    setFinalMatch(createEmptyFinal());
    setThirdPlace(createEmptyFinal());
    setDrawPotOne([]);
    setDrawPotTwo([]);
    setDrawStarted(false);
    setQuarterMode("draw");
    setLastDrawnMatch(null);
    setIsDrawing(false);

    const remainingFixtures = fixtures.filter((match) => match?.isKnockout !== true);
    if (typeof setFixtures === "function") setFixtures(remainingFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(remainingFixtures));
    localStorage.setItem("sscup-fixtures-v3", JSON.stringify(remainingFixtures));

    // ELEME SIFIRLAMA kesin sınırdır: eski aktif eleme maçı hiçbir kaynaktan
    // tekrar dirilmemeli. Normal çık-girde bu kayıtlar korunur; yalnız burada silinir.
    localStorage.removeItem("sscup-match-center-active");
    localStorage.removeItem("sscup-active-match-runtime");
    window.dispatchEvent(new CustomEvent("sscup-match-center-active-changed", { detail: "" }));

    try {
      const allLineups = JSON.parse(localStorage.getItem("sscup-match-lineups") || "{}");
      const cleanLineups = Object.fromEntries(Object.entries(allLineups).filter(([key]) => !String(key).startsWith("knockout:")));
      localStorage.setItem("sscup-match-lineups", JSON.stringify(cleanLineups));
      await supabase.from("app_state").upsert({ id: "match_lineups", value: cleanLineups, updated_at: new Date().toISOString() });
      await supabase.from("app_state").upsert({ id: "public_match_center", value: { matchId: "", updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() });
    } catch (error) { console.warn("Eleme kadro/aktif maç temizliği:", error); }

    [
      "sscup-quarter",
      "sscup-semi",
      "sscup-final",
      "sscup-third-place",
      "sscup-quarter-pot-one",
      "sscup-quarter-pot-two",
      "sscup-quarter-draw-started",
      "sscup-quarter-mode",
    ].forEach((key) => localStorage.removeItem(key));

    const emptyValue = {
      quarter: createEmptyQuarter(),
      semi: createEmptySemi(),
      finalMatch: createEmptyFinal(),
      thirdPlace: createEmptyFinal(),
      drawPotOne: [],
      drawPotTwo: [],
      drawStarted: false,
      quarterMode: "draw",
    };

    const { error } = await supabase
      .from("app_state")
      .upsert({ id: "knockout", value: emptyValue, updated_at: new Date().toISOString() });

    if (error) {
      console.error("Eleme bulut sıfırlama hatası:", error);
      alert("Eleme sistemi cihazda sıfırlandı ancak bulut kaydı temizlenemedi.");
      return;
    }

    window.dispatchEvent(new CustomEvent("sscup-fixtures-updated", { detail: remainingFixtures }));
    alert("Eleme sistemi PC ve telefon için tamamen sıfırlandı.");
  }

  return (
    <div className="card">
      <h2>🏆 Eleme Sistemi</h2>

      <button
        type="button"
        onClick={resetKnockout}
        style={{ marginBottom: "25px" }}
      >
        Eleme Sistemini Sıfırla
      </button>

      <hr />

      <div style={{ marginBottom: "26px" }}>
        <h3>📲 Tur Tebrik Mesajları</h3>
        <p style={{ color: "#64748b", marginTop: "-6px" }}>Her etap tamamen bittiğinde ilgili takım sorumlularının WhatsApp butonları otomatik açılır.</p>
        <StageMessagePanel title="🏆 Çeyrek Final Tebrik Mesajları" stage="quarter" teams={topEight.map((row) => row.team)} ready={leagueFinished && topEight.length === 8} waitingText="Lig aşamasında oynanacak maçlar bitince ilk 8 takım için açılacak." />
        <StageMessagePanel title="🔥 Yarı Final Tebrik Mesajları" stage="semi" teams={quarterWinners} ready={quarterFinished} waitingText="4 çeyrek final maçı tamamlanınca kazanan 4 takım için açılacak." />
        <StageMessagePanel title="👑 Final Tebrik Mesajları" stage="final" teams={semiWinners} ready={semiFinished} waitingText="2 yarı final maçı tamamlanınca finalistler için açılacak." />
        <StageMessagePanel title="🥉 3.'lük Maçı Mesajları" stage="third" teams={semiLosers} ready={semiFinished} waitingText="2 yarı final maçı tamamlanınca 3.'lük maçı oynayacak takımlar için açılacak." />
      </div>

      <hr />

      <h3>📊 Lig Sıralaması ve Torbalar</h3>

      <button
        type="button"
        onClick={refreshLeagueStandings}
        style={{ marginBottom: "15px" }}
      >
        🔄 Lig Sıralamasını Yenile
      </button>

      <div
        style={{
          padding: "22px",
          borderRadius: "18px",
          background: "linear-gradient(135deg, #071a3d, #102f68)",
          color: "white",
          boxShadow: "0 14px 35px rgba(4, 18, 45, 0.25)",
          marginBottom: "18px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h3 style={{ margin: 0 }}>🏆 S&S CUP ÇEYREK FİNAL SİSTEMİ</h3>
          <p style={{ margin: "10px 0 14px", opacity: 0.82 }}>
            Turnuva günü hangi sistem istenirse tek seçimle uygula. Lig, canlı takip ve sonraki turların çalışma mantığı değişmez.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={prepareFreeQuarterDraw}
              disabled={isDrawing || topEight.length < 8}
              title={topEight.length < 8 ? "Çeyrek final için ilk 8 takım oluşmalı" : "İlk 8 tek torba, tamamen serbest kura"}
              style={{ fontWeight: 900 }}
            >
              🔥 Tek Torba Serbest Kura
            </button>
            <button
              type="button"
              onClick={prepareQuarterDraw}
              disabled={isDrawing || topEight.length < 8}
              title={topEight.length < 8 ? "Çeyrek final için ilk 8 takım oluşmalı" : "Mevcut torbalı kura sistemi"}
            >
              🎱 Torbalı Kura
            </button>
            <button
              type="button"
              onClick={prepareManualQuarter}
              disabled={isDrawing || topEight.length < 8}
              title={topEight.length < 8 ? "Çeyrek final için ilk 8 takım oluşmalı" : "Takımları sorumluların çektiği sırayla elle yerleştir"}
              style={{ fontWeight: 900 }}
            >
              ✍️ Manuel Kura
            </button>
            <button
              type="button"
              onClick={prepareRankedQuarter}
              disabled={isDrawing || topEight.length < 8}
              title={topEight.length < 8 ? "Çeyrek final için ilk 8 takım oluşmalı" : "1-8 / 2-7 / 3-6 / 4-5"}
            >
              🏆 Sıralamaya Göre 1-8
            </button>
          </div>
          {topEight.length < 8 ? (
            <p style={{ margin: "12px 0 0", color: "#ffd978", fontWeight: 800 }}>
              Seçenekler hazır. Aktif olması için ilk 8 takımın lig sıralamasında oluşması gerekiyor. Şu an {topEight.length} takım var.
            </p>
          ) : drawStarted ? (
            <p style={{ margin: "12px 0 0", color: "#ffe07b", fontWeight: 800 }}>
              Aktif sistem: {quarterMode === "ranking" ? "1-8 / 2-7 / 3-6 / 4-5" : quarterMode === "free" ? "🔥 TEK TORBA SERBEST KURA" : quarterMode === "manual" ? "✍️ MANUEL KURA" : "Torbalı Kura"}
            </p>
          ) : (
            <p style={{ margin: "12px 0 0", opacity: 0.72 }}>İlk 8 hazır. Yukarıdan eşleşme sistemini seçin.</p>
          )}
        </div>
      </div>

      {topEight.length < 8 ? (
        <p>
          Çeyrek final için puan durumunda en az 8 takım bulunmalıdır. Şu anda{" "}
          <b>{topEight.length}</b> takım bulunuyor.
        </p>
      ) : (
        <>
          {quarterMode === "draw" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
              padding: "22px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #071a3d, #102f68)",
              color: "white",
              boxShadow: "0 14px 35px rgba(4, 18, 45, 0.25)",
            }}
          >
            <div
              style={{
                padding: "16px",
                border: "2px solid #d4af37",
                borderRadius: "14px",
                background: "rgba(255,255,255,0.08)",
              }}
            >
              <h4 style={{ marginTop: 0 }}>🟡 1. Torba</h4>
              {(drawStarted
                ? drawPotOne
                : firstPot.map((team) => team.team)
              ).map((team, index) => (
                <div
                  key={team}
                  style={{
                    padding: "10px 12px",
                    marginBottom: "8px",
                    borderRadius: "9px",
                    background: "rgba(255,255,255,0.12)",
                  }}
                >
                  <b>{index + 1}. {team}</b>
                </div>
              ))}
            </div>

            <div
              style={{
                padding: "16px",
                border: "2px solid rgba(255,255,255,0.72)",
                borderRadius: "14px",
                background: "rgba(255,255,255,0.08)",
              }}
            >
              <h4 style={{ marginTop: 0 }}>⚪ 2. Torba</h4>
              {(drawStarted
                ? drawPotTwo
                : secondPot.map((team) => team.team)
              ).map((team, index) => (
                <div
                  key={team}
                  style={{
                    padding: "10px 12px",
                    marginBottom: "8px",
                    borderRadius: "9px",
                    background: "rgba(255,255,255,0.12)",
                  }}
                >
                  <b>{index + 5}. {team}</b>
                </div>
              ))}
            </div>
          </div>
          )}

          {quarterMode === "free" && drawStarted && (
            <div style={{ marginTop: "18px", padding: "18px", borderRadius: "16px", background: "linear-gradient(135deg,#151515,#3a2b00)", color: "white", textAlign: "center" }}>
              <h3 style={{ marginTop: 0 }}>🔥 İLK 8 • TEK TORBA • KİM KİME DUM DUMA</h3>
              <p style={{ opacity: .85 }}>İlk 4 çekiliş ÇF1 → ÇF4'e birer takım koyar. Sonraki 4 çekiliş aynı maçların rakiplerini belirler.</p>
              {lastDrawnMatch?.drawnTeam ? (
                <div style={{ padding: "14px", margin: "12px auto", maxWidth: "520px", border: "2px solid #d4af37", borderRadius: "12px" }}>
                  <b>{lastDrawnMatch.slot} • {lastDrawnMatch.role}</b>
                  <div style={{ fontSize: "24px", fontWeight: 1000, marginTop: "7px" }}>{lastDrawnMatch.drawnTeam}</div>
                </div>
              ) : null}
              <div style={{ marginBottom: "10px", fontWeight: 800 }}>Torbadaki takım: {drawPotOne.length}</div>
              {!drawCompleted ? (
                <button type="button" onClick={drawNextFreeTeam} disabled={isDrawing || drawPotOne.length === 0}>
                  {isDrawing ? "⏳ TAKIM ÇEKİLİYOR..." : `🎲 TAKIM ÇEK • Sıradaki: ${quarter.filter(m => m.home).length < 4 ? `ÇF${quarter.filter(m => m.home).length + 1}` : `ÇF${quarter.filter(m => m.away).length + 1} RAKİBİ`}`}
                </button>
              ) : <p><b>✅ Serbest kura tamamlandı.</b></p>}
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: "20px" }}>
            {quarterMode === "draw" && drawStarted && !drawCompleted ? (
              <button type="button" onClick={drawNextQuarterMatch} disabled={isDrawing}>
                {isDrawing ? "⏳ Kura kaydediliyor..." : "🎲 Tüm Eşleşmeleri Tek Seferde Çek"}
              </button>
            ) : drawCompleted ? (
              <p><b>✅ Çeyrek final eşleşmeleri hazır.</b></p>
            ) : quarterMode === "ranking" && drawStarted ? (
              <p><b>✅ 1-8 / 2-7 / 3-6 / 4-5 eşleşmeleri hazır.</b></p>
            ) : null}
          </div>
        </>
      )}

      {quarterMode === "manual" && drawStarted && topEight.length >= 8 && (
        <div style={{ marginTop: "20px", padding: "18px", borderRadius: "16px", background: "#111", color: "white" }}>
          <h3 style={{ marginTop: 0 }}>✍️ Manuel Çeyrek Final Kurası</h3>
          <p style={{ opacity: .8 }}>Önce ÇF1-ÇF4 ilk takımlarını, sonra rakiplerini seçebilirsin. Seçilen takım diğer listelerden otomatik düşer.</p>
          {[0,1,2,3].map((i) => {
            const used = new Set(quarter.flatMap((m, idx) => idx === i ? [] : [m.home, m.away]).filter(Boolean));
            const options = topEight.map(t => t.team).filter(Boolean);
            return <div key={`manual-${i}`} className="manual-quarter-row">
              <b className="manual-quarter-label">ÇF{i+1}</b>
              <select className="manual-quarter-select" value={quarter[i]?.home || ""} onChange={(e)=>setManualQuarterTeam(i,"home",e.target.value)}>
                <option value="">İlk takım</option>
                {options.filter(t => !used.has(t) && t !== quarter[i]?.away).map(t => <option key={`h-${i}-${t}`} value={t}>{t}</option>)}
              </select>
              <select className="manual-quarter-select" value={quarter[i]?.away || ""} onChange={(e)=>setManualQuarterTeam(i,"away",e.target.value)}>
                <option value="">Rakip</option>
                {options.filter(t => !used.has(t) && t !== quarter[i]?.home).map(t => <option key={`a-${i}-${t}`} value={t}>{t}</option>)}
              </select>
            </div>;
          })}
        </div>
      )}

      {/* Çeyrek Final Maçları Listesi ve Skor/Penaltı Yönetimi */}
      <div style={{ marginTop: "30px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          ⚡ Çeyrek Final Maçları
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          {quarter.map((match, index) => {
            const isReady = match.home && match.away;

            return (
              <div
                key={index}
                style={{
                  padding: "20px",
                  borderRadius: "16px",
                  background: isReady ? "linear-gradient(145deg, #ffffff, #f0f4f8)" : "#f8f9fa",
                  border: isReady ? "2px solid #3b82f6" : "1px dashed #cbd5e1",
                  boxShadow: isReady ? "0 10px 25px rgba(59, 130, 246, 0.1)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase" }}>
                      Çeyrek Final #{index + 1}
                    </span>
                    <span style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "20px", background: isReady ? "#dbeafe" : "#f1f5f9", color: isReady ? "#1e40af" : "#64748b", fontWeight: "600" }}>
                      {isReady ? "Maç Hazır" : "Kura Bekleniyor"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "white",
                      padding: "14px",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      marginBottom: "15px",
                    }}
                  >
                    <div style={{ flex: 1, textAlign: "center", fontWeight: "700", color: match.home ? "#0f172a" : "#94a3b8", fontSize: "15px" }}>
                      {match.home || "Ev Sahibi"}
                    </div>
                    <div style={{ padding: "0 10px", fontWeight: "bold", color: "#cbd5e1", fontSize: "14px" }}>
                      VS
                    </div>
                    <div style={{ flex: 1, textAlign: "center", fontWeight: "700", color: match.away ? "#0f172a" : "#94a3b8", fontSize: "15px" }}>
                      {match.away || "Deplasman"}
                    </div>
                  </div>

                  {isReady && (
                    <>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={match.homeScore}
                          onChange={(e) => updateQuarter(index, "homeScore", e.target.value)}
                          style={{ width: "60px", textAlign: "center", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", fontWeight: "bold" }}
                        />
                        <span style={{ fontWeight: "bold", color: "#64748b" }}>-</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={match.awayScore}
                          onChange={(e) => updateQuarter(index, "awayScore", e.target.value)}
                          style={{ width: "60px", textAlign: "center", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", fontWeight: "bold" }}
                        />
                      </div>

                      {isDraw(match) && (
                        <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", padding: "10px", borderRadius: "10px", marginBottom: "12px", textAlign: "center" }}>
                          <span style={{ fontSize: "12px", fontWeight: "bold", color: "#b45309", display: "block", marginBottom: "6px" }}>⚖️ Eşitlik - Penaltılar</span>
                          <div style={{ display: "flex", gap: "8px", justifyContent: "center", alignItems: "center" }}>
                            <input
                              type="number"
                              min="0"
                              placeholder="Pen 1"
                              value={match.homePen}
                              onChange={(e) => updateQuarter(index, "homePen", e.target.value)}
                              style={{ width: "50px", textAlign: "center", padding: "6px", borderRadius: "6px", border: "1px solid #fcd34d" }}
                            />
                            <span>-</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="Pen 2"
                              value={match.awayPen}
                              onChange={(e) => updateQuarter(index, "awayPen", e.target.value)}
                              style={{ width: "50px", textAlign: "center", padding: "6px", borderRadius: "6px", border: "1px solid #fcd34d" }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {isReady && (
                  <button
                    type="button"
                    style={{
                      width: "100%",
                      marginTop: "10px",
                      background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      color: "white",
                      border: "none",
                      padding: "10px",
                      borderRadius: "10px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
                    }}
                    onClick={() =>
                      startKnockoutMatch({
                        key: `quarter-${index}`,
                        stageLabel: `Çeyrek Final ${index + 1}`,
                        home: match.home,
                        away: match.away,
                        match,
                      })
                    }
                  >
                    🚀 Maç Merkezinde Başlat / Yönet
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Yarı Final Maçları — Çeyrek Final ile aynı kart tasarımı */}
      <div style={{ marginTop: "38px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          🔥 Yarı Final Maçları
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          {semi.map((match, index) => {
            const teams = semiTeams[index];
            const isReady = Boolean(
              teams?.home &&
              teams?.away &&
              teams.home !== "PENALTY_WAIT" &&
              teams.away !== "PENALTY_WAIT"
            );
            const winner = isReady ? getWinner(teams.home, teams.away, match) : "";

            return (
              <div
                key={`semi-${index}`}
                style={{
                  padding: "20px",
                  borderRadius: "16px",
                  background: isReady
                    ? "linear-gradient(145deg, #ffffff, #f0f4f8)"
                    : "#f8f9fa",
                  border: isReady ? "2px solid #3b82f6" : "1px dashed #cbd5e1",
                  boxShadow: isReady ? "0 10px 25px rgba(59, 130, 246, 0.1)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "bold",
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Yarı Final #{index + 1}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        padding: "4px 10px",
                        borderRadius: "20px",
                        background: isReady ? "#dbeafe" : "#f1f5f9",
                        color: isReady ? "#1e40af" : "#64748b",
                        fontWeight: "600",
                      }}
                    >
                      {isReady ? "Maç Hazır" : "Çeyrek Final Sonucu Bekleniyor"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "white",
                      padding: "14px",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      marginBottom: "15px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        textAlign: "center",
                        fontWeight: "700",
                        color: teams?.home ? "#0f172a" : "#94a3b8",
                        fontSize: "15px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {teams?.home || "Takım Bekleniyor"}
                    </div>
                    <div
                      style={{
                        padding: "0 10px",
                        fontWeight: "bold",
                        color: "#cbd5e1",
                        fontSize: "14px",
                      }}
                    >
                      VS
                    </div>
                    <div
                      style={{
                        flex: 1,
                        textAlign: "center",
                        fontWeight: "700",
                        color: teams?.away ? "#0f172a" : "#94a3b8",
                        fontSize: "15px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {teams?.away || "Takım Bekleniyor"}
                    </div>
                  </div>

                  {isReady && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "12px",
                        }}
                      >
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={match.homeScore}
                          onChange={(event) => updateSemi(index, "homeScore", event.target.value)}
                          style={{
                            width: "60px",
                            textAlign: "center",
                            padding: "8px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            fontWeight: "bold",
                          }}
                        />
                        <span style={{ fontWeight: "bold", color: "#64748b" }}>-</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={match.awayScore}
                          onChange={(event) => updateSemi(index, "awayScore", event.target.value)}
                          style={{
                            width: "60px",
                            textAlign: "center",
                            padding: "8px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            fontWeight: "bold",
                          }}
                        />
                      </div>

                      {isDraw(match) && (
                        <div
                          style={{
                            background: "#fffbeb",
                            border: "1px solid #fef3c7",
                            padding: "10px",
                            borderRadius: "10px",
                            marginBottom: "12px",
                            textAlign: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: "bold",
                              color: "#b45309",
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            ⚖️ Eşitlik - Penaltılar
                          </span>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="number"
                              min="0"
                              placeholder="Pen 1"
                              value={match.homePen}
                              onChange={(event) => updateSemi(index, "homePen", event.target.value)}
                              style={{
                                width: "50px",
                                textAlign: "center",
                                padding: "6px",
                                borderRadius: "6px",
                                border: "1px solid #fcd34d",
                              }}
                            />
                            <span>-</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="Pen 2"
                              value={match.awayPen}
                              onChange={(event) => updateSemi(index, "awayPen", event.target.value)}
                              style={{
                                width: "50px",
                                textAlign: "center",
                                padding: "6px",
                                borderRadius: "6px",
                                border: "1px solid #fcd34d",
                              }}
                            />
                          </div>
                          {winner && winner !== "PENALTY_WAIT" && (
                            <div style={{ marginTop: "8px", color: "#166534", fontWeight: "800" }}>
                              ✅ {winner} finale yükseldi
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {isReady && (
                  <button
                    type="button"
                    style={{
                      width: "100%",
                      marginTop: "10px",
                      background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      color: "white",
                      border: "none",
                      padding: "10px",
                      borderRadius: "10px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
                    }}
                    onClick={() =>
                      startKnockoutMatch({
                        key: `semi-${index}`,
                        stageLabel: `Yarı Final ${index + 1}`,
                        home: teams.home,
                        away: teams.away,
                        match,
                      })
                    }
                  >
                    🚀 Maç Merkezinde Başlat / Yönet
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Final ve Üçüncülük — Çeyrek Final ile aynı kart tasarımı */}
      <div style={{ marginTop: "38px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          🏆 Final ve Üçüncülük Maçları
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          {[
            {
              title: "Büyük Final",
              key: "final-0",
              home: semiWinners[0],
              away: semiWinners[1],
              match: finalMatch,
              update: updateFinal,
              stageLabel: "Final",
              waitingText: "Yarı Final Sonuçları Bekleniyor",
            },
            {
              title: "Üçüncülük Maçı",
              key: "third-place-0",
              home: semiLosers[0],
              away: semiLosers[1],
              match: thirdPlace,
              update: updateThirdPlace,
              stageLabel: "Üçüncülük Maçı",
              waitingText: "Yarı Final Sonuçları Bekleniyor",
            },
          ].map((item) => {
            const isReady = Boolean(
              item.home &&
              item.away &&
              item.home !== "PENALTY_WAIT" &&
              item.away !== "PENALTY_WAIT"
            );
            const winner = isReady ? getWinner(item.home, item.away, item.match) : "";

            return (
              <div
                key={item.key}
                style={{
                  padding: "20px",
                  borderRadius: "16px",
                  background: isReady
                    ? "linear-gradient(145deg, #ffffff, #f0f4f8)"
                    : "#f8f9fa",
                  border: isReady ? "2px solid #3b82f6" : "1px dashed #cbd5e1",
                  boxShadow: isReady ? "0 10px 25px rgba(59, 130, 246, 0.1)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "bold",
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.title}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        padding: "4px 10px",
                        borderRadius: "20px",
                        background: isReady ? "#dbeafe" : "#f1f5f9",
                        color: isReady ? "#1e40af" : "#64748b",
                        fontWeight: "600",
                      }}
                    >
                      {isReady ? "Maç Hazır" : item.waitingText}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "white",
                      padding: "14px",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      marginBottom: "15px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        textAlign: "center",
                        fontWeight: "700",
                        color: item.home ? "#0f172a" : "#94a3b8",
                        fontSize: "15px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.home || "Takım Bekleniyor"}
                    </div>
                    <div
                      style={{
                        padding: "0 10px",
                        fontWeight: "bold",
                        color: "#cbd5e1",
                        fontSize: "14px",
                      }}
                    >
                      VS
                    </div>
                    <div
                      style={{
                        flex: 1,
                        textAlign: "center",
                        fontWeight: "700",
                        color: item.away ? "#0f172a" : "#94a3b8",
                        fontSize: "15px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.away || "Takım Bekleniyor"}
                    </div>
                  </div>

                  {isReady && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "12px",
                        }}
                      >
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={item.match.homeScore}
                          onChange={(event) => item.update("homeScore", event.target.value)}
                          style={{
                            width: "60px",
                            textAlign: "center",
                            padding: "8px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            fontWeight: "bold",
                          }}
                        />
                        <span style={{ fontWeight: "bold", color: "#64748b" }}>-</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={item.match.awayScore}
                          onChange={(event) => item.update("awayScore", event.target.value)}
                          style={{
                            width: "60px",
                            textAlign: "center",
                            padding: "8px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            fontWeight: "bold",
                          }}
                        />
                      </div>

                      {isDraw(item.match) && (
                        <div
                          style={{
                            background: "#fffbeb",
                            border: "1px solid #fef3c7",
                            padding: "10px",
                            borderRadius: "10px",
                            marginBottom: "12px",
                            textAlign: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: "bold",
                              color: "#b45309",
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            ⚖️ Eşitlik - Penaltılar
                          </span>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="number"
                              min="0"
                              placeholder="Pen 1"
                              value={item.match.homePen}
                              onChange={(event) => item.update("homePen", event.target.value)}
                              style={{
                                width: "50px",
                                textAlign: "center",
                                padding: "6px",
                                borderRadius: "6px",
                                border: "1px solid #fcd34d",
                              }}
                            />
                            <span>-</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="Pen 2"
                              value={item.match.awayPen}
                              onChange={(event) => item.update("awayPen", event.target.value)}
                              style={{
                                width: "50px",
                                textAlign: "center",
                                padding: "6px",
                                borderRadius: "6px",
                                border: "1px solid #fcd34d",
                              }}
                            />
                          </div>
                          {winner && winner !== "PENALTY_WAIT" && (
                            <div style={{ marginTop: "8px", color: "#166534", fontWeight: "800" }}>
                              ✅ Kazanan: {winner}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {isReady && (
                  <button
                    type="button"
                    style={{
                      width: "100%",
                      marginTop: "10px",
                      background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      color: "white",
                      border: "none",
                      padding: "10px",
                      borderRadius: "10px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
                    }}
                    onClick={() =>
                      startKnockoutMatch({
                        key: item.key,
                        stageLabel: item.stageLabel,
                        home: item.home,
                        away: item.away,
                        match: item.match,
                      })
                    }
                  >
                    🚀 Maç Merkezinde Başlat / Yönet
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {(champion && champion !== "PENALTY_WAIT") && (
        <section className="champion-stage" aria-label="Turnuva şampiyonu">
          <div className="champion-stars" aria-hidden="true">✦ ✦ ✦</div>
          <div className="champion-cup" aria-hidden="true">🏆</div>
          <div className="champion-kicker">S&amp;S CUP</div>
          <h2 className="champion-title">ŞAMPİYON</h2>
          <div className="champion-team">{champion}</div>
          <div className="champion-subtitle">Kazanan sahada belli olur.</div>
          <div className="champion-confetti" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i key={index} style={{ "--i": index }} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}