import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import "./PublicTournament.css";

const GOAL_EVENT_TYPES = new Set(["goal", "penalty_goal", "penalty_shootout_goal", "scorer_record"]);

const EVENT_META = {
  goal: { icon: "⚽", label: "GOL" },
  penalty_goal: { icon: "🥅", label: "PENALTI GOLÜ" },
  penalty_shootout_goal: { icon: "⚽", label: "PENALTI GOLÜ" },
  penalty_shootout_miss: { icon: "❌", label: "PENALTI KAÇTI" },
  scorer_record: { icon: "⚽", label: "GOL" },
  assist: { icon: "🅰️", label: "ASİST" },
  yellow_card: { icon: "🟨", label: "SARI KART" },
  red_card: { icon: "🟥", label: "KIRMIZI KART" },
  substitution: { icon: "🔄", label: "DEĞİŞİKLİK" },
  penalty_miss: { icon: "❌", label: "PENALTI KAÇTI" },
  injury: { icon: "🤕", label: "SAKATLIK" },
};

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeEvent(event, index) {
  const type = event?.type || event?.eventType || event?.kind || "goal";
  const meta = EVENT_META[type] || { icon: "•", label: String(type).toUpperCase() };
  return {
    ...event,
    id: event?.id || `${type}-${index}`,
    type,
    icon: meta.icon,
    label: meta.label,
    player: event?.playerName || event?.player || event?.name || event?.scorer || "Oyuncu",
    team: event?.team || event?.teamName || "",
    minute: event?.minute ?? event?.matchMinute ?? event?.time ?? event?.elapsedMinute ?? "",
    shirtNumber: event?.shirtNumber || event?.number || event?.jerseyNumber || "",
  };
}

function getEvents(match) {
  const events = Array.isArray(match?.events) ? match.events : [];
  const directGoals = Array.isArray(match?.goals) ? match.goals : [];
  const eventIds = new Set(events.map((event) => event?.id).filter(Boolean));
  const legacyGoals = directGoals
    .filter((goal) => !eventIds.has(goal?.id))
    .map((goal) => ({ ...goal, type: goal?.type || "goal" }));

  return [...events, ...legacyGoals]
    .map(normalizeEvent)
    .sort((a, b) => safeNumber(a.minute) - safeNumber(b.minute));
}

function mapCloudFixture(item) {
  const played = item.played === true;
  const live = item.live === true && !played && item.match_phase !== "completed";
  return {
    id: item.id,
    home: item.home,
    away: item.away,
    date: item.date,
    time: item.time,
    field: item.pitch || item.field,
    week: item.week,
    played,
    homeScore: item.home_score,
    awayScore: item.away_score,
    live,
    timerRunning: item.timer_running,
    timerStartedAt: item.timer_started_at,
    elapsedSeconds: item.elapsed_seconds,
    matchPhase: item.match_phase,
    isKnockout: item.is_knockout === true,
    knockoutKey: item.knockout_key || "",
    stageLabel: item.stage || item.stage_label || "",
    homePenalties: item.home_penalties ?? item.homePen ?? "",
    awayPenalties: item.away_penalties ?? item.awayPen ?? "",
    events: Array.isArray(item.events) ? item.events : [],
    cloudUpdatedAt: item.updated_at || item.updatedAt || "",
  };
}

