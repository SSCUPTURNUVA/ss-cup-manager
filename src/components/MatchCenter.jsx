import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { sortFixturesBySchedule } from "../utils/fixtureOrder";
import { flushPendingFixtureSync, syncLeagueFixtureWithRetry } from "../utils/pendingFixtureSync";

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTeamName(team) {
  if (typeof team === "string") return team;
  return team?.name || team?.teamName || "Takım";
}


function getMatchCenterKey(match, index = 0) {
  return String(match?.id ?? `${match?.home || ""}|${match?.away || ""}|${match?.week || ""}|${index}`);
}

function readMatchRules() {
  try {
    const saved = JSON.parse(localStorage.getItem("sscup-settings") || "{}");
    return {
      halfDurationMinutes: Math.max(1, safeNumber(saved.halfDurationMinutes, 30)),
      halftimeDurationMinutes: Math.max(0, safeNumber(saved.halftimeDurationMinutes, 5)),
    };
  } catch {
    return { halfDurationMinutes: 30, halftimeDurationMinutes: 5 };
  }
}

function formatMatchTime(totalSeconds) {
  const safeSeconds = Math.max(0, safeNumber(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function getMatchStatus(match) {
  if (!match) return "BEKLİYOR";
  if (match.played === true && match.live === true) return "GOLCÜ DÜZENLEME";
  if (match.played === true) return "MAÇ BİTTİ";

  const phase = match.matchPhase || "waiting";
  if (phase === "first_half") return match.timerRunning ? "1. DEVRE • CANLI" : "1. DEVRE • DURAKLATILDI";
  if (phase === "halftime") return match.timerRunning ? "DEVRE ARASI" : "DEVRE ARASI • BEKLİYOR";
  if (phase === "second_half") return match.timerRunning ? "2. DEVRE • CANLI" : "2. DEVRE • DURAKLATILDI";
  if (phase === "penalty") return "🥅 PENALTI ATIŞLARI";
  if (phase === "completed") return "MAÇ BİTTİ";
  return "BAŞLAMAYA HAZIR";
}

const EVENT_TYPES = {
  goal: { label: "Gol", icon: "⚽", scores: true, countsGoal: true },
  penalty_goal: { label: "Penaltı Golü", icon: "🥅", scores: true, countsGoal: true },
  penalty_shootout_goal: {
    label: "Seri Penaltı Golü",
    icon: "⚽",
    scores: false,
    countsGoal: true,
  },
  penalty_shootout_miss: {
    label: "Seri Penaltı Kaçtı",
    icon: "❌",
    scores: false,
    countsGoal: false,
  },
  scorer_record: {
    label: "Golcü Kaydı (Skoru Değiştirmez)",
    icon: "📝",
    scores: false,
    countsGoal: true,
  },
  assist: { label: "Asist", icon: "🅰️", scores: false },
  yellow_card: { label: "Sarı Kart", icon: "🟨", scores: false },
  red_card: { label: "Kırmızı Kart", icon: "🟥", scores: false },
  substitution: { label: "Oyuncu Değişikliği", icon: "🔄", scores: false },
  penalty_miss: { label: "Kaçan Penaltı", icon: "❌", scores: false },
  injury: { label: "Sakatlık", icon: "🤕", scores: false },
};

function normalizeEvent(event, index) {
  const type =
    event?.type || event?.eventType || event?.kind || "goal";
  const meta = EVENT_TYPES[type] || {
    label: type,
    icon: "•",
    scores: false,
  };

  return {
    ...event,
    id: event?.id || `${type}-${index}`,
    type,
    label: meta.label,
    icon: meta.icon,
    player:
      event?.playerName ||
      event?.player ||
      event?.name ||
      event?.scorer ||
      "Oyuncu",
    secondPlayer:
      event?.secondPlayerName ||
      event?.assistPlayerName ||
      event?.playerOutName ||
      "",
    team: event?.team || event?.teamName || "",
    minute:
      event?.minute ??
      event?.matchMinute ??
      event?.time ??
      event?.elapsedMinute ??
      "",
  };
}

function getMatchEvents(match) {
  const events = Array.isArray(match?.events) ? match.events : [];
  const directGoals = Array.isArray(match?.goals) ? match.goals : [];

  const goalIdsInEvents = new Set(
    events
      .filter(
        (event) =>
          event?.type === "goal" ||
          event?.type === "penalty_goal"
      )
      .map((event) => event?.id)
      .filter(Boolean)
  );

  const legacyGoals = directGoals
    .filter((goal) => !goalIdsInEvents.has(goal?.id))
    .map((goal) => ({ ...goal, type: goal.type || "goal" }));

  return [...events, ...legacyGoals]
    .map(normalizeEvent)
    .slice()
    .sort((a, b) => safeNumber(a.minute) - safeNumber(b.minute));
}


export default function MatchCenter({
  fixtures = [],
  standings = [],
  goalScorers = [],
  setFixtures,
}) {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [eventSide, setEventSide] = useState("home");
  const [eventType, setEventType] = useState("goal");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [secondPlayerId, setSecondPlayerId] = useState("");
  const [matchRules, setMatchRules] = useState(readMatchRules);

  // Penaltı Atışları Yönetimi
  const [penaltySide, setPenaltySide] = useState("home");
  const [penaltyPlayerId, setPenaltyPlayerId] = useState("");
  const [matchLineups, setMatchLineups] = useState(() => {
    try {
      const saved = localStorage.getItem("sscup-match-lineups");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("sscup-match-lineups", JSON.stringify(matchLineups));
  }, [matchLineups]);

  useEffect(() => {
    function refreshRules() {
      setMatchRules(readMatchRules());
    }
    window.addEventListener("sscup-settings-updated", refreshRules);
    return () => window.removeEventListener("sscup-settings-updated", refreshRules);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);


  // İnternet saha kenarında kısa süre kesilirse maç yönetimi durmaz.
  // Yerel kayıt devam eder; bekleyen bulut yazıları bağlantı gelince otomatik tamamlanır.
  useEffect(() => {
    const flush = () => { flushPendingFixtureSync(); };
    flush();
    window.addEventListener("online", flush);
    const retryTimer = window.setInterval(flush, 10000);
    return () => {
      window.removeEventListener("online", flush);
      window.clearInterval(retryTimer);
    };
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  function readSquads() {
    try {
      const saved = localStorage.getItem("sscup-squads");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  function getTeamSquad(teamName) {
    const squads = readSquads();
    return Array.isArray(squads?.[teamName])
      ? squads[teamName]
      : [];
  }

  function getPlayerName(player) {
    return (
      player?.name ||
      player?.playerName ||
      player?.fullName ||
      "Oyuncu"
    );
  }

  function getVisibleElapsedSeconds(match) {
    const savedSeconds = Math.max(
      0,
      safeNumber(match?.elapsedSeconds)
    );

    if (
      match?.timerRunning !== true ||
      !match?.timerStartedAt
    ) {
      return savedSeconds;
    }

    const startedAt = safeNumber(match.timerStartedAt, NaN);

    if (!Number.isFinite(startedAt)) {
      return savedSeconds;
    }

    return (
      savedSeconds +
      Math.max(
        0,
        Math.floor((currentTime - startedAt) / 1000)
      )
    );
  }

  const activeMatchCenterKey = localStorage.getItem("sscup-match-center-active") || "";
  const liveMatchIndex = fixtures.findIndex(
    (match, index) =>
      match.live === true ||
      (activeMatchCenterKey && getMatchCenterKey(match, index) === activeMatchCenterKey)
  );

  const liveMatch = liveMatchIndex >= 0 ? fixtures[liveMatchIndex] : null;

  const playedMatches = fixtures.filter(
    (match) => match.played === true
  );

  const nextMatch = sortFixturesBySchedule(
    fixtures.filter(
      (match) =>
        match?.played !== true &&
        match?.live !== true &&
        match?.participantsReady !== false &&
        match?.home &&
        match?.away
    )
  )[0] || null;

  const elapsedSeconds = liveMatch
    ? getVisibleElapsedSeconds(liveMatch)
    : 0;

  const matchStatus = getMatchStatus(liveMatch);
  const matchPhase = liveMatch?.matchPhase || "waiting";
  const phaseLimitSeconds =
    matchPhase === "halftime"
      ? matchRules.halftimeDurationMinutes * 60
      : matchRules.halfDurationMinutes * 60;
  const remainingSeconds = Math.max(0, phaseLimitSeconds - elapsedSeconds);

  const matchEvents = useMemo(
    () => getMatchEvents(liveMatch),
    [liveMatch]
  );

  function eventBelongsToSide(event, side) {
    if (!liveMatch || !event) return false;
    if (event.side === side) return true;
    const expectedTeam = side === "home" ? liveMatch.home : liveMatch.away;
    return String(event.team || event.teamName || "") === String(expectedTeam || "");
  }

  const homeGoalEvents = matchEvents.filter(
    (event) => EVENT_TYPES[event.type]?.scores === true && eventBelongsToSide(event, "home")
  );
  const awayGoalEvents = matchEvents.filter(
    (event) => EVENT_TYPES[event.type]?.scores === true && eventBelongsToSide(event, "away")
  );
  const homeCardEvents = matchEvents.filter(
    (event) => ["yellow_card", "red_card"].includes(event.type) && eventBelongsToSide(event, "home")
  );
  const awayCardEvents = matchEvents.filter(
    (event) => ["yellow_card", "red_card"].includes(event.type) && eventBelongsToSide(event, "away")
  );

  const selectedTeamName = liveMatch
    ? eventSide === "home"
      ? liveMatch.home
      : liveMatch.away
    : "";

  function playerKey(player, index) {
    return String(player?.id || player?.playerId || index);
  }

  function getMatchLineupKey(match) {
    if (!match) return "";
    return String(
      match.id ??
      match.knockoutKey ??
      `${match.home || "takim-a"}-${match.away || "takim-b"}-${match.week || "lig"}`
    );
  }

  function getSideLineup(side, match = liveMatch) {
    const matchKey = getMatchLineupKey(match);
    const saved = matchKey ? matchLineups?.[matchKey]?.[side] : null;
    return {
      starters: Array.isArray(saved?.starters) ? saved.starters.map(String) : [],
      bench: Array.isArray(saved?.bench) ? saved.bench.map(String) : [],
    };
  }

  function setPlayerLineupStatus(side, player, index, status) {
    if (!liveMatch || matchPhase !== "waiting") return;

    const matchKey = getMatchLineupKey(liveMatch);
    const playerId = playerKey(player, index);
    const current = getSideLineup(side);
    let starters = current.starters.filter((id) => id !== playerId);
    let bench = current.bench.filter((id) => id !== playerId);

    if (status === "starter") {
      if (starters.length >= 7) {
        alert("Bir takımda en fazla 7 AS oyuncu seçilebilir.");
        return;
      }
      starters = [...starters, playerId];
    } else if (status === "bench") {
      if (bench.length >= 5) {
        alert("Bir takımda en fazla 5 YEDEK oyuncu seçilebilir.");
        return;
      }
      bench = [...bench, playerId];
    }

    setMatchLineups((currentLineups) => ({
      ...currentLineups,
      [matchKey]: {
        ...(currentLineups[matchKey] || {}),
        [side]: { starters, bench },
      },
    }));
  }

  function getTeamSubstitutionState(side) {
    const teamName = side === "home" ? liveMatch?.home : liveMatch?.away;
    const allSquad = liveMatch ? getTeamSquad(teamName) : [];
    const lineup = getSideLineup(side);
    const matchDayIds = new Set([...lineup.starters, ...lineup.bench]);
    const squad = allSquad.filter((player, index) => matchDayIds.has(playerKey(player, index)));
    const events = (Array.isArray(liveMatch?.events) ? liveMatch.events : [])
      .filter((event) =>
        (event?.side === side || String(event?.team || event?.teamName || "") === String(teamName || ""))
      );

    const active = new Set(lineup.starters);
    const lockedOut = new Set();

    events.forEach((event) => {
      if (event?.type === "substitution") {
        const outId = String(event?.playerOutId || event?.playerId || "");
        const inId = String(event?.playerInId || event?.secondPlayerId || "");
        if (outId) {
          active.delete(outId);
          lockedOut.add(outId);
        }
        if (inId && matchDayIds.has(inId) && !lockedOut.has(inId)) active.add(inId);
      }

      if (event?.type === "red_card") {
        const redId = String(event?.playerId || "");
        if (redId) {
          active.delete(redId);
          lockedOut.add(redId);
        }
      }
    });

    return {
      squad,
      active,
      lockedOut,
      starters: squad.filter((player, index) => active.has(playerKey(player, allSquad.indexOf(player)))),
      bench: squad.filter((player, index) => !active.has(playerKey(player, allSquad.indexOf(player)))),
    };
  }

  const selectedSubstitutionState = liveMatch
    ? getTeamSubstitutionState(eventSide)
    : { squad: [], active: new Set(), lockedOut: new Set(), starters: [], bench: [] };

  const selectedSquad = selectedSubstitutionState.squad;

  useEffect(() => {
    if (!liveMatch || liveMatch.timerRunning !== true) return;
    if (phaseLimitSeconds <= 0 || elapsedSeconds < phaseLimitSeconds) return;

    if (matchPhase === "first_half") {
      updateLiveMatch({
        matchPhase: "halftime",
        timerRunning: false,
        timerStartedAt: null,
        elapsedSeconds: 0,
      });
    } else if (matchPhase === "halftime") {
      updateLiveMatch({
        timerRunning: false,
        timerStartedAt: null,
        elapsedSeconds: phaseLimitSeconds,
      });
    } else if (matchPhase === "second_half") {
      updateLiveMatch({
        timerRunning: false,
        timerStartedAt: null,
        elapsedSeconds: phaseLimitSeconds,
      });
    }
  }, [currentTime, liveMatch?.id, liveMatch?.timerRunning, matchPhase, phaseLimitSeconds]);

  const topFiveStandings = standings.slice(0, 5);
  const topFiveScorers = goalScorers.slice(0, 5);

  async function syncKnockoutStateToCloud(match) {
    if (!match?.isKnockout || !match?.knockoutKey) return;

    const { data, error: readError } = await supabase
      .from("app_state")
      .select("value")
      .eq("id", "knockout")
      .maybeSingle();

    if (readError) {
      console.error("Eleme durumu okunamadı:", readError);
      return;
    }

    const value = data?.value && typeof data.value === "object"
      ? { ...data.value }
      : {};

    const cloudMatch = {
      id: match.id,
      home: match.home || "",
      away: match.away || "",
      homeScore: match.homeScore ?? 0,
      awayScore: match.awayScore ?? 0,
      homePen: match.homePen ?? "",
      awayPen: match.awayPen ?? "",
      date: match.date || "",
      time: match.time || "",
      field: match.field || match.pitch || "Saha 1",
      played: match.played === true,
      live: match.live === true,
      matchPhase: match.matchPhase || "waiting",
      events: Array.isArray(match.events) ? match.events : [],
    };

    const [stage, rawIndex] = String(match.knockoutKey).split("-");
    const index = Number(rawIndex || 0);

    if (stage === "quarter") {
      const quarter = Array.isArray(value.quarter) ? [...value.quarter] : [];
      quarter[index] = { ...(quarter[index] || {}), ...cloudMatch };
      value.quarter = quarter;
    } else if (stage === "semi") {
      const semi = Array.isArray(value.semi) ? [...value.semi] : [];
      semi[index] = { ...(semi[index] || {}), ...cloudMatch };
      value.semi = semi;
    } else if (match.knockoutKey === "final-0") {
      value.finalMatch = { ...(value.finalMatch || {}), ...cloudMatch };
    } else if (match.knockoutKey === "third-place-0") {
      value.thirdPlace = { ...(value.thirdPlace || {}), ...cloudMatch };
    }

    const { error: writeError } = await supabase
      .from("app_state")
      .upsert({
        id: "knockout",
        value,
        updated_at: new Date().toISOString(),
      });

    if (writeError) {
      console.error("Eleme durumu kaydedilemedi:", writeError);
    }
  }

  async function persistFixtures(updatedFixtures) {
    if (typeof setFixtures === "function") {
      setFixtures(updatedFixtures);
    }

    localStorage.setItem(
      "sscup-fixtures",
      JSON.stringify(updatedFixtures)
    );

    try {
      const activeMatch = updatedFixtures.find((match) => match.live === true);

      if (activeMatch?.isKnockout === true) {
        await syncKnockoutStateToCloud(activeMatch);
      } else if (activeMatch) {
        await syncLeagueFixtureWithRetry(activeMatch);
      }
    } catch (error) {
      console.error("Supabase kayıt hatası:", error);
    }

    window.dispatchEvent(
      new CustomEvent("sscup-fixtures-updated", {
        detail: updatedFixtures,
      })
    );
  }

  async function updateLiveMatch(patch) {
    if (liveMatchIndex < 0) return;

    const updatedFixtures = fixtures.map((match, index) =>
      index === liveMatchIndex
        ? { ...match, ...patch }
        : match
    );

    await persistFixtures(updatedFixtures);

    const updatedMatch = updatedFixtures[liveMatchIndex];
    if (updatedMatch?.isKnockout) {
      await syncKnockoutStateToCloud(updatedMatch);
    }
  }

  function getPlayerById(playerId) {
    return selectedSquad.find(
      (item, index) =>
        String(item.id || item.playerId || index) ===
        String(playerId)
    );
  }

  function rebuildGoalScorers(updatedFixtures) {
    const totals = {};

    updatedFixtures.forEach((match) => {
      const events = getMatchEvents(match).filter(
        (event) =>
          EVENT_TYPES[event.type]?.countsGoal === true
      );

      events.forEach((goal) => {
        const playerId = goal.playerId || goal.id;
        const team = goal.team || goal.teamName;

        if (!playerId || !team) return;

        const key = `${team}-${playerId}`;

        if (!totals[key]) {
          totals[key] = {
            id: key,
            playerId,
            name: goal.playerName || goal.name || "Oyuncu",
            playerName: goal.playerName || goal.name || "Oyuncu",
            team,
            teamName: team,
            shirtNumber: goal.shirtNumber || "",
            goals: 0,
          };
        }

        totals[key].goals += 1;
      });
    });

    const updatedScorers = Object.values(totals).sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return a.name.localeCompare(b.name, "tr");
    });

    localStorage.setItem(
      "sscup-goal-scorers",
      JSON.stringify(updatedScorers)
    );
    localStorage.setItem(
      "sscup-goals",
      JSON.stringify(updatedScorers)
    );

    window.dispatchEvent(
      new CustomEvent("sscup-goals-updated", {
        detail: updatedScorers,
      })
    );
  }

  async function handleAddEvent() {
    if (!liveMatch || liveMatchIndex < 0) return;

    if (!selectedPlayerId) {
      alert("Oyuncuyu seçiniz.");
      return;
    }

    const player = getPlayerById(selectedPlayerId);

    if (!player) {
      alert("Seçilen oyuncu kadroda bulunamadı.");
      return;
    }

    const needsSecondPlayer =
      eventType === "assist" || eventType === "substitution";

    if (needsSecondPlayer && !secondPlayerId) {
      alert(
        eventType === "assist"
          ? "Gol atan oyuncuyu da seçiniz."
          : "Oyuna girecek oyuncuyu da seçiniz."
      );
      return;
    }

    const secondPlayer = needsSecondPlayer
      ? getPlayerById(secondPlayerId)
      : null;

    if (
      needsSecondPlayer &&
      (!secondPlayer ||
        String(secondPlayerId) === String(selectedPlayerId))
    ) {
      alert("İkinci oyuncu farklı ve geçerli olmalıdır.");
      return;
    }

    if (eventType === "substitution") {
      const outId = String(selectedPlayerId);
      const inId = String(secondPlayerId);

      if (!selectedSubstitutionState.active.has(outId)) {
        alert("Oyundan çıkacak oyuncu şu anda as kadroda değil.");
        return;
      }
      if (selectedSubstitutionState.active.has(inId)) {
        alert("Oyuna girecek oyuncu zaten as kadroda.");
        return;
      }
      if (selectedSubstitutionState.lockedOut.has(inId)) {
        alert("Bu oyuncu daha önce oyundan çıktı. Tekrar oyuna giremez.");
        return;
      }
    }

    const minute = Math.max(
      1,
      Math.ceil(elapsedSeconds / 60) +
        (matchPhase === "second_half" ? matchRules.halfDurationMinutes : 0)
    );
    const playerId =
      player.id ||
      player.playerId ||
      `${selectedTeamName}-${selectedPlayerId}`;

    const newEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: eventType,
      eventType,
      playerId,
      playerName: getPlayerName(player),
      name: getPlayerName(player),
      team: selectedTeamName,
      teamName: selectedTeamName,
      shirtNumber: player.shirtNumber || player.number || "",
      minute,
      side: eventSide,
    };

    if (eventType === "assist") {
      newEvent.secondPlayerId =
        secondPlayer.id || secondPlayer.playerId || secondPlayerId;
      newEvent.secondPlayerName = getPlayerName(secondPlayer);
      newEvent.assistPlayerName = getPlayerName(player);
      newEvent.playerName = getPlayerName(player);
    }

    if (eventType === "substitution") {
      newEvent.playerOutId = playerId;
      newEvent.playerOutName = getPlayerName(player);
      newEvent.playerInId =
        secondPlayer.id || secondPlayer.playerId || secondPlayerId;
      newEvent.playerInName = getPlayerName(secondPlayer);
      newEvent.secondPlayerName = getPlayerName(secondPlayer);
    }

    const currentEvents = Array.isArray(liveMatch.events)
      ? liveMatch.events
      : [];

    const actionId = `action-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    newEvent.actionId = actionId;

    const eventsToAdd = [newEvent];

    if (eventType === "yellow_card") {
      const playerAlreadySentOff = currentEvents.some((event) =>
        event?.type === "red_card" &&
        String(event?.playerId || "") === String(playerId) &&
        String(event?.team || event?.teamName || "") === String(selectedTeamName)
      );

      if (playerAlreadySentOff) {
        alert(`${getPlayerName(player)} zaten kırmızı kart görmüş.`);
        return;
      }

      const previousYellowCount = currentEvents.filter((event) =>
        event?.type === "yellow_card" &&
        String(event?.playerId || "") === String(playerId) &&
        String(event?.team || event?.teamName || "") === String(selectedTeamName)
      ).length;

      if (previousYellowCount >= 1) {
        eventsToAdd.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}-auto-red`,
          actionId,
          type: "red_card",
          eventType: "red_card",
          playerId,
          playerName: getPlayerName(player),
          name: getPlayerName(player),
          team: selectedTeamName,
          teamName: selectedTeamName,
          shirtNumber: player.shirtNumber || player.number || "",
          minute,
          side: eventSide,
          autoGenerated: true,
          reason: "İkinci sarı kart",
        });
      }
    }

    const scores = EVENT_TYPES[eventType]?.scores === true;

    const patch = {
      events: [...currentEvents, ...eventsToAdd],
      homeScore:
        scores && eventSide === "home"
          ? safeNumber(liveMatch.homeScore) + 1
          : safeNumber(liveMatch.homeScore),
      awayScore:
        scores && eventSide === "away"
          ? safeNumber(liveMatch.awayScore) + 1
          : safeNumber(liveMatch.awayScore),
    };

    const updatedFixtures = fixtures.map((match, index) =>
      index === liveMatchIndex ? { ...match, ...patch } : match
    );

    await persistFixtures(updatedFixtures);
    const updatedMatch = updatedFixtures[liveMatchIndex];

    const cloudId = updatedMatch?.id;
    if (updatedMatch.isKnockout) {
      await syncKnockoutStateToCloud(updatedMatch);
    } else if (cloudId !== null && cloudId !== undefined && cloudId !== "") {
      await supabase
        .from("fixtures")
        .update({
          played: updatedMatch.played,
          home_score: updatedMatch.homeScore,
          away_score: updatedMatch.awayScore,
        })
        .eq("id", cloudId);
    }

    if (EVENT_TYPES[eventType]?.countsGoal === true) {
      rebuildGoalScorers(updatedFixtures);
    }

    setSelectedPlayerId("");
    setSecondPlayerId("");
  }

  // Seri Penaltı Atışı Ekleme
  async function handlePenaltyKick(isGoal) {
    if (!liveMatch || liveMatchIndex < 0) return;

    if (!penaltyPlayerId) {
      alert("Lütfen penaltıyı atacak oyuncuyu seçiniz.");
      return;
    }

    const currentPenaltyTeamName =
      penaltySide === "home" ? liveMatch.home : liveMatch.away;
    const squad = getTeamSquad(currentPenaltyTeamName);
    const player = squad.find(
      (item, index) =>
        String(item.id || item.playerId || index) === String(penaltyPlayerId)
    );

    if (!player) {
      alert("Seçilen oyuncu kadroda bulunamadı.");
      return;
    }

    const playerId =
      player.id || player.playerId || `${currentPenaltyTeamName}-${penaltyPlayerId}`;

    const eventType = isGoal ? "penalty_shootout_goal" : "penalty_shootout_miss";

    const newEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: eventType,
      eventType,
      playerId,
      playerName: getPlayerName(player),
      name: getPlayerName(player),
      team: currentPenaltyTeamName,
      teamName: currentPenaltyTeamName,
      shirtNumber: player.shirtNumber || player.number || "",
      minute: "Penaltı",
      side: penaltySide,
    };

    const currentEvents = Array.isArray(liveMatch.events) ? liveMatch.events : [];
    const currentHomePen = safeNumber(liveMatch.homePen);
    const currentAwayPen = safeNumber(liveMatch.awayPen);

    const nextEvents = [...currentEvents, newEvent];
    const nextHomePen =
      isGoal && penaltySide === "home" ? currentHomePen + 1 : currentHomePen;
    const nextAwayPen =
      isGoal && penaltySide === "away" ? currentAwayPen + 1 : currentAwayPen;

    // Penaltı serisi artık hiçbir durumda otomatik bitirilmez.
    // Hakem/operatör sonucu doğruladıktan sonra
    // “Penaltıları ve Maçı Bitir” düğmesine kendisi basar.
    const patch = {
      events: nextEvents,
      homePen: nextHomePen,
      awayPen: nextAwayPen,
    };

    const updatedFixtures = fixtures.map((match, index) =>
      index === liveMatchIndex ? { ...match, ...patch } : match
    );

    await persistFixtures(updatedFixtures);
    await syncKnockoutStateToCloud(updatedFixtures[liveMatchIndex]);

    if (isGoal) {
      rebuildGoalScorers(updatedFixtures);
    }

    setPenaltySide((prev) => (prev === "home" ? "away" : "home"));
    setPenaltyPlayerId("");
  }

  async function handleStartNextMatch() {
    if (!nextMatch) return;

    const nextIndex = fixtures.findIndex((match) => match === nextMatch || match?.id === nextMatch?.id);
    if (nextIndex >= 0) {
      localStorage.setItem("sscup-match-center-active", getMatchCenterKey(nextMatch, nextIndex));
    }

    const updatedFixtures = fixtures.map((match) => ({
      ...match,
      // Hazırlık aşaması CANLI değildir. CANLI yalnız 1. Devre Başlat ile açılır.
      live: false,
      timerRunning: false,
      timerStartedAt: null,
      elapsedSeconds: match === nextMatch ? 0 : match.elapsedSeconds ?? 0,
      matchPhase: match === nextMatch ? "waiting" : match.matchPhase,

      ...(match === nextMatch && {
        homeScore: 0,
        awayScore: 0,
        homePen: "",
        awayPen: "",
        events: [],
        goals: [],
        played: false,
      }),
    }));

    if (typeof setFixtures === "function") setFixtures(updatedFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));

    const preparedMatch = updatedFixtures[nextIndex];
    if (preparedMatch?.isKnockout === true) {
      await syncKnockoutStateToCloud(preparedMatch);
    } else if (preparedMatch) {
      await syncLeagueFixtureWithRetry(preparedMatch);
    }

    window.dispatchEvent(new CustomEvent("sscup-fixtures-updated", { detail: updatedFixtures }));
  }

  async function handleUndoLastEvent() {
    if (!liveMatch || liveMatchIndex < 0) return;

    const currentEvents = Array.isArray(liveMatch.events)
      ? liveMatch.events
      : [];

    if (currentEvents.length === 0) {
      alert("Geri alınacak maç olayı bulunmuyor.");
      return;
    }

    const lastEvent = currentEvents[currentEvents.length - 1];
    const lastActionId = lastEvent?.actionId;
    const removedEvents = lastActionId
      ? currentEvents.filter((event) => event?.actionId === lastActionId)
      : [lastEvent];
    const updatedEvents = lastActionId
      ? currentEvents.filter((event) => event?.actionId !== lastActionId)
      : currentEvents.slice(0, -1);

    let newHomeScore = safeNumber(liveMatch.homeScore);
    let newAwayScore = safeNumber(liveMatch.awayScore);
    let newHomePen = safeNumber(liveMatch.homePen);
    let newAwayPen = safeNumber(liveMatch.awayPen);

    removedEvents.forEach((event) => {
      const isHomeEvent =
        event.side === "home" ||
        event.team === liveMatch.home;

      if (event.type === "penalty_shootout_goal") {
        if (isHomeEvent) {
          newHomePen = Math.max(0, newHomePen - 1);
        } else {
          newAwayPen = Math.max(0, newAwayPen - 1);
        }
      } else if (EVENT_TYPES[event.type]?.scores === true) {
        if (isHomeEvent) {
          newHomeScore = Math.max(0, newHomeScore - 1);
        } else {
          newAwayScore = Math.max(0, newAwayScore - 1);
        }
      }
    });

    const patch = {
      events: updatedEvents,
      homeScore: newHomeScore,
      awayScore: newAwayScore,
      homePen: newHomePen,
      awayPen: newAwayPen,
    };

    const updatedFixtures = fixtures.map((match, index) =>
      index === liveMatchIndex ? { ...match, ...patch } : match
    );

    await persistFixtures(updatedFixtures);

    if (removedEvents.some((event) => EVENT_TYPES[event.type]?.countsGoal === true)) {
      rebuildGoalScorers(updatedFixtures);
    }
  }

  async function openCompletedMatchForScorers(matchToEdit) {
    if (!matchToEdit) return;

    const updatedFixtures = fixtures.map((match) => ({
      ...match,
      live: match === matchToEdit,
      timerRunning: false,
      timerStartedAt: null,
    }));

    await persistFixtures(updatedFixtures);
    setEventType("scorer_record");
    setSelectedPlayerId("");
    setSecondPlayerId("");
  }

  function validateMatchLineups() {
    if (!liveMatch) return "Canlı maç bulunamadı.";

    for (const side of ["home", "away"]) {
      const teamName = side === "home" ? liveMatch.home : liveMatch.away;
      const teamSquad = getTeamSquad(teamName);
      const lineup = getSideLineup(side);
      const validIds = new Set(teamSquad.map((player, index) => playerKey(player, index)));
      const selectedIds = [...lineup.starters, ...lineup.bench];

      if (teamSquad.length < 12) {
        return `${teamName} takımında en az 12 kayıtlı oyuncu olmalı. Şu an ${teamSquad.length} oyuncu var.`;
      }
      if (lineup.starters.length !== 7) {
        return `${teamName} için tam 7 AS oyuncu seçilmeden maç başlayamaz.`;
      }
      if (lineup.bench.length !== 5) {
        return `${teamName} için tam 5 YEDEK oyuncu seçilmeden maç başlayamaz.`;
      }
      if (new Set(selectedIds).size !== 12 || selectedIds.some((id) => !validIds.has(id))) {
        return `${teamName} maç kadrosunda geçersiz veya tekrarlanan oyuncu var. Kadroyu yeniden seçin.`;
      }
    }

    return "";
  }

  function renderLineupSelector(side) {
    if (!liveMatch) return null;
    const teamName = side === "home" ? liveMatch.home : liveMatch.away;
    const teamSquad = getTeamSquad(teamName);
    const lineup = getSideLineup(side);

    return (
      <div style={{ border: "1px solid rgba(255,255,255,.18)", borderRadius: "12px", padding: "12px", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
          <strong>{teamName}</strong>
          <span style={{ fontSize: "12px", fontWeight: 900 }}>AS {lineup.starters.length}/7 • YEDEK {lineup.bench.length}/5</span>
        </div>
        {teamSquad.length === 0 ? (
          <small>Bu takımın kayıtlı oyuncusu yok.</small>
        ) : (
          <div style={{ display: "grid", gap: "6px", maxHeight: "320px", overflowY: "auto" }}>
            {teamSquad.map((player, index) => {
              const id = playerKey(player, index);
              const status = lineup.starters.includes(id) ? "starter" : lineup.bench.includes(id) ? "bench" : "out";
              return (
                <div key={id} style={{ display: "grid", gridTemplateColumns: "1fr 118px", gap: "8px", alignItems: "center", background: "rgba(255,255,255,.05)", padding: "7px", borderRadius: "8px" }}>
                  <span><b>#{player.shirtNumber ?? player.number ?? "-"}</b> {getPlayerName(player)}</span>
                  <select
                    value={status}
                    onChange={(event) => setPlayerLineupStatus(side, player, index, event.target.value)}
                    disabled={matchPhase !== "waiting"}
                    style={{ padding: "6px" }}
                  >
                    <option value="out">Kadro Dışı</option>
                    <option value="starter">AS</option>
                    <option value="bench">YEDEK</option>
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function startPhase(phase) {
    if (!liveMatch) return;
    updateLiveMatch({
      live: true,
      matchPhase: phase,
      timerRunning: true,
      timerStartedAt: Date.now(),
      elapsedSeconds: 0,
    });
  }

  function handleTimerToggle() {
    if (!liveMatch) return;

    if (matchPhase === "waiting") {
      const lineupError = validateMatchLineups();
      if (lineupError) {
        alert(`⛔ MAÇ BAŞLATILAMAZ\n\n${lineupError}`);
        return;
      }
      startPhase("first_half");
      return;
    }

    if (liveMatch.timerRunning === true) {
      updateLiveMatch({
        timerRunning: false,
        elapsedSeconds,
        timerStartedAt: null,
      });
      return;
    }

    updateLiveMatch({
      timerRunning: true,
      timerStartedAt: Date.now(),
      elapsedSeconds,
    });
  }

  function finishCurrentPhase() {
    if (!liveMatch) return;

    if (matchPhase === "first_half") {
      updateLiveMatch({
        matchPhase: "halftime",
        timerRunning: false,
        timerStartedAt: null,
        elapsedSeconds: 0,
      });
      return;
    }

    if (matchPhase === "halftime") {
      startPhase("second_half");
      return;
    }

    if (matchPhase === "second_half") {
      handleFinishMatch();
    }
  }

  // LİG: beraberlik normal sonuçtur. ELEME: beraberlikte penaltı gerekir.
  async function handleFinishMatch() {
    if (!liveMatch) return;

    const isDraw = safeNumber(liveMatch.homeScore) === safeNumber(liveMatch.awayScore);

    // Penaltı yalnızca eleme maçlarında devreye girer.
    if (liveMatch.isKnockout === true && isDraw && matchPhase !== "penalty") {
      alert(`Eleme maçı berabere bitti (${liveMatch.homeScore} - ${liveMatch.awayScore})!\n\nKazananı belirlemek için seri penaltı atışlarına geçiliyor...`);
      await updateLiveMatch({
        matchPhase: "penalty",
        timerRunning: false,
        timerStartedAt: null,
      });
      return;
    }

    if (liveMatch.isKnockout === true && matchPhase === "penalty" && safeNumber(liveMatch.homePen) === safeNumber(liveMatch.awayPen)) {
      alert("Penaltı serisi henüz eşit. Kazanan belli olmadan maç bitirilemez.");
      return;
    }

    const confirmed = window.confirm(
      `${liveMatch.home} - ${liveMatch.away} maçını sonlandırıp bitirmek istiyor musunuz?`
    );

    if (!confirmed) return;

    localStorage.removeItem("sscup-match-center-active");

    const finishPatch = {
      played: true,
      live: false,
      matchPhase: "completed",
      timerRunning: false,
      timerStartedAt: null,
      elapsedSeconds,
    };

    const finishedMatch = { ...liveMatch, ...finishPatch };

    // Maç sonucu önce yerelde kesinleşir. İnternet yoksa bulut kaydı kuyruğa alınır;
    // saha kenarında "maçı bitirememe" durumu oluşmaz.
    let cloudSynced = true;
    if (liveMatch.isKnockout === true) {
      await syncKnockoutStateToCloud(finishedMatch);
    } else {
      cloudSynced = await syncLeagueFixtureWithRetry(finishedMatch);
    }

    await updateLiveMatch(finishPatch);

    if (!cloudSynced) {
      alert("⚠️ Maç yerelde güvenle bitirildi. İnternet bağlantısı gelince canlı takip otomatik eşitlenecek.");
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      alert("Tam ekran modu bu tarayıcıda açılamadı.");
    }
  }

  const isScoreDrawn = liveMatch && safeNumber(liveMatch.homeScore) === safeNumber(liveMatch.awayScore);

  return (
    <div className="page-stack match-center-pro">
      <section className="page-heading match-center-heading">
        <div>
          <span className="eyebrow">
            S&S CUP MANAGER PRO • CANLI YAYIN
          </span>

          <h2>📺 Maç Merkezi</h2>

          <p>
            Canlı skor, maç saati, maç olayları, puan
            durumu ve gol krallığı tek ekranda.
          </p>
        </div>

        <button
          type="button"
          className="primary-button match-fullscreen-button"
          onClick={toggleFullscreen}
        >
          {isFullscreen
            ? "🗗 Tam Ekrandan Çık"
            : "⛶ Tam Ekran"}
        </button>
      </section>

      <section
        className={`match-tv-board ${
          liveMatch ? "is-live" : "is-idle"
        }`}
      >
        <div className="match-tv-glow" />

        <div className="match-tv-topline">
          <span
            className={`match-live-pill ${
              liveMatch ? "active" : ""
            }`}
          >
            <i />
            {liveMatch ? matchStatus : "YAYIN BEKLİYOR"}
          </span>

          <span className="match-competition">
            S&S CUP MANAGER PRO
          </span>
        </div>

        {liveMatch ? (
          <>
            <div className="match-scoreboard">
              <div className="match-team match-team-home">
                <span className="match-team-badge">⚽</span>
                <strong>{getTeamName(liveMatch.home)}</strong>
                <small>TAKIM A</small>
                <div className="match-team-event-summary">
                  {homeGoalEvents.map((event) => (
                    <span key={`hg-${event.id}`} className="match-team-event-line goal-line">
                      ⚽ {event.player} {event.minute !== "" ? `${event.minute}'` : ""}
                    </span>
                  ))}
                  {homeCardEvents.map((event) => (
                    <span key={`hc-${event.id}`} className={`match-team-event-line ${event.type}`}>
                      {event.type === "yellow_card" ? "🟨" : "🟥"} {event.player} {event.minute !== "" ? `${event.minute}'` : ""}
                      {event.autoGenerated ? " • 2. sarı" : ""}
                    </span>
                  ))}
                </div>
              </div>

              <div className="match-score-center">
                <span className="match-clock">
                  {matchPhase === "penalty" ? "🥅 PENALTI" : formatMatchTime(remainingSeconds)}
                </span>

                <div className="match-score">
                  <b>{safeNumber(liveMatch.homeScore)}</b>
                  <em>-</em>
                  <b>{safeNumber(liveMatch.awayScore)}</b>
                </div>

                {(matchPhase === "penalty" || liveMatch.homePen !== "" || liveMatch.awayPen !== "") && (
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#fbbf24", marginTop: "4px" }}>
                    Penaltılar: {safeNumber(liveMatch.homePen)} - {safeNumber(liveMatch.awayPen)}
                  </div>
                )}

                <span className="match-period">
                  {matchStatus}
                </span>
              </div>

              <div className="match-team match-team-away">
                <span className="match-team-badge">⚽</span>
                <strong>{getTeamName(liveMatch.away)}</strong>
                <small>TAKIM B</small>
                <div className="match-team-event-summary">
                  {awayGoalEvents.map((event) => (
                    <span key={`ag-${event.id}`} className="match-team-event-line goal-line">
                      ⚽ {event.player} {event.minute !== "" ? `${event.minute}'` : ""}
                    </span>
                  ))}
                  {awayCardEvents.map((event) => (
                    <span key={`ac-${event.id}`} className={`match-team-event-line ${event.type}`}>
                      {event.type === "yellow_card" ? "🟨" : "🟥"} {event.player} {event.minute !== "" ? `${event.minute}'` : ""}
                      {event.autoGenerated ? " • 2. sarı" : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="match-meta-strip">
              <span>
                📍{" "}
                {liveMatch.pitch ||
                  liveMatch.field ||
                  "Saha 1"}
              </span>

              <span>
                📅 {liveMatch.date || "Tarih belirlenmedi"}
              </span>

              <span>
                ⏰ {liveMatch.time || "Saat belirlenmedi"}
              </span>

              <span>
                🏷️{" "}
                {liveMatch.isKnockout === true
                  ? liveMatch.stageLabel || "Eleme Turu"
                  : liveMatch.week
                  ? `${liveMatch.week}. Hafta`
                  : "Lig Aşaması"}
              </span>
            </div>

            <div className="match-period-info">
              <strong>
                {matchPhase === "waiting" && "Maç 2 devre oynanacak"}
                {matchPhase === "first_half" && `1. Devre • ${matchRules.halfDurationMinutes} dakika`}
                {matchPhase === "halftime" && `Devre Arası • ${matchRules.halftimeDurationMinutes} dakika`}
                {matchPhase === "second_half" && `2. Devre • ${matchRules.halfDurationMinutes} dakika`}
                {matchPhase === "penalty" && "🥅 Penaltı Atışları Yönetimi"}
              </strong>
              <small>Süreler Turnuva Ayarları bölümünden değiştirilebilir.</small>
            </div>

            {matchPhase === "waiting" && (
              <section style={{ margin: "16px 0", padding: "16px", borderRadius: "14px", background: "#111827", color: "white", border: "2px solid #d4af37" }}>
                <div style={{ marginBottom: "12px" }}>
                  <b>👕 MAÇ KADROSU • 7 AS + 5 YEDEK</b>
                  <div style={{ fontSize: "12px", marginTop: "4px", opacity: .85 }}>
                    Her iki takımda da 7 AS ve 5 YEDEK seçilmeden 1. devre başlatılamaz. Maç başladıktan sonra kadro kilitlenir.
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
                  {renderLineupSelector("home")}
                  {renderLineupSelector("away")}
                </div>
              </section>
            )}

            <div className="match-control-row">
              {matchPhase !== "completed" && matchPhase !== "penalty" && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleTimerToggle}
                >
                  {matchPhase === "waiting"
                    ? "▶ 1. Devreyi Başlat"
                    : liveMatch.timerRunning === true
                    ? "⏸ Sayacı Duraklat"
                    : matchPhase === "halftime"
                    ? "▶ Devre Arası Sayacını Başlat"
                    : "▶ Devam Et"}
                </button>
              )}

              {matchPhase === "first_half" && (
                <button type="button" className="match-finish-button" onClick={finishCurrentPhase}>
                  ☕ 1. Devreyi Bitir
                </button>
              )}

              {matchPhase === "halftime" && (
                <button type="button" className="match-finish-button" onClick={finishCurrentPhase}>
                  ▶ 2. Devreyi Başlat
                </button>
              )}

              {matchPhase === "second_half" && liveMatch.isKnockout === true && isScoreDrawn && (
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: "#dc2626" }}
                  onClick={() => updateLiveMatch({ matchPhase: "penalty", timerRunning: false })}
                >
                  🥅 Seri Penaltı Atışlarına Geç
                </button>
              )}

              {matchPhase === "second_half" && (
                <button type="button" className="match-finish-button" onClick={handleFinishMatch}>
                  🏁 Maçı Bitir
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="match-tv-empty">
            <span>🏟️</span>
            <h3>Şu anda canlı maç bulunmuyor</h3>
            <p>
              Fikstür ekranından bir maçı canlı
              başlattığınızda skor burada görünecek.
            </p>
          </div>
        )}
      </section>

      {/* PENALTI ATIŞLARI ÖZEL PANELİ */}
      {liveMatch && matchPhase === "penalty" && (
        <section className="panel-card" style={{ border: "2px solid #f59e0b", background: "linear-gradient(135deg, #0f172a, #1e293b)", color: "white", padding: "20px", borderRadius: "16px", marginBottom: "25px" }}>
          <div className="section-title" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px", marginBottom: "15px" }}>
            <div>
              <h3 style={{ color: "#fbbf24", margin: 0 }}>🥅 Seri Penaltı Atışları Yönetimi</h3>
              <p style={{ margin: "4px 0 0 0", opacity: 0.8, fontSize: "13px" }}>
                Atış yapacak oyuncuyu seçin. Atılan goller anında Gol Krallığına eklenir.
              </p>
            </div>
          </div>

          <div style={{ textAlign: "center", marginBottom: "20px", background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "12px" }}>
            <div style={{ fontSize: "12px", textTransform: "uppercase", color: "#94a3b8", fontWeight: "bold" }}>Mevcut Penaltı Skoru</div>
            <div style={{ fontSize: "28px", fontWeight: "bold", color: "#fbbf24", margin: "4px 0" }}>
              {liveMatch.home} {safeNumber(liveMatch.homePen)} - {safeNumber(liveMatch.awayPen)} {liveMatch.away}
            </div>
          </div>

          {matchEvents.filter((event) => ["penalty_shootout_goal", "penalty_shootout_miss"].includes(event.type)).length > 0 && (
            <div style={{ maxWidth: "620px", margin: "0 auto 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 900, color: "#fbbf24", marginBottom: "8px", letterSpacing: ".06em" }}>PENALTI ATIŞLARI</div>
              {matchEvents
                .filter((event) => ["penalty_shootout_goal", "penalty_shootout_miss"].includes(event.type))
                .map((event) => {
                  const no = event.shirtNumber || event.number || "";
                  const name = event.playerName || event.player || event.name || "Oyuncu";
                  const ok = event.type === "penalty_shootout_goal";
                  return (
                    <div key={event.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "center", padding: "7px 4px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                      <span style={{ fontWeight: 800 }}>{no ? `${no} ` : ""}{name} <small style={{ opacity: .65 }}>• {event.team || event.teamName || ""}</small></span>
                      <b style={{ color: ok ? "#4ade80" : "#f87171", fontSize: "18px" }}>{ok ? "✓" : "✕"}</b>
                    </div>
                  );
                })}
            </div>
          )}

          <div className="live-goal-team-tabs" style={{ marginBottom: "15px" }}>
            <button
              type="button"
              className={penaltySide === "home" ? "active" : ""}
              onClick={() => {
                setPenaltySide("home");
                setPenaltyPlayerId("");
              }}
            >
              {liveMatch.home} (Atıcı)
            </button>

            <button
              type="button"
              className={penaltySide === "away" ? "active" : ""}
              onClick={() => {
                setPenaltySide("away");
                setPenaltyPlayerId("");
              }}
            >
              {liveMatch.away} (Atıcı)
            </button>
          </div>

          {getTeamSquad(penaltySide === "home" ? liveMatch.home : liveMatch.away).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "500px", margin: "0 auto" }}>
              <select
                value={penaltyPlayerId}
                onChange={(e) => setPenaltyPlayerId(e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid #475569", background: "#334155", color: "white", fontWeight: "bold" }}
              >
                <option value="">-- Penaltıyı Atacak Oyuncuyu Seçin --</option>
                {getTeamSquad(penaltySide === "home" ? liveMatch.home : liveMatch.away).map((player, index) => {
                  const playerId = player.id || player.playerId || index;
                  return (
                    <option key={playerId} value={playerId}>
                      {player.shirtNumber || player.number ? `#${player.shirtNumber || player.number} - ` : ""}
                      {getPlayerName(player)}
                    </option>
                  );
                })}
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => handlePenaltyKick(true)}
                  style={{ background: "#16a34a", color: "white", padding: "12px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}
                >
                  ⚽ GOL
                </button>

                <button
                  type="button"
                  onClick={() => handlePenaltyKick(false)}
                  style={{ background: "#dc2626", color: "white", padding: "12px", borderRadius: "10px", border: "none", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}
                >
                  ❌ KAÇIRDI
                </button>
              </div>

              <button
                type="button"
                className="live-goal-undo"
                onClick={handleUndoLastEvent}
                style={{ marginTop: "8px" }}
              >
                ↩ Son Penaltı Atışını Geri Al
              </button>
            </div>
          ) : (
            <p className="empty-message" style={{ color: "#f87171" }}>
              {penaltySide === "home" ? liveMatch.home : liveMatch.away} takımının kadrosu bulunamadı. Kadro Yönetimi bölümünden oyuncu ekleyin.
            </p>
          )}

          <div style={{ textAlign: "center", marginTop: "20px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "15px" }}>
            <button
              type="button"
              className="match-finish-button"
              style={{ background: "#2563eb", width: "auto", padding: "10px 24px" }}
              onClick={handleFinishMatch}
            >
              🏁 Penaltıları ve Maçı Bitir
            </button>
          </div>
        </section>
      )}

      {/* NORMAL MAÇ OLAYI EKLEME PANELİ */}
      {liveMatch && matchPhase !== "penalty" && (
        <section className="panel-card live-goal-control match-event-control">
          <div className="section-title">
            <div>
              <h3>🎛️ Canlı Maç Olayı Ekle</h3>
              <p>
                Olay türünü, takımı ve oyuncuyu seç. Dakika
                sayaçtan otomatik alınır.
              </p>
            </div>
          </div>

          <div className="live-goal-team-tabs">
            <button
              type="button"
              className={eventSide === "home" ? "active" : ""}
              onClick={() => {
                setEventSide("home");
                setSelectedPlayerId("");
                setSecondPlayerId("");
              }}
            >
              {liveMatch.home}
            </button>

            <button
              type="button"
              className={eventSide === "away" ? "active" : ""}
              onClick={() => {
                setEventSide("away");
                setSelectedPlayerId("");
                setSecondPlayerId("");
              }}
            >
              {liveMatch.away}
            </button>
          </div>

          {selectedSquad.length > 0 ? (
            <div className="match-event-form">
              <select
                value={eventType}
                onChange={(event) => {
                  setEventType(event.target.value);
                  setSelectedPlayerId("");
                  setSecondPlayerId("");
                }}
              >
                {Object.entries(EVENT_TYPES).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.icon} {item.label}
                  </option>
                ))}
              </select>

              <select
                value={selectedPlayerId}
                onChange={(event) =>
                  setSelectedPlayerId(event.target.value)
                }
              >
                <option value="">
                  {eventType === "substitution"
                    ? "Oyundan çıkacak oyuncu"
                    : eventType === "assist"
                    ? "Asist yapan oyuncu"
                    : "Oyuncuyu seç"}
                </option>

                {(eventType === "substitution"
                  ? selectedSubstitutionState.starters
                  : selectedSubstitutionState.starters
                ).map((player, index) => {
                  const originalIndex = selectedSquad.indexOf(player);
                  const playerId = player.id || player.playerId || originalIndex;

                  return (
                    <option key={playerId} value={playerId}>
                      {player.shirtNumber || player.number
                        ? `${player.shirtNumber || player.number} - `
                        : ""}
                      {getPlayerName(player)}
                    </option>
                  );
                })}
              </select>

              {(eventType === "assist" ||
                eventType === "substitution") && (
                <select
                  value={secondPlayerId}
                  onChange={(event) =>
                    setSecondPlayerId(event.target.value)
                  }
                >
                  <option value="">
                    {eventType === "assist"
                      ? "Gol atan oyuncu"
                      : "Oyuna girecek oyuncu"}
                  </option>

                  {(eventType === "substitution"
                    ? selectedSubstitutionState.bench.filter((player) => {
                        const originalIndex = selectedSquad.indexOf(player);
                        return !selectedSubstitutionState.lockedOut.has(
                          playerKey(player, originalIndex)
                        );
                      })
                    : selectedSubstitutionState.starters
                  ).map((player, index) => {
                    const originalIndex = selectedSquad.indexOf(player);
                    const playerId = player.id || player.playerId || originalIndex;

                    return (
                      <option key={playerId} value={playerId}>
                        {player.shirtNumber || player.number
                          ? `${player.shirtNumber || player.number} - `
                          : ""}
                        {getPlayerName(player)}
                      </option>
                    );
                  })}
                </select>
              )}

              {eventType === "substitution" && (
                <div style={{ width: "100%", marginTop: "8px", fontSize: "12px" }}>
                  <b>As Kadro ({selectedSubstitutionState.starters.length})</b>:{" "}
                  {selectedSubstitutionState.starters.map(getPlayerName).join(", ") || "-"}
                  <br />
                  <b>Yedekler ({selectedSubstitutionState.bench.length})</b>:{" "}
                  {selectedSubstitutionState.bench.map((player) => {
                    const originalIndex = selectedSquad.indexOf(player);
                    const locked = selectedSubstitutionState.lockedOut.has(playerKey(player, originalIndex));
                    return `${getPlayerName(player)}${locked ? " (çıktı - tekrar giremez)" : ""}`;
                  }).join(", ") || "-"}
                </div>
              )}

              <button
                type="button"
                className="primary-button"
                onClick={handleAddEvent}
              >
                ➕ Olayı Kaydet
              </button>

              <button
                type="button"
                className="live-goal-undo"
                onClick={handleUndoLastEvent}
              >
                ↩ Son Olayı Geri Al
              </button>
            </div>
          ) : (
            <p className="empty-message">
              {selectedTeamName} takımının kadrosu bulunamadı.
              Önce Kadro Yönetimi bölümünden oyuncu ekleyin.
            </p>
          )}
        </section>
      )}

      <section className="match-center-grid">
        <article className="panel-card match-events-panel">
          <div className="section-title">
            <h3>📋 Maç Olayları</h3>
            <span>{matchEvents.length} Kayıt</span>
          </div>

          {matchEvents.length > 0 ? (
            <div className="match-event-list">
              {matchEvents.map((event) => (
                <div
                  key={event.id}
                  className={`match-event-row event-${event.type}`}
                >
                  <span className="match-event-minute">
                    {event.minute !== ""
                      ? `${event.minute}'`
                      : event.icon}
                  </span>

                  <div>
                    <strong>
                      {event.icon} {event.player}
                    </strong>

                    {event.type === "substitution" &&
                      event.secondPlayer && (
                        <small>
                          Çıktı: {event.player} • Girdi:{" "}
                          {event.secondPlayer}
                        </small>
                      )}

                    {event.type === "assist" &&
                      event.secondPlayer && (
                        <small>
                          Gol atan: {event.secondPlayer}
                        </small>
                      )}

                    {!["substitution", "assist"].includes(
                      event.type
                    ) && (
                      <small>
                        {event.team || "Takım bilgisi yok"}
                        {event.autoGenerated && event.reason ? ` • ${event.reason}` : ""}
                      </small>
                    )}
                  </div>

                  <b>{event.label.toUpperCase()}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">
              Canlı maç için henüz olay kaydı bulunmuyor.
            </p>
          )}
        </article>

        <article className="panel-card match-next-panel">
          <div className="section-title">
            <h3>⏭️ Sıradaki Maç</h3>
          </div>

          {nextMatch ? (
            <div className="match-next-card">
              <strong>{getTeamName(nextMatch.home)}</strong>
              <span>VS</span>
              <strong>{getTeamName(nextMatch.away)}</strong>

              <small>
                {nextMatch.date || "Tarih belirlenmedi"} •{" "}
                {nextMatch.time || "Saat belirlenmedi"}
              </small>

              <small>
                {nextMatch.pitch ||
                  nextMatch.field ||
                  "Saha 1"}
              </small>

              {!liveMatch && (
                <button
                  type="button"
                  className="primary-button match-start-next-button"
                  onClick={handleStartNextMatch}
                >
                  ▶ Bu Maçı Başlat
                </button>
              )}
            </div>
          ) : (
            <p className="empty-message">
              Bekleyen maç bulunmuyor.
            </p>
          )}
        </article>

        <article className="panel-card match-last-panel">
          <div className="section-title">
            <h3>🏁 Tamamlanan Maçlar</h3>
            <span>{playedMatches.length} Maç</span>
          </div>

          {playedMatches.length > 0 ? (
            <div className="completed-match-edit-list">
              {[...playedMatches].reverse().map((match, index) => (
                <div
                  className="match-last-card"
                  key={match.id || `${match.home}-${match.away}-${match.date}-${match.time}-${index}`}
                >
                  <strong>{getTeamName(match.home)}</strong>

                  <span>
                    {safeNumber(match.homeScore)} -{" "}
                    {safeNumber(match.awayScore)}
                    {(match.homePen !== "" || match.awayPen !== "") && (
                      <small style={{ display: "block", fontSize: "11px", color: "#f59e0b" }}>
                        (Pen: {safeNumber(match.homePen)} - {safeNumber(match.awayPen)})
                      </small>
                    )}
                  </span>

                  <strong>{getTeamName(match.away)}</strong>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openCompletedMatchForScorers(match)}
                  >
                    ⚽ Golcüleri Düzenle
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">
              Henüz tamamlanmış maç bulunmuyor.
            </p>
          )}
        </article>
      </section>

      <section className="match-ranking-grid">
        <article className="panel-card">
          <div className="section-title">
            <h3>📊 İlk 5 Takım</h3>
          </div>

          {topFiveStandings.length > 0 ? (
            <div className="match-ranking-list">
              {topFiveStandings.map((team, index) => (
                <div
                  key={team.team || index}
                  className={`match-ranking-row ${
                    index === 0 ? "leader" : ""
                  }`}
                >
                  <span>{index + 1}</span>
                  <strong>{team.team}</strong>
                  <small>
                    {team.played || 0} Maç
                  </small>
                  <b>{team.points || 0} P</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">
              Puan durumu henüz oluşmadı.
            </p>
          )}
        </article>

        <article className="panel-card">
          <div className="section-title">
            <h3>🥇 Gol Krallığı</h3>
          </div>

          {topFiveScorers.length > 0 ? (
            <div className="match-ranking-list">
              {topFiveScorers.map((player, index) => (
                <div
                  key={
                    player.id ||
                    player.playerId ||
                    `${player.name}-${index}`
                  }
                  className={`match-ranking-row ${
                    index === 0 ? "leader" : ""
                  }`}
                >
                  <span>{index + 1}</span>

                  <strong>
                    {player.playerName ||
                      player.name ||
                      "Oyuncu"}
                  </strong>

                  <small>
                    {player.team || "Takım"}
                  </small>

                  <b>{player.goals || 0} Gol</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">
              Gol kaydı henüz bulunmuyor.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}