function calculateStandings(teams, fixtures) {
  const table = {};
  (teams || []).forEach((team) => {
    const name = typeof team === "string" ? team : team?.name || team?.teamName;
    if (!name) return;
    table[name] = { team: name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
  });

  (fixtures || [])
    .filter((match) => match?.played === true && match?.isKnockout !== true)
    .forEach((match) => {
      const home = match?.home;
      const away = match?.away;
      if (!home || !away) return;
      if (!table[home]) table[home] = { team: home, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
      if (!table[away]) table[away] = { team: away, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
      const hs = safeNumber(match.homeScore);
      const as = safeNumber(match.awayScore);
      table[home].played += 1;
      table[away].played += 1;
      table[home].goalsFor += hs;
      table[home].goalsAgainst += as;
      table[away].goalsFor += as;
      table[away].goalsAgainst += hs;
      if (hs > as) {
        table[home].won += 1; table[home].points += 3; table[away].lost += 1;
      } else if (as > hs) {
        table[away].won += 1; table[away].points += 3; table[home].lost += 1;
      } else {
        table[home].drawn += 1; table[away].drawn += 1; table[home].points += 1; table[away].points += 1;
      }
    });

  return Object.values(table)
    .map((team) => ({ ...team, goalDifference: team.goalsFor - team.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team, "tr"));
}

function deriveScorers(fixtures) {
  const totals = {};
  (fixtures || []).forEach((match) => {
    getEvents(match)
      .filter((event) => GOAL_EVENT_TYPES.has(event.type))
      .forEach((event) => {
        const playerName = event.playerName || event.name || event.player;
        const team = event.team || event.teamName;
        if (!playerName || !team) return;
        const playerId = event.playerId || playerName;
        const key = `${team}-${playerId}`;
        if (!totals[key]) totals[key] = { id: key, playerName, team, shirtNumber: event.shirtNumber || "", goals: 0 };
        totals[key].goals += 1;
      });
  });
  return Object.values(totals).sort((a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName, "tr"));
}

function formatDate(date, long = false) {
  if (!date) return "Tarih açıklanacak";
  try {
    return new Intl.DateTimeFormat("tr-TR", long
      ? { day: "2-digit", month: "long", weekday: "long" }
      : { day: "2-digit", month: "short", weekday: "short" })
      .format(new Date(`${date}T12:00:00`));
  } catch {
    return date;
  }
}

function getMinute(match, now, halfDurationMinutes) {
  if (!match || match.live !== true) return "";
  let elapsed = Math.max(0, safeNumber(match.elapsedSeconds));
  if (match.timerRunning === true && match.timerStartedAt) {
    const numeric = Number(match.timerStartedAt);
    const startedAt = Number.isFinite(numeric) ? numeric : Date.parse(match.timerStartedAt);
    if (Number.isFinite(startedAt)) elapsed += Math.max(0, Math.floor((now - startedAt) / 1000));
  }
  const base = Math.ceil(elapsed / 60);
  const phase = match.matchPhase || "";
  return `${Math.max(1, base + (phase === "second_half" ? safeNumber(halfDurationMinutes, 25) : 0))}'`;
}

function scoreText(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function stageText(match, fallbackIndex = 0) {
  if (match?.stageLabel) return match.stageLabel;
  if (match?.isKnockout) return "ELEME";
  return match?.week ? `${match.week}. HAFTA` : `${fallbackIndex + 1}. HAFTA`;
}

function statusText(match) {
  if (match?.live === true && match?.played !== true) return "CANLI";
  if (match?.played === true) return "MS";
  return match?.time || "SAAT BEKLENİYOR";
}

function MatchDetailModal({ match, onClose, now, halfDurationMinutes }) {
  if (!match) return null;
  const events = getEvents(match).slice().reverse();
  const penaltyEvents = getEvents(match).filter((event) => ["penalty_shootout_goal", "penalty_shootout_miss"].includes(event.type));
  const homePenaltyEvents = penaltyEvents.filter((event) => event.team === match.home || event.side === "home");
  const awayPenaltyEvents = penaltyEvents.filter((event) => event.team === match.away || event.side === "away");
  const matchEvents = events.filter((event) => !["penalty_shootout_goal", "penalty_shootout_miss"].includes(event.type));
  const liveMinute = getMinute(match, now, halfDurationMinutes);
  const showScore = match.live === true || match.played === true;
  return (
    <div className="public-modal-backdrop" onMouseDown={onClose}>
      <div className="public-match-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="public-modal-close" onClick={onClose} aria-label="Kapat">×</button>
        <div className="public-modal-eyebrow">{stageText(match)} • {formatDate(match.date, true)}</div>
        <div className="public-modal-status">
          <span className={match.live ? "live" : match.played ? "finished" : "scheduled"}>{match.live ? `● CANLI ${liveMinute}` : match.played ? "MAÇ SONU" : match.time || "PROGRAM"}</span>
        </div>
        <div className="public-modal-score">
          <strong>{match.home}</strong>
          <div>{showScore ? <><b>{scoreText(match.homeScore)}</b><em>:</em><b>{scoreText(match.awayScore)}</b></> : <span>VS</span>}</div>
          <strong>{match.away}</strong>
        </div>
        {(match.homePenalties != null || match.awayPenalties != null) && match.isKnockout && (
          <div className="public-modal-pen">PEN {safeNumber(match.homePenalties)} - {safeNumber(match.awayPenalties)}</div>
        )}
        {penaltyEvents.length > 0 && (
          <div className="public-modal-penalty-list">
            <b>⚽ PENALTILAR</b>
            <div className="public-modal-penalty-teams">
              {[
                { team: match.home, events: homePenaltyEvents, side: "home" },
                { team: match.away, events: awayPenaltyEvents, side: "away" },
              ].map((group) => (
                <div className={`public-modal-penalty-team ${group.side}`} key={group.side}>
                  <h4>{group.team}</h4>
                  {group.events.length === 0 ? (
                    <div className="public-modal-penalty-empty">Henüz atış yok</div>
                  ) : group.events.map((event) => (
                    <div className="public-modal-penalty-row" key={`pen-${event.id}`}>
                      <span>{event.shirtNumber ? `${event.shirtNumber} ` : ""}{event.player} <small>PEN.</small></span>
                      <strong className={event.type === "penalty_shootout_goal" ? "ok" : "miss"}>{event.type === "penalty_shootout_goal" ? "✓" : "✕"}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="public-modal-place">📍 {match.field || "Gol Park Halı Saha"} {match.time ? `• ${match.time}` : ""}</div>
        <div className="public-modal-divider" />
        <div className="public-modal-events-title"><span>MAÇ OLAYLARI</span><b>{matchEvents.length}</b></div>
        {matchEvents.length === 0 ? (
          <div className="public-modal-empty">{match.played ? "Bu maç için kayıtlı gol/kart olayı bulunmuyor." : "Maç başladığında goller ve kartlar burada görünecek."}</div>
        ) : (
          <div className="public-modal-events">
            {matchEvents.map((event) => (
              <div className="public-modal-event" key={event.id}>
                <span className="public-modal-event-minute">{event.minute !== "" ? `${event.minute}'` : "•"}</span>
                <span className="public-modal-event-icon">{event.icon}</span>
                <div><b>{event.label}</b><strong>{event.player}</strong><small>{event.team}</small></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PublicTournament({ teams = [], fixtures = [], standings = [], goalScorers = [], settings = {} }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [remoteFixtures, setRemoteFixtures] = useState([]);
  const [remoteKnockout, setRemoteKnockout] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [lastSync, setLastSync] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;

    const [fixturesResult, knockoutResult] = await Promise.allSettled([
      supabase.from("fixtures").select("*").order("id"),
      supabase.from("app_state").select("value,updated_at").eq("id", "knockout").maybeSingle(),
    ]);

    // Yavaş kalan eski bir istek, yeni verinin üstüne yazamasın.
    if (sequence !== refreshSequence.current) return;

    let mappedFixtures = null;
    let stagedKnockout = null;

    if (fixturesResult.status === "fulfilled") {
      const { data, error } = fixturesResult.value;
      if (!error && Array.isArray(data)) {
        mappedFixtures = data.map(mapCloudFixture);
        setRemoteFixtures(mappedFixtures);
      }
    }

    if (knockoutResult.status === "fulfilled") {
      const { data: knockoutRow, error: knockoutError } = knockoutResult.value;
      if (!knockoutError) {
        const value = knockoutRow?.value && typeof knockoutRow.value === "object" ? knockoutRow.value : {};
        const cloudUpdatedAt = knockoutRow?.updated_at || "";
        stagedKnockout = [
          ...(Array.isArray(value.quarter) ? value.quarter.map((m, i) => ({ ...m, knockoutKey: `quarter-${i}`, stageLabel: "ÇEYREK FİNAL" })) : []),
          ...(Array.isArray(value.semi) ? value.semi.map((m, i) => ({ ...m, knockoutKey: `semi-${i}`, stageLabel: "YARI FİNAL" })) : []),
          ...(value.finalMatch ? [{ ...value.finalMatch, knockoutKey: "final-0", stageLabel: "FİNAL" }] : []),
          ...(value.thirdPlace ? [{ ...value.thirdPlace, knockoutKey: "third-place-0", stageLabel: "3.'LÜK MAÇI" }] : []),
        ].filter((m) => m?.home && m?.away).map((m, i) => ({
          ...m,
          id: m.id || `ko-${m.knockoutKey || i}`,
          isKnockout: true,
          played: m.played === true,
          live: m.live === true && m.played !== true && m.matchPhase !== "completed",
          homePenalties: m.homePenalties ?? m.homePen ?? "",
          awayPenalties: m.awayPenalties ?? m.awayPen ?? "",
          events: Array.isArray(m.events) ? m.events : [],
          field: m.field || m.pitch || "Saha 1",
          cloudUpdatedAt: m.updated_at || m.updatedAt || cloudUpdatedAt,
        }));
        setRemoteKnockout(stagedKnockout);
      }
    }

    setLastSync(new Date());

    // Açık maç detayını da canlı veriyle güncelle. Eski maç nesnesine kilitlenmesin.
    setSelectedMatch((current) => {
      if (!current) return current;
      const candidates = [
        ...(mappedFixtures || []),
        ...(stagedKnockout || []),
      ];
      const updated = candidates.find((m) =>
        (current.knockoutKey && m.knockoutKey === current.knockoutKey) ||
        String(m.id) === String(current.id)
      );
      return updated || null;
    });
  }, []);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 2000);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    const channel = supabase
      .channel(`sscup-public-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fixtures" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout" }, refresh)
      .subscribe();

    return () => {
      refreshSequence.current += 1;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedMatch) return undefined;
    const handler = (event) => { if (event.key === "Escape") setSelectedMatch(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedMatch]);

  const leagueFixtures = remoteFixtures.length > 0 ? remoteFixtures : fixtures;
  const localKnockout = (fixtures || []).filter((match) => match?.isKnockout === true);
  const rawKnockoutMatches = remoteKnockout.length > 0 ? remoteKnockout : localKnockout;

  // Takipçi eleme kurası çekildiği anda bütün yolu görsün. Henüz sonucu
  // belli olmayan eşleşmeler "ÇF 1 Galibi" / "YF 1 Mağlubu" şeklinde kalır.
  const byKoKey = new Map(rawKnockoutMatches.map((m) => [m.knockoutKey, m]));
  const koWinner = (match, home, away) => {
    if (!match || match.played !== true) return "";
    const hs = safeNumber(match.homeScore);
    const as = safeNumber(match.awayScore);
    if (hs > as) return home;
    if (as > hs) return away;
    const hp = safeNumber(match.homePenalties ?? match.homePen);
    const ap = safeNumber(match.awayPenalties ?? match.awayPen);
    if (hp > ap) return home;
    if (ap > hp) return away;
    return "";
  };
  const koLoser = (match, home, away) => {
    const winner = koWinner(match, home, away);
    if (!winner) return "";
    return winner === home ? away : home;
  };
  const q = [0,1,2,3].map((i) => byKoKey.get(`quarter-${i}`)).filter(Boolean);
  const qTeams = [0,1,2,3].map((i) => {
    const m = byKoKey.get(`quarter-${i}`);
    return { home: m?.home || `ÇF ${i + 1} Takım 1`, away: m?.away || `ÇF ${i + 1} Takım 2`, winner: koWinner(m, m?.home, m?.away) };
  });
  const semiPairs = [
    { home: qTeams[0].winner || "ÇF 1 Galibi", away: qTeams[2].winner || "ÇF 3 Galibi" },
    { home: qTeams[1].winner || "ÇF 2 Galibi", away: qTeams[3].winner || "ÇF 4 Galibi" },
  ];
  const semi0 = byKoKey.get("semi-0");
  const semi1 = byKoKey.get("semi-1");
  const s0w = koWinner(semi0, semiPairs[0].home, semiPairs[0].away);
  const s1w = koWinner(semi1, semiPairs[1].home, semiPairs[1].away);
  const s0l = koLoser(semi0, semiPairs[0].home, semiPairs[0].away);
  const s1l = koLoser(semi1, semiPairs[1].home, semiPairs[1].away);

  const knockoutMatches = rawKnockoutMatches.length === 0 ? [] : [
    ...[0,1,2,3].map((i) => ({ ...(byKoKey.get(`quarter-${i}`) || {}), id: byKoKey.get(`quarter-${i}`)?.id || `ko-quarter-${i}`, knockoutKey: `quarter-${i}`, isKnockout: true, stageLabel: "ÇEYREK FİNAL", home: qTeams[i].home, away: qTeams[i].away })),
    { ...(semi0 || {}), id: semi0?.id || "ko-semi-0", knockoutKey: "semi-0", isKnockout: true, stageLabel: "YARI FİNAL", home: semiPairs[0].home, away: semiPairs[0].away },
    { ...(semi1 || {}), id: semi1?.id || "ko-semi-1", knockoutKey: "semi-1", isKnockout: true, stageLabel: "YARI FİNAL", home: semiPairs[1].home, away: semiPairs[1].away },
    { ...(byKoKey.get("third-place-0") || {}), id: byKoKey.get("third-place-0")?.id || "ko-third-place-0", knockoutKey: "third-place-0", isKnockout: true, stageLabel: "3.'LÜK MAÇI", home: s0l || "YF 1 Mağlubu", away: s1l || "YF 2 Mağlubu" },
    { ...(byKoKey.get("final-0") || {}), id: byKoKey.get("final-0")?.id || "ko-final-0", knockoutKey: "final-0", isKnockout: true, stageLabel: "FİNAL", home: s0w || "YF 1 Galibi", away: s1w || "YF 2 Galibi" },
  ];
  const knockoutKeys = new Set(knockoutMatches.map((m) => m.knockoutKey).filter(Boolean));
  const displayFixtures = [
    ...leagueFixtures.filter((m) => !m?.isKnockout || !knockoutKeys.has(m.knockoutKey)),
    ...knockoutMatches,
  ];
  const liveMatches = displayFixtures
    .filter((match) => match?.live === true && match?.played !== true)
    .slice()
    .sort((a, b) => {
      const updatedA = Date.parse(a.cloudUpdatedAt || "") || 0;
      const updatedB = Date.parse(b.cloudUpdatedAt || "") || 0;
      if (updatedA !== updatedB) return updatedB - updatedA;
      const startedA = Number(a.timerStartedAt) || Date.parse(a.timerStartedAt || "") || 0;
      const startedB = Number(b.timerStartedAt) || Date.parse(b.timerStartedAt || "") || 0;
      if (startedA !== startedB) return startedB - startedA;
      return `${b.date || ""} ${b.time || ""}`.localeCompare(`${a.date || ""} ${a.time || ""}`);
    });
  const liveMatch = liveMatches[0] || null;
  const upcoming = displayFixtures
    .filter((match) => match?.played !== true && match?.live !== true)
    .slice()
    .sort((a, b) => `${a.date || "9999"} ${a.time || "99:99"}`.localeCompare(`${b.date || "9999"} ${b.time || "99:99"}`));
  const recent = displayFixtures.filter((match) => match?.played === true).slice().reverse().slice(0, 8);

  const nightMatches = useMemo(() => {
    const pool = displayFixtures.filter((m) => m?.date);
    if (pool.length === 0) return [];
    const activeDate = liveMatch?.date || upcoming[0]?.date || recent[0]?.date || pool[0].date;
    return pool
      .filter((m) => m.date === activeDate)
      .slice()
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
      .slice(0, 4);
  }, [displayFixtures, liveMatch?.date, upcoming, recent]);

  const liveStandings = useMemo(() => {
    const calculated = calculateStandings(teams, displayFixtures);
    return calculated.length > 0 ? calculated : standings;
  }, [teams, displayFixtures, standings]);

  const liveScorers = useMemo(() => {
    const calculated = deriveScorers(displayFixtures);
    return calculated.length > 0 ? calculated : goalScorers;
  }, [displayFixtures, goalScorers]);

  const leader = liveStandings[0];
  const topScorer = liveScorers[0];
  const liveEvents = liveMatch ? getEvents(liveMatch).slice().reverse() : [];
  const lastGoal = liveEvents.find((event) => GOAL_EVENT_TYPES.has(event.type));
  const minute = getMinute(liveMatch, now, settings.halfDurationMinutes || 25);
  const playedCount = displayFixtures.filter((match) => match?.played === true).length;
  const tournamentName = settings.tournamentName || settings.title || "S&S CUP";

  // Final tamamlandığında takip ekranının tepesinde şampiyonu otomatik göster.
  // Canlı maç / senkron mantığına dokunmaz; yalnızca tamamlanmış final verisini okur.
  const finalMatch = knockoutMatches.find((match) => match.knockoutKey === "final-0");
  const championName = finalMatch?.played === true
    ? koWinner(finalMatch, finalMatch.home, finalMatch.away)
    : "";
  const finalWentToPenalties = finalMatch?.played === true
    && safeNumber(finalMatch.homeScore) === safeNumber(finalMatch.awayScore)
    && (safeNumber(finalMatch.homePenalties ?? finalMatch.homePen) !== safeNumber(finalMatch.awayPenalties ?? finalMatch.awayPen));

  return (
    <div className="public-live-page">
      <div className="public-stadium-light light-left" />
      <div className="public-stadium-light light-right" />
      <header className="public-live-header">
        <div className="public-brand-block">
          <div className="public-brand-mark">🏆</div>
          <div><span className="public-kicker">RESMİ CANLI TURNUVA MERKEZİ</span><h1>{tournamentName}</h1><p>{settings.slogan || "Kazanan Sahada Belli Olur"}</p></div>
        </div>
        <div className="public-header-meta"><span>{settings.season || "2026"}</span><span>📍 {settings.venue || "Gol Park"}</span><span className="public-sync-dot">● CANLI VERİ</span></div>
      </header>

      <main className="public-live-shell">
        {championName && (
          <section className="public-champion-banner">
            <div className="public-champion-crown">🏆</div>
            <div className="public-champion-copy">
              <span>S&S CUP ŞAMPİYONU</span>
              <h2>{championName}</h2>
              <strong>{settings.season || "2026"} ŞAMPİYONU</strong>
            </div>
            <div className="public-champion-final">
              <small>FİNAL</small>
              <div><b>{finalMatch.home}</b><strong>{scoreText(finalMatch.homeScore)} - {scoreText(finalMatch.awayScore)}</strong><b>{finalMatch.away}</b></div>
              {finalWentToPenalties && <em>PEN {safeNumber(finalMatch.homePenalties ?? finalMatch.homePen)} - {safeNumber(finalMatch.awayPenalties ?? finalMatch.awayPen)}</em>}
            </div>
          </section>
        )}

        {liveMatch && (
          <section className="public-live-scoreboard public-clickable" onClick={() => setSelectedMatch(liveMatch)}>
            <div className="public-scoreboard-topline"><div className="public-live-pill"><i /> CANLI</div><div className="public-match-status">{minute || "CANLI"}</div><div className="public-stage-label">{stageText(liveMatch)}</div></div>
            <div className="public-score-grid">
              <div className="public-score-team home"><span>EV SAHİBİ</span><strong>{liveMatch.home}</strong></div>
              <div className="public-score-center"><div className="public-score-numbers"><b>{scoreText(liveMatch.homeScore)}</b><em>:</em><b>{scoreText(liveMatch.awayScore)}</b></div><small>{liveMatch.time || ""} {liveMatch.field ? `• ${liveMatch.field}` : ""}</small></div>
              <div className="public-score-team away"><span>DEPLASMAN</span><strong>{liveMatch.away}</strong></div>
            </div>
            {lastGoal && <div className="public-last-goal"><span>⚽</span><div><b>SON GOL</b><strong>{lastGoal.player}</strong><small>{lastGoal.team}{lastGoal.minute !== "" ? ` • ${lastGoal.minute}'` : ""}</small></div></div>}
            <div className="public-tap-hint">Maç olaylarını görmek için tıkla ›</div>
          </section>
        )}

        <section className="public-stat-grid public-stat-grid-top">
          <article><span>👥</span><div><strong>{teams.length}</strong><b>TAKIM</b><small>Mücadele ediyor</small></div></article>
          <article><span>⚽</span><div><strong>{playedCount}</strong><b>OYNANAN MAÇ</b><small>Toplam</small></div></article>
          <article><span>🕘</span><div><strong>{upcoming.length}</strong><b>BEKLEYEN MAÇ</b><small>Yaklaşan</small></div></article>
          <article><span>👑</span><div><strong>{topScorer?.goals || 0}</strong><b>LİDER GOL</b><small>{topScorer?.playerName || topScorer?.name || "Gol Kralı"}</small></div></article>
        </section>

        <nav className="public-tabbar">
          {[["overview","⚡","Genel"],["fixtures","📅","Fikstür"],["standings","📊","Puan Durumu"],["scorers","👑","Gol Krallığı"],["knockout","🏆","Eleme Turları"]].map(([id, icon, label]) => (
            <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><span>{icon}</span>{label}</button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <div className="public-dashboard-grid">
            <div className="public-dashboard-main">
              <section className="public-section public-night-panel">
                <div className="public-section-head public-section-head-line"><div><span>MAÇ MERKEZİ</span><h2>Gecenin Maçları</h2></div>{nightMatches[0]?.date && <b>{formatDate(nightMatches[0].date, true)}</b>}</div>
                {nightMatches.length === 0 ? <div className="public-empty-box">Bu gece için planlanmış maç bulunmuyor.</div> : (
                  <div className="public-night-list">
                    {nightMatches.map((match, index) => (
                      <button key={match.id || index} className={`public-night-row ${match.live ? "is-live" : ""} ${match.played ? "is-finished" : ""}`} onClick={() => setSelectedMatch(match)}>
                        <div className="public-night-clock"><strong>{match.live ? "CANLI" : match.played ? "MS" : match.time || "--:--"}</strong><small>{formatDate(match.date)}</small></div>
                        <div className="public-night-team home"><strong>{match.home}</strong></div>
                        <div className="public-night-vs">{match.live || match.played ? `${scoreText(match.homeScore)} - ${scoreText(match.awayScore)}` : "VS"}</div>
                        <div className="public-night-team away"><strong>{match.away}</strong></div>
                        <div className="public-night-field">⚑ {match.field || "Saha 1"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="public-section public-results-panel">
                <div className="public-section-head"><div><span>SON DÜDÜK</span><h2>Sonuçlanan Maçlar</h2></div><b>Maça tıkla • olayları gör</b></div>
                {recent.length === 0 ? <div className="public-empty-box public-results-empty"><span>🏆</span><strong>Henüz oynanan maç bulunmuyor.</strong><small>Maçlar tamamlandıkça burada görünecektir.</small></div> : <div className="public-results-list">{recent.map((match,index) => <button key={match.id || index} onClick={() => setSelectedMatch(match)}><div><span>{formatDate(match.date)} {match.time || ""}</span><small>{stageText(match,index)}</small></div><strong>{match.home}</strong><b>{scoreText(match.homeScore)} - {scoreText(match.awayScore)}</b><strong>{match.away}</strong><em>MS ›</em></button>)}</div>}
              </section>
            </div>

            <aside className="public-dashboard-side">
              <section className="public-side-card">
                <div className="public-side-title">PUAN DURUMU</div>
                <div className="public-side-table-wrap"><table className="public-side-table"><thead><tr><th>#</th><th>TAKIM</th><th>O</th><th>G</th><th>B</th><th>M</th><th>P</th><th>AV</th></tr></thead><tbody>
                  {liveStandings.slice(0,10).map((team, index) => <tr key={team.team}><td><span className={`public-mini-rank rank-${index + 1}`}>{index + 1}</span></td><td><strong>{team.team}</strong></td><td>{team.played}</td><td>{team.won}</td><td>{team.drawn}</td><td>{team.lost}</td><td><b>{team.points}</b></td><td>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</td></tr>)}
                </tbody></table></div>
              </section>

              <section className="public-side-card">
                <div className="public-side-title">GOL KRALLIĞI</div>
                {liveScorers.length === 0 ? <div className="public-side-empty">Henüz gol kaydı yok.</div> : <div className="public-mini-scorers">{liveScorers.slice(0,5).map((p,index) => <div key={p.id || index}><span>{index+1}</span><strong>{p.playerName || p.name}<small>{p.team}</small></strong><b>{p.goals}</b></div>)}</div>}
              </section>
            </aside>
          </div>
        )}

        {activeTab === "fixtures" && (
          <section className="public-section">
            <div className="public-section-head"><div><span>MAÇ MERKEZİ</span><h2>Fikstür</h2></div><b>{upcoming.length} karşılaşma</b></div>
            {upcoming.length === 0 ? <div className="public-empty-box">Planlanmış yeni maç bulunmuyor.</div> : (
              <div className="public-fixture-grid">{upcoming.slice(0, 40).map((match, index) => (
                <button className="public-fixture-card" key={match.id || index} onClick={() => setSelectedMatch(match)}>
                  <div className="public-fixture-meta"><span>{stageText(match, index)}</span><b>{formatDate(match.date)} • {match.time || "Saat açıklanacak"}</b></div>
                  <div className="public-fixture-teams"><strong>{match.home}</strong><span>VS</span><strong>{match.away}</strong></div>
                  <div className="public-fixture-place">📍 {match.field || settings.venue || "Gol Park Halı Saha"}<i>Detay ›</i></div>
                </button>
              ))}</div>
            )}
          </section>
        )}

        {activeTab === "standings" && (
          <section className="public-section public-table-section">
            <div className="public-section-head"><div><span>LİG TABLOSU</span><h2>Puan Durumu</h2></div><b>İlk 8 eleme hattı</b></div>
            <div className="public-table-wrap"><table className="public-standings-table"><thead><tr><th>#</th><th>TAKIM</th><th>O</th><th>G</th><th>B</th><th>M</th><th>A</th><th>Y</th><th>AV</th><th>P</th></tr></thead><tbody>
              {liveStandings.map((team, index) => <tr key={team.team} className={index < 8 ? "qualification" : ""}><td><span className={`public-rank rank-${index + 1}`}>{index + 1}</span></td><td><strong>{team.team}</strong>{index === 7 && <small className="public-cutoff">ELEME ÇİZGİSİ</small>}</td><td>{team.played}</td><td>{team.won}</td><td>{team.drawn}</td><td>{team.lost}</td><td>{team.goalsFor}</td><td>{team.goalsAgainst}</td><td>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</td><td className="points">{team.points}</td></tr>)}
            </tbody></table></div>
          </section>
        )}

        {activeTab === "scorers" && (
          <section className="public-section">
            <div className="public-section-head"><div><span>BİREYSEL PERFORMANS</span><h2>Gol Krallığı</h2></div><b>Altın ayakkabı yarışı</b></div>
            {liveScorers.length === 0 ? <div className="public-empty-box">Gol krallığı henüz oluşmadı.</div> : <>
              <div className="public-podium">{[1,0,2].map((sourceIndex, podiumIndex) => { const p = liveScorers[sourceIndex]; if (!p) return <div key={podiumIndex} className="public-podium-card empty" />; const medal = sourceIndex === 0 ? "🥇" : sourceIndex === 1 ? "🥈" : "🥉"; return <article key={p.id || sourceIndex} className={`public-podium-card place-${sourceIndex + 1}`}><div className="public-medal">{medal}</div><span>{sourceIndex + 1}. SIRA</span><strong>{p.playerName || p.name}</strong><small>{p.team}</small><b>⚽ {p.goals} GOL</b></article>; })}</div>
              {liveScorers.length > 3 && <div className="public-scorer-list">{liveScorers.slice(3,10).map((p,index) => <div key={p.id || index}><span>{index+4}</span><strong>{p.playerName || p.name}<small>{p.team}</small></strong><b>⚽ {p.goals}</b></div>)}</div>}
            </>}
          </section>
        )}

        {activeTab === "knockout" && (
          <section className="public-section public-knockout-section">
            <div className="public-section-head"><div><span>ŞAMPİYONLUK YOLU</span><h2>🏆 Eleme Turları</h2></div><b>Çeyrek Final • Yarı Final • 3.'lük • Final</b></div>
            {knockoutMatches.length === 0 ? <div className="public-empty-box">Eleme eşleşmeleri henüz oluşmadı.</div> : (
              <div className="public-knockout-stages">
                {["ÇEYREK FİNAL", "YARI FİNAL", "3.'LÜK MAÇI", "FİNAL"].map((stage) => {
                  const matches = knockoutMatches.filter((m) => stageText(m) === stage);
                  if (!matches.length) return null;
                  return <div className="public-knockout-stage" key={stage}><h3>{stage}</h3><div className="public-knockout-grid">{matches.map((match, index) => (
                    <button className={`public-knockout-card ${match.live ? "is-live" : ""}`} key={match.knockoutKey || match.id || index} onClick={() => setSelectedMatch(match)}>
                      <div className="public-ko-meta"><span>{match.live ? "● CANLI" : match.played ? "MS" : match.time || "PROGRAM"}</span><small>{formatDate(match.date)} {match.field ? `• ${match.field}` : ""}</small></div>
                      <div className="public-ko-team"><strong>{match.home}</strong><b>{match.live || match.played ? scoreText(match.homeScore) : ""}</b></div>
                      <div className="public-ko-team"><strong>{match.away}</strong><b>{match.live || match.played ? scoreText(match.awayScore) : ""}</b></div>
                      {(match.homePenalties !== "" || match.awayPenalties !== "") && <div className="public-ko-pen">PEN {safeNumber(match.homePenalties)} - {safeNumber(match.awayPenalties)}</div>}
                      <div className="public-tap-hint">Goller • kartlar • penaltılar ›</div>
                    </button>
                  ))}</div></div>;
                })}
              </div>
            )}
          </section>
        )}

        <footer className="public-live-footer"><div><b>{tournamentName}</b><span>{settings.slogan || "Kazanan Sahada Belli Olur"}</span></div><small>{lastSync ? `Son veri: ${lastSync.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Canlı veri bağlantısı kuruluyor…"}</small></footer>
      </main>

      <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} now={now} halfDurationMinutes={settings.halfDurationMinutes || 25} />
    </div>
  );
}
