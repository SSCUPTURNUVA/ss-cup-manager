import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import "./PublicTournament.css";
import { normalizeFixtureDate, fixtureTimeMinutes, sortFixturesBySchedule } from "../utils/fixtureOrder";
import { MATCH_EVENT_PREFIX, applyMatchEventRowsToFixtures, fetchMatchEventRows } from "../utils/matchEventSync";

const GOAL_EVENT_TYPES = new Set(["goal", "own_goal", "penalty_goal", "penalty_shootout_goal", "scorer_record"]);
const SCORER_EVENT_TYPES = new Set(["goal", "penalty_goal", "scorer_record"]);

const EVENT_META = {
  goal: { icon: "âš½", label: "GOL" },
  penalty_goal: { icon: "ğŸ¥…", label: "PENALTI GOLÃœ" },
  own_goal: { icon: "ğŸ¥´", label: "KENDÄ° KALESÄ°NE" },
  penalty_shootout_goal: { icon: "âš½", label: "PENALTI GOLÃœ" },
  penalty_shootout_miss: { icon: "âŒ", label: "PENALTI KAÃ‡TI" },
  scorer_record: { icon: "âš½", label: "GOL" },
  assist: { icon: "ğŸ…°ï¸", label: "ASÄ°ST" },
  yellow_card: { icon: "ğŸŸ¨", label: "SARI KART" },
  red_card: { icon: "ğŸŸ¥", label: "KIRMIZI KART" },
  substitution: { icon: "ğŸ”„", label: "DEÄÄ°ÅÄ°KLÄ°K" },
  penalty_miss: { icon: "âŒ", label: "PENALTI KAÃ‡TI" },
  injury: { icon: "ğŸ¤•", label: "SAKATLIK" },
};

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeEvent(event, index) {
  const type = event?.type || event?.eventType || event?.kind || "goal";
  const meta = EVENT_META[type] || { icon: "â€¢", label: String(type).toUpperCase() };
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
    playerOutName: event?.playerOutName || event?.playerName || event?.player || event?.name || "",
    playerInName: event?.playerInName || event?.secondPlayerName || "",
  };
}

function getEvents(match) {
  const deletedSet = new Set((Array.isArray(match?.deletedEventIds) ? match.deletedEventIds : []).map(String));
  const events = (Array.isArray(match?.events) ? match.events : [])
    .filter((event) => !deletedSet.has(String(event?.id ?? "")));
  const directGoals = (Array.isArray(match?.goals) ? match.goals : [])
    .filter((goal) => !deletedSet.has(String(goal?.id ?? "")));
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
  // MaÃ§ merkezine alÄ±nmÄ±ÅŸ olmak tek baÅŸÄ±na CANLI deÄŸildir.
  // YalnÄ±z devre/penaltÄ± gerÃ§ekten baÅŸladÄ±ysa canlÄ± sayÄ±lÄ±r; waiting/null fikstÃ¼rde kalÄ±r.
  // AyrÄ±ca fikstÃ¼r tarihi henÃ¼z gelmemiÅŸ bir maÃ§ eski bir test kaydÄ± yÃ¼zÃ¼nden CANLI kalamaz.
  const activePhases = new Set(["first_half", "halftime", "second_half", "penalty"]);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isFutureFixture = Boolean(item.date && String(item.date).slice(0, 10) > todayKey);
  const live = item.live === true && !played && !isFutureFixture && activePhases.has(item.match_phase);
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
    // CANLI lig maÃ§Ä±, yalnÄ±z izleyici ekranÄ±ndaki geÃ§ici puan durumuna dahil edilir.
    // Supabase'e puan/standings yazÄ±lmaz; maÃ§ bitince played sonucu normal ÅŸekilde devralÄ±r.
    .filter((match) => match?.isKnockout !== true && (match?.played === true || match?.live === true))
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

function canonicalTeamName(name) {
  const raw = String(name || "").trim();
  const normalized = raw.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9Ã§ÄŸÄ±Ã¶ÅŸÃ¼]+/gi, " ").trim();
  if (normalized === "cmt insaat" || normalized === "cmt inÅŸaat") return "Cem TaÅŸ CMT Ä°nÅŸaat";
  return raw;
}

function deriveScorers(fixtures) {
  const totals = {};
  (fixtures || []).forEach((match) => {
    const phase = match?.matchPhase || match?.match_phase || "waiting";
    const countsForStats =
      match?.played === true ||
      (match?.live === true && ["first_half", "halftime", "second_half", "penalty"].includes(phase));
    if (!countsForStats) return;

    getEvents(match)
      .filter((event) => SCORER_EVENT_TYPES.has(event.type))
      .forEach((event) => {
        const playerName = event.playerName || event.name || event.player;
        const team = canonicalTeamName(event.team || event.teamName);
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
  if (!date) return "Tarih aÃ§Ä±klanacak";
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
  return `${Math.max(1, base + (phase === "second_half" ? safeNumber(halfDurationMinutes, 30) : 0))}'`;
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
  return match?.time || "SAAT BEKLENÄ°YOR";
}

function knockoutLiveBadges(match) {
  if (!match?.isKnockout || match?.live !== true || match?.played === true) return null;

  const hs = safeNumber(match.homeScore);
  const as = safeNumber(match.awayScore);
  const hp = safeNumber(match.homePenalties ?? match.homePen);
  const ap = safeNumber(match.awayPenalties ?? match.awayPen);
  const penaltiesActive = hs === as && (hp > 0 || ap > 0);
  const homeValue = penaltiesActive ? hp : hs;
  const awayValue = penaltiesActive ? ap : as;

  if (homeValue === awayValue) {
    return { balanced: true, home: null, away: null };
  }

  const homeAhead = homeValue > awayValue;
  const key = String(match.knockoutKey || "");
  const stage = String(match.stageLabel || "").toLocaleUpperCase("tr-TR");
  const isQuarter = key.startsWith("quarter-") || stage.includes("Ã‡EYREK");
  const isSemi = key.startsWith("semi-") || stage.includes("YARI");
  const isFinal = key === "final-0" || (stage.includes("FÄ°NAL") && !stage.includes("YARI"));
  const isThird = key.startsWith("third-place") || stage.includes("3.") || stage.includes("ÃœÃ‡ÃœNC");

  if (isQuarter) {
    return { balanced: false, home: homeAhead ? { icon: "â†—", text: "YarÄ± Finale", tone: "gold" } : null, away: !homeAhead ? { icon: "â†—", text: "YarÄ± Finale", tone: "gold" } : null };
  }
  if (isSemi) {
    return {
      balanced: false,
      home: homeAhead ? { icon: "ğŸ†", text: "Finale", tone: "gold" } : { icon: "ğŸ¥‰", text: "3.'lÃ¼k MaÃ§Ä±na", tone: "bronze" },
      away: !homeAhead ? { icon: "ğŸ†", text: "Finale", tone: "gold" } : { icon: "ğŸ¥‰", text: "3.'lÃ¼k MaÃ§Ä±na", tone: "bronze" },
    };
  }
  if (isFinal) {
    return { balanced: false, home: homeAhead ? { icon: "ğŸ‘‘", text: "ÅampiyonluÄŸa", tone: "gold" } : null, away: !homeAhead ? { icon: "ğŸ‘‘", text: "ÅampiyonluÄŸa", tone: "gold" } : null };
  }
  if (isThird) {
    return { balanced: false, home: homeAhead ? { icon: "ğŸ¥‰", text: "3.'lÃ¼ÄŸe", tone: "bronze" } : null, away: !homeAhead ? { icon: "ğŸ¥‰", text: "3.'lÃ¼ÄŸe", tone: "bronze" } : null };
  }
  return null;
}

// V6: Salt okunur canlÄ± saha. KaydedilmiÅŸ ilk 7 ve maÃ§Ä±n oyuncu deÄŸiÅŸikliÄŸi
// olaylarÄ± kullanÄ±lÄ±r; Supabase'e hiÃ§bir yeni kayÄ±t yazÄ±lmaz.
function playerKey(value) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}
function getFeaturedStarters(match, squads, lineups, side) {
  if (!match) return [];
  const key = String(match.id ?? match.knockoutKey ?? `${match.home}-${match.away}-${match.week || "lig"}`);
  const savedIds = lineups?.[key]?.[side]?.starters;
  const team = side === "home" ? match.home : match.away;
  const roster = Array.isArray(squads?.[team]) ? squads[team] : [];
  if (!Array.isArray(savedIds)) return [];
  const players = savedIds.slice(0, 7).map(id => roster.find((p, i) => String(p?.id ?? p?.playerId ?? i) === String(id)) || null);
  const changes = getEvents(match).filter(e => e.type === "substitution" &&
    (playerKey(e.team) === playerKey(team) || (!e.team && e.side === side)));
  for (const event of changes) {
    const out = playerKey(event.playerOutName || event.player);
    const incoming = playerKey(event.playerInName);
    if (!out || !incoming) continue;
    const position = players.findIndex(p => p && playerKey(p.name || p.playerName) === out);
    const replacement = roster.find(p => playerKey(p?.name || p?.playerName) === incoming);
    if (position >= 0 && replacement) players[position] = replacement;
  }
  return players;
}

// V7: Olay deÄŸiÅŸimini yalnÄ±z izleyici tarafÄ±nda algÄ±lar; veri kaydetmez.
function usePitchEventFlash(match) {
  const [flash, setFlash] = useState(null);
  const lastSeen = useRef({ matchId: null, eventId: null });
  const events = match ? getEvents(match) : [];
  const latest = events.length ? events[events.length - 1] : null;
  const matchId = String(match?.id ?? match?.knockoutKey ?? "");
  const eventId = latest ? String(latest.id) : "";
  useEffect(() => {
    if (lastSeen.current.matchId !== matchId) {
      lastSeen.current = { matchId, eventId };
      setFlash(null);
      return;
    }
    if (lastSeen.current.eventId === eventId) return;
    lastSeen.current.eventId = eventId;
    if (!latest || match?.live !== true) { setFlash(null); return; }
    if (!["goal", "penalty_goal", "own_goal", "yellow_card", "red_card", "substitution"].includes(latest.type)) return;
    setFlash(latest);
    const timeout = window.setTimeout(() => setFlash(null), 4800);
    return () => window.clearTimeout(timeout);
  }, [matchId, eventId, match?.live]);
  return flash;
}

const V7_EVENT_CSS = `
@keyframes ss-v7-pop {0%{transform:translateY(9px);opacity:0}15%{transform:translateY(0);opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes ss-v7-pulse {0%,100%{box-shadow:0 0 0 0 rgba(255,210,35,.1)}50%{box-shadow:0 0 0 6px rgba(255,210,35,.4)}}
.ss-v7-banner{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:8px 0;padding:10px 12px;border-radius:12px;background:#172337;color:#fff;border:1px solid #f2c94c;text-align:center;animation:ss-v7-pop 4.8s ease both;font-size:clamp(12px,3vw,16px)}
.ss-v7-banner strong{color:#ffd23f}.ss-v7-banner small{color:#e3e7ee;font-size:inherit}
.ss-v7-highlight .ss-pitch-avatar,.ss-v7-highlight>span:first-child{outline:3px solid #ffda48;outline-offset:2px;animation:ss-v7-pulse 1.2s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){.ss-v7-banner,.ss-v7-highlight .ss-pitch-avatar,.ss-v7-highlight>span:first-child{animation:none}}
`;
function V7EventBanner({ event }) {
  if (!event) return null;
  const substitution = event.type === "substitution";
  const text = substitution
    ? `${event.playerOutName || event.player || "Oyuncu"} â†“  ${event.playerInName || "Oyuncu"} â†‘`
    : event.player;
  return <div className="ss-v7-banner" role="status" aria-live="polite">
    <strong>{event.icon} {event.label}</strong>
    <small>{event.minute !== "" ? `${event.minute}' â€¢ ` : ""}{text}{event.team ? ` â€¢ ${event.team}` : ""}</small>
  </div>;
}

function LivePitch({ match, squads, lineups }) {
  const flash = usePitchEventFlash(match);
  const home = getFeaturedStarters(match, squads, lineups, "home");
  const away = getFeaturedStarters(match, squads, lineups, "away");
  if (!home.some(Boolean) && !away.some(Boolean)) return (
    <div className="ss-pitch-pending"><style>{V7_EVENT_CSS}</style><V7EventBanner event={flash} />âš½ Saha diziliÅŸi, yÃ¶netim ilk 7 oyuncuyu belirlediÄŸinde burada gÃ¶rÃ¼necek.</div>
  );
  const renderSide = (players, side) => (
    <div className={`ss-pitch-side ss-pitch-${side}`}>
      {Array.from({ length: 7 }, (_, i) => {
        const p = players[i];
        const number = p?.shirtNumber ?? p?.number ?? "â€“";
        const name = p?.name || p?.playerName || "Oyuncu";
        const photo = p?.photoUrl || p?.photo || p?.imageUrl;
        const matching = flash && playerKey(flash.team) === playerKey(side === "home" ? match.home : match.away) && playerKey(flash.type === "substitution" ? flash.playerInName : flash.player) === playerKey(name);
        return <div className={`ss-pitch-player ${matching ? "ss-v7-highlight" : ""}`} key={`${side}-${i}`}>
          <div className="ss-pitch-avatar">{photo ? <><img src={photo} alt={name} loading="lazy" /><span className="ss-pitch-photo-number">{number}</span></> : <span>{p ? number : "Â·"}</span>}</div>
          <div className="ss-pitch-player-name" title={p ? name : ""}>{p ? name : "â€”"}</div>
        </div>;
      })}
    </div>
  );
  return <section className="ss-pitch-wrap" aria-label="CanlÄ± saha diziliÅŸi">
    <style>{V7_EVENT_CSS}</style>
    <div className="ss-pitch-header"><span>{match.home}</span><b>SAHADAKÄ° 7 â€¢ CANLI</b><span>{match.away}</span></div>
    <V7EventBanner event={flash} />
    <div className="ss-pitch-field"><div className="ss-pitch-midline"/><div className="ss-pitch-center-circle"/>{renderSide(home, "home")}{renderSide(away, "away")}</div>
    <div className="ss-pitch-caption">{home.filter(Boolean).length !== 7 || away.filter(Boolean).length !== 7 ? "Eksik kadro seÃ§imi var; boÅŸ konumlar gÃ¶steriliyor." : "KaydedilmiÅŸ ilk 7 ve oyuncu deÄŸiÅŸikliklerine gÃ¶re saha"}</div>
  </section>;
}

function MatchDetailModal({ match: sourceMatch, onClose, now, halfDurationMinutes, squads, lineups }) {
  // MaÃ§ detayÄ± aÃ§Ä±kken olay kayÄ±tlarÄ±nÄ± doÄŸrudan buluttan oku.
  // Ana fikstÃ¼r/snapshot yenilemesi gecikse bile aktif gol ve deÄŸiÅŸiklikler gÃ¶rÃ¼nÃ¼r.
  const [liveEventRows, setLiveEventRows] = useState(null);
  const sourceMatchId = String(sourceMatch?.id ?? "");
  const sourceKnockoutKey = String(sourceMatch?.knockoutKey ?? "");
  useEffect(() => {
    if (!sourceMatch) { setLiveEventRows(null); return undefined; }
    let disposed = false;
    let inFlight = false;
    setLiveEventRows(null);
    const readEvents = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const rows = await fetchMatchEventRows();
        if (!disposed) setLiveEventRows(rows);
      } catch (error) {
        console.warn("MaÃ§ detayÄ± olaylarÄ± okunamadÄ±:", error);
      } finally {
        inFlight = false;
      }
    };
    readEvents();
    const timer = window.setInterval(readEvents, 1000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [sourceMatchId, sourceKnockoutKey]);
  const match = useMemo(() => {
    if (!sourceMatch || !Array.isArray(liveEventRows)) return sourceMatch;
    return applyMatchEventRowsToFixtures([sourceMatch], liveEventRows)[0] || sourceMatch;
  }, [sourceMatch, liveEventRows]);
  const eventsContainerRef = useRef(null);
  const events = match ? getEvents(match) : [];
  const penaltyEvents = match ? getEvents(match).filter((event) => ["penalty_shootout_goal", "penalty_shootout_miss"].includes(event.type)) : [];
  const homePenaltyEvents = penaltyEvents.filter((event) => event.team === match.home || event.side === "home");
  const awayPenaltyEvents = penaltyEvents.filter((event) => event.team === match.away || event.side === "away");
  const matchEvents = events.filter((event) => !["penalty_shootout_goal", "penalty_shootout_miss"].includes(event.type));
  const latestEventId = matchEvents.length > 0 ? String(matchEvents[matchEvents.length - 1]?.id || "") : "";

  const findShirtNumber = (teamName, playerName, directNumber = "") => {
    if (directNumber !== "" && directNumber != null) return directNumber;
    if (!teamName || !playerName || !squads || typeof squads !== "object") return "";
    const normalize = (value) => String(value || "").trim().toLocaleLowerCase("tr-TR");
    const player = (Array.isArray(squads?.[teamName]) ? squads[teamName] : []).find((item) =>
      normalize(item?.name || item?.playerName) === normalize(playerName)
    );
    return player?.shirtNumber ?? player?.number ?? "";
  };

  useEffect(() => {
    if (!match || !eventsContainerRef.current || matchEvents.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const container = eventsContainerRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [match?.id, match?.knockoutKey, matchEvents.length, latestEventId]);

  // CanlÄ± maÃ§ detayÄ± aÃ§Ä±kken arka sayfanÄ±n kaymasÄ±nÄ± engelle.
  useEffect(() => {
    if (!match) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [match]);

  if (!match) return null;
  const liveMinute = getMinute(match, now, halfDurationMinutes);
  const showScore = match.live === true || match.played === true;
  return (
    <div className="public-modal-backdrop" onMouseDown={onClose}>
      <div className="public-match-modal" style={{ overflowY: "auto", overscrollBehaviorY: "contain" }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="public-modal-close" onClick={onClose} aria-label="Kapat">Ã—</button>
        <div className="public-modal-eyebrow">{stageText(match)} â€¢ {formatDate(match.date, true)}</div>
        <div className="public-modal-status">
          <span className={match.live ? "live" : match.played ? "finished" : "scheduled"}>{match.live ? `â— CANLI ${liveMinute}` : match.played ? "MAÃ‡ SONU" : match.time || "PROGRAM"}</span>
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
            <b>âš½ PENALTILAR</b>
            <div className="public-modal-penalty-teams">
              {[
                { team: match.home, events: homePenaltyEvents, side: "home" },
                { team: match.away, events: awayPenaltyEvents, side: "away" },
              ].map((group) => (
                <div className={`public-modal-penalty-team ${group.side}`} key={group.side}>
                  <h4>{group.team}</h4>
                  {group.events.length === 0 ? (
                    <div className="public-modal-penalty-empty">HenÃ¼z atÄ±ÅŸ yok</div>
                  ) : group.events.map((event) => (
                    <div className="public-modal-penalty-row" key={`pen-${event.id}`}>
                      <span>{findShirtNumber(event.team, event.player, event.shirtNumber) !== "" ? `#${findShirtNumber(event.team, event.player, event.shirtNumber)} ` : ""}{event.player} <small>PEN.</small></span>
                      <strong className={event.type === "penalty_shootout_goal" ? "ok" : "miss"}>{event.type === "penalty_shootout_goal" ? "âœ“" : "âœ•"}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        <LivePitch match={match} squads={squads} lineups={lineups} />
        <div className="public-modal-place">ğŸ“ {match.field || "Gol Park HalÄ± Saha"} {match.time ? `â€¢ ${match.time}` : ""}</div>
        <div className="public-modal-divider" />
        <div className="public-modal-events-title"><span>MAÃ‡ OLAYLARI</span><b>{matchEvents.length}</b></div>
        {matchEvents.length === 0 ? (
          <div className="public-modal-empty">{match.played ? "Bu maÃ§ iÃ§in kayÄ±tlÄ± gol/kart olayÄ± bulunmuyor." : "MaÃ§ baÅŸladÄ±ÄŸÄ±nda goller ve kartlar burada gÃ¶rÃ¼necek."}</div>
        ) : (
          <div className="public-modal-events" ref={eventsContainerRef} tabIndex={0}>
            {matchEvents.map((event) => (
              <div className="public-modal-event" key={event.id}>
                <span className="public-modal-event-minute">{event.minute !== "" ? `${event.minute}'` : "â€¢"}</span>
                <span className="public-modal-event-icon">{event.icon}</span>
                <div>
                  <b>{event.label}</b>
                  {event.type === "substitution" ? (
                    <>
                      <strong>Ã‡Ä±ktÄ±: {findShirtNumber(event.team, event.playerOutName || event.player, event.shirtNumber) !== "" ? `#${findShirtNumber(event.team, event.playerOutName || event.player, event.shirtNumber)} ` : ""}{event.playerOutName || event.player}</strong>
                      <small>Girdi: {findShirtNumber(event.team, event.playerInName, event.secondPlayerShirtNumber) !== "" ? `#${findShirtNumber(event.team, event.playerInName, event.secondPlayerShirtNumber)} ` : ""}{event.playerInName || "Oyuncu"} â€¢ {event.team}</small>
                    </>
                  ) : (
                    <>
                      <strong>{findShirtNumber(event.team, event.player, event.shirtNumber) !== "" ? `#${findShirtNumber(event.team, event.player, event.shirtNumber)} ` : ""}{event.player}</strong>
                      <small>{event.team}</small>
                    </>
                  )}
                </div>
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
  const [remoteFixtures, setRemoteFixtures] = useState(null);
  const [remoteTeams, setRemoteTeams] = useState(null);
  const [remoteSquads, setRemoteSquads] = useState(null);
  const [remoteLineups, setRemoteLineups] = useState({});
  const [remoteKnockout, setRemoteKnockout] = useState([]);
  const [remoteKnockoutDraw, setRemoteKnockoutDraw] = useState([]);
  const [remoteKnockoutSchedule, setRemoteKnockoutSchedule] = useState({});
  const [remoteSettings, setRemoteSettings] = useState(null);
  const [activeFixtureIds, setActiveFixtureIds] = useState(null);
  const [publicMatchCenterId, setPublicMatchCenterId] = useState("");
  const activeFixtureIdsRef = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [lastSync, setLastSync] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const refreshSequence = useRef(0);
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);

  const refreshTeams = useCallback(async () => {
    const { data, error } = await supabase
      .from("teams")
      .select("id,name")
      .order("id");

    if (!error && Array.isArray(data)) {
      setRemoteTeams(data.map((row) => row?.name).filter(Boolean));
    }
  }, []);

  const refresh = useCallback(async () => {
    // Telefonda aÄŸ 1 saniyeden yavaÅŸsa Ã¼st Ã¼ste refresh baÅŸlatmak eski kodda
    // her cevabÄ± iptal ediyordu. Tek istek bitsin, sonra yenisi baÅŸlasÄ±n.
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    refreshInFlight.current = true;
    refreshQueued.current = false;
    const sequence = ++refreshSequence.current;

    try {
      const [fixturesResult, appStateResult, eventRows] = await Promise.all([
        supabase.from("fixtures").select("*").order("id"),
        supabase.from("app_state")
          .select("id,value,updated_at")
          .in("id", ["squads", "match_lineups", "knockout", "knockout_draw_v1", "knockout_schedule_v1", "knockout_match_center_v1", "active_fixture_ids", "settings", "fixtures_snapshot", "public_match_center"]),
        fetchMatchEventRows(),
      ]);

      if (sequence !== refreshSequence.current) return;

      const stateRows = Array.isArray(appStateResult?.data) ? appStateResult.data : [];
      const stateById = new Map(stateRows.map((row) => [row.id, row]));
      const activeRow = stateById.get("active_fixture_ids");
      const ids = Array.isArray(activeRow?.value?.ids) ? activeRow.value.ids : null;
      activeFixtureIdsRef.current = ids;
      setActiveFixtureIds(ids);

      const activeIdSet = Array.isArray(ids) ? new Set(ids.map((id) => String(id))) : null;
      let mappedFixtures = null;

      if (!fixturesResult.error && Array.isArray(fixturesResult.data)) {
        const currentRows = activeIdSet
          ? fixturesResult.data.filter((row) => activeIdSet.has(String(row?.id)))
          : fixturesResult.data;
        mappedFixtures = sortFixturesBySchedule(currentRows.map(mapCloudFixture));
      }

      // fixtures tablosu skor + played iÃ§in TEK OTORÄ°TEDÄ°R. Snapshot yalnÄ±z
      // canlÄ± runtime (faz/sayaÃ§/olaylar) taÅŸÄ±r. BÃ¶ylece eski snapshot 3 bitmiÅŸ
      // maÃ§Ä± tekrar oynanmÄ±ÅŸ yapamaz.
      const snapshotRow = stateById.get("fixtures_snapshot");
      if (Array.isArray(mappedFixtures) && Array.isArray(snapshotRow?.value)) {
        const snapshotById = new Map(snapshotRow.value.map((m) => [String(m?.id), m]));
        mappedFixtures = mappedFixtures.map((base) => {
          const runtime = snapshotById.get(String(base?.id));
          if (!runtime) return base;
          return {
            ...base,
            live: base.played !== true && runtime?.live === true,
            timerRunning: runtime?.timerRunning === true,
            timerStartedAt: runtime?.timerStartedAt ?? null,
            elapsedSeconds: Number(runtime?.elapsedSeconds ?? 0),
            matchPhase: base.played === true ? "completed" : (runtime?.matchPhase || "waiting"),
            events: Array.isArray(runtime?.events) ? runtime.events : [],
            goals: Array.isArray(runtime?.goals) ? runtime.goals : [],
            homePenalties: runtime?.homePenalties ?? runtime?.homePen ?? base.homePenalties ?? "",
            awayPenalties: runtime?.awayPenalties ?? runtime?.awayPen ?? base.awayPenalties ?? "",
            cloudUpdatedAt: snapshotRow?.updated_at || base.cloudUpdatedAt || "",
          };
        });
      }

      if (Array.isArray(mappedFixtures)) {
        mappedFixtures = applyMatchEventRowsToFixtures(mappedFixtures, eventRows);
        setRemoteFixtures(mappedFixtures);
      }

      const lineupValue = stateById.get("match_lineups")?.value;
      setRemoteLineups(lineupValue && typeof lineupValue === "object" && !Array.isArray(lineupValue) ? lineupValue : {});
      const squadsRow = stateById.get("squads");
      const squadsValue = squadsRow?.value;
      setRemoteSquads(squadsValue && typeof squadsValue === "object" && !Array.isArray(squadsValue) ? squadsValue : {});

      const settingsRow = stateById.get("settings");
      if (settingsRow?.value && typeof settingsRow.value === "object" && !Array.isArray(settingsRow.value)) {
        setRemoteSettings(settingsRow.value);
      }

      const centerRow = stateById.get("public_match_center");
      setPublicMatchCenterId(String(centerRow?.value?.matchId || ""));

      let stagedKnockout = null;
      const drawRow = stateById.get("knockout_draw_v1");
      const drawPairs = Array.isArray(drawRow?.value?.pairs) ? drawRow.value.pairs.slice(0, 4) : [];
      setRemoteKnockoutDraw(drawPairs);
      const scheduleRow = stateById.get("knockout_schedule_v1");
      setRemoteKnockoutSchedule(scheduleRow?.value && typeof scheduleRow.value === "object" ? scheduleRow.value : {});

      const knockoutRow = stateById.get("knockout");
      const value = knockoutRow?.value && typeof knockoutRow.value === "object" ? knockoutRow.value : {};
      const cloudUpdatedAt = knockoutRow?.updated_at || "";
      stagedKnockout = [
        ...(Array.isArray(value.quarter) ? value.quarter.map((m, i) => ({ ...m, knockoutKey: `quarter-${i}`, stageLabel: "Ã‡EYREK FÄ°NAL" })) : []),
        ...(Array.isArray(value.semi) ? value.semi.map((m, i) => ({ ...m, knockoutKey: `semi-${i}`, stageLabel: "YARI FÄ°NAL" })) : []),
        ...(value.finalMatch ? [{ ...value.finalMatch, knockoutKey: "final-0", stageLabel: "FÄ°NAL" }] : []),
        ...(value.thirdPlace ? [{ ...value.thirdPlace, knockoutKey: "third-place-0", stageLabel: "3.'LÃœK MAÃ‡I" }] : []),
      ].filter((m) => m?.home && m?.away).map((m, i) => ({
        ...m,
        id: m.id || `ko-${m.knockoutKey || i}`,
        isKnockout: true,
        played: m.played === true,
        live: m.live === true && m.played !== true && m.matchPhase !== "completed" && m.matchPhase !== "waiting",
        homePenalties: m.homePenalties ?? m.homePen ?? "",
        awayPenalties: m.awayPenalties ?? m.awayPen ?? "",
        events: Array.isArray(m.events) ? m.events : [],
        field: m.field || m.pitch || "Saha 1",
        cloudUpdatedAt: m.updated_at || m.updatedAt || cloudUpdatedAt,
      }));
      // Eleme MaÃ§ Merkezi baÄŸÄ±msÄ±z tutulduÄŸu iÃ§in canlÄ± ekran aktif eleme maÃ§Ä±nÄ±
      // doÄŸrudan onun kendi app_state kaydÄ±ndan da okur. BÃ¶ylece knockout aynasÄ±
      // gecikse bile gol/skor/olay deÄŸiÅŸikliÄŸi canlÄ± ekrana anÄ±nda dÃ¼ÅŸer.
      const knockoutCenterRow = stateById.get("knockout_match_center_v1");
      const activeKnockout = knockoutCenterRow?.value?.activeMatch;
      if (activeKnockout?.id && activeKnockout?.home && activeKnockout?.away) {
        // Yeni baÄŸÄ±msÄ±z Eleme MaÃ§ Merkezi quarter-1..4 / semi-1..2 kullanÄ±yor.
        // CanlÄ± eleme aÄŸacÄ± ise quarter-0..3 / semi-0..1 anahtarlarÄ±yla Ã§alÄ±ÅŸÄ±yor.
        // AynÄ± maÃ§Ä± iki farklÄ± slot sanmamasÄ± iÃ§in burada yalnÄ±z CANLI gÃ¶rÃ¼nÃ¼m anahtarÄ±nÄ± normalize et.
        const rawActiveKey = String(activeKnockout.knockoutKey || "");
        const quarterKeyMatch = rawActiveKey.match(/^quarter-(\d+)$/);
        const semiKeyMatch = rawActiveKey.match(/^semi-(\d+)$/);
        const publicKnockoutKey = quarterKeyMatch
          ? `quarter-${Math.max(0, Number(quarterKeyMatch[1]) - 1)}`
          : semiKeyMatch
            ? `semi-${Math.max(0, Number(semiKeyMatch[1]) - 1)}`
            : rawActiveKey;
        const activeMapped = {
          ...activeKnockout,
          knockoutKey: publicKnockoutKey,
          isKnockout: true,
          played: activeKnockout.played === true,
          live: activeKnockout.live === true && activeKnockout.played !== true && activeKnockout.matchPhase !== "completed" && activeKnockout.matchPhase !== "waiting",
          homeScore: Number(activeKnockout.homeScore || 0),
          awayScore: Number(activeKnockout.awayScore || 0),
          homePenalties: activeKnockout.homePenalties ?? activeKnockout.homePen ?? "",
          awayPenalties: activeKnockout.awayPenalties ?? activeKnockout.awayPen ?? "",
          events: Array.isArray(activeKnockout.events) ? activeKnockout.events : [],
          cloudUpdatedAt: knockoutCenterRow?.updated_at || activeKnockout.updatedAt || "",
        };
        const activeId = String(activeMapped.id);
        const activeKey = String(activeMapped.knockoutKey || "");
        const index = stagedKnockout.findIndex((m) =>
          String(m?.id || "") === activeId ||
          (activeKey && String(m?.knockoutKey || "") === activeKey)
        );
        if (index >= 0) stagedKnockout[index] = { ...stagedKnockout[index], ...activeMapped };
        else stagedKnockout.push(activeMapped);
      }

      stagedKnockout = applyMatchEventRowsToFixtures(stagedKnockout, eventRows);
      setRemoteKnockout(stagedKnockout);

      setLastSync(new Date());
      setSelectedMatch((current) => {
        if (!current) return current;
        // Eleme maÃ§ detayÄ±nÄ± genel refresh'in daha eski knockout aynasÄ±yla ezme.
        // Aktif eleme modalÄ±nÄ±n tek sahibi aÅŸaÄŸÄ±daki hÄ±zlÄ± knockout_match_center_v1 okuyucusudur.
        if (current.isKnockout === true || current.knockoutKey) return current;
        const candidates = mappedFixtures || [];
        return candidates.find((m) => String(m.id) === String(current.id)) || null;
      });
    } catch (error) {
      console.error("CanlÄ± takip yenileme hatasÄ±:", error);
    } finally {
      refreshInFlight.current = false;
      if (refreshQueued.current) {
        refreshQueued.current = false;
        window.setTimeout(() => refresh(), 0);
      }
    }
  }, []);

  useEffect(() => {
    refreshTeams();
    // Realtime ana kaynak. 60 sn yalnÄ±z baÄŸlantÄ± kopmasÄ±na karÅŸÄ± emniyet yenilemesidir.
    const teamPoll = window.setInterval(refreshTeams, 60000);

    const teamChannel = supabase
      .channel(`sscup-public-teams-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, refreshTeams)
      .subscribe();

    return () => {
      window.clearInterval(teamPoll);
      supabase.removeChannel(teamChannel);
    };
  }, [refreshTeams]);

  useEffect(() => {
    refresh();
    // Eleme canlÄ± maÃ§Ä±nda Realtime/Broadcast kaÃ§Ä±rÄ±lÄ±rsa bile aÃ§Ä±k canlÄ± ekran
    // en geÃ§ 1 saniye iÃ§inde Supabase'deki gÃ¼ncel skor/olay kaydÄ±nÄ± yeniden okur.
    // BÃ¶ylece gol ekleme ve geri alma iÃ§in Ã§Ä±k-gir/F5 gerekmez.
    const poll = window.setInterval(refresh, 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => refresh();
    const onOnline = () => refresh();
    const onPageShow = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);

    const channel = supabase
      .channel(`sscup-public-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fixtures" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.squads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_draw_v1" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_schedule_v1" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_match_center_v1" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.active_fixture_ids" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.settings" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.fixtures_snapshot" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.public_match_center" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state" }, (payload) => {
        const id = String(payload?.new?.id || payload?.old?.id || "");
        if (id.startsWith(MATCH_EVENT_PREFIX)) refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });

    // Eleme MaÃ§ Merkezi ayrÄ± tutulduÄŸu iÃ§in ayrÄ±ca Broadcast sinyali dinlenir.
    // Bu, app_state tablosunda postgres_changes yayÄ±nÄ± kapalÄ± olsa bile canlÄ±
    // sayfanÄ±n aÃ§Ä±kken anÄ±nda yeniden okuma yapmasÄ±nÄ± saÄŸlar.
    const knockoutBroadcast = supabase
      .channel("sscup-knockout-live-broadcast")
      .on("broadcast", { event: "knockout_changed" }, () => {
        // Ä°lk okuma anlÄ±k gÃ¼ncellemeyi saÄŸlar. Olay geri alma gibi aynÄ± anda
        // Supabase yazÄ±sÄ± tamamlanan iÅŸlemlerde kÄ±sa ikinci okuma, eski satÄ±rÄ±n
        // ekranda kalmasÄ±nÄ± engeller.
        refresh();
        window.setTimeout(() => refresh(), 250);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });

    return () => {
      refreshSequence.current += 1;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      supabase.removeChannel(channel);
      supabase.removeChannel(knockoutBroadcast);
    };
  }, [refresh]);

  // Eleme canlÄ± skoru iÃ§in aÄŸÄ±r genel refresh zincirinden baÄŸÄ±msÄ±z hÄ±zlÄ± okuma.
  // Genel refresh; fixtures + app_state + event satÄ±rlarÄ±nÄ± birlikte beklediÄŸi iÃ§in
  // yavaÅŸ bir istek bÃ¼tÃ¼n 1 sn polling Ã§aÄŸrÄ±larÄ±nÄ± kilitleyebiliyordu. Burada yalnÄ±z
  // aktif Eleme MaÃ§ Merkezi satÄ±rÄ±nÄ± okur ve ekrandaki ilgili eleme slotunu gÃ¼ncelleriz.
  useEffect(() => {
    let disposed = false;
    let inFlight = false;

    const refreshActiveKnockoutFast = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("value,updated_at")
          .eq("id", "knockout_match_center_v1")
          .maybeSingle();
        if (error) throw error;
        if (disposed) return;

        const active = data?.value?.activeMatch;
        if (!active?.id || !active?.home || !active?.away) return;

        const rawKey = String(active.knockoutKey || "");
        const quarterMatch = rawKey.match(/^quarter-(\d+)$/);
        const semiMatch = rawKey.match(/^semi-(\d+)$/);
        const publicKey = quarterMatch
          ? `quarter-${Math.max(0, Number(quarterMatch[1]) - 1)}`
          : semiMatch
            ? `semi-${Math.max(0, Number(semiMatch[1]) - 1)}`
            : rawKey;

        const mapped = {
          ...active,
          knockoutKey: publicKey,
          isKnockout: true,
          played: active.played === true,
          live: active.live === true && active.played !== true && active.matchPhase !== "completed" && active.matchPhase !== "waiting",
          homeScore: Number(active.homeScore || 0),
          awayScore: Number(active.awayScore || 0),
          homePenalties: active.homePenalties ?? active.homePen ?? "",
          awayPenalties: active.awayPenalties ?? active.awayPen ?? "",
          events: Array.isArray(active.events) ? active.events : [],
          cloudUpdatedAt: data?.updated_at || active.updatedAt || "",
        };

        setRemoteKnockout((current) => {
          const next = Array.isArray(current) ? [...current] : [];
          const id = String(mapped.id);
          const key = String(mapped.knockoutKey || "");
          const index = next.findIndex((m) =>
            String(m?.id || "") === id || (key && String(m?.knockoutKey || "") === key)
          );
          if (index >= 0) next[index] = { ...next[index], ...mapped };
          else next.push(mapped);
          return next;
        });

        // CanlÄ± maÃ§ detay penceresi aÃ§Ä±ksa sadece listeyi deÄŸil, ekranda render edilen
        // seÃ§ili maÃ§ state'ini de gÃ¼ncelle. Ã–nceden gol/olay Supabase'e geliyor fakat
        // modal eski nesneyi tuttuÄŸu iÃ§in kapat-aÃ§ yapmadan gÃ¶rÃ¼nmÃ¼yordu.
        setSelectedMatch((current) => {
          if (!current) return current;
          const sameId = String(current?.id || "") === String(mapped.id || "");
          const sameKey = mapped.knockoutKey && String(current?.knockoutKey || "") === String(mapped.knockoutKey);
          return sameId || sameKey ? { ...current, ...mapped } : current;
        });
      } catch (error) {
        console.error("Eleme canlÄ± hÄ±zlÄ± yenileme hatasÄ±:", error);
      } finally {
        inFlight = false;
      }
    };

    refreshActiveKnockoutFast();
    const timer = window.setInterval(refreshActiveKnockoutFast, 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

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

  const displaySettings = remoteSettings && typeof remoteSettings === "object"
    ? { ...settings, ...remoteSettings }
    : settings;
  const displayTeams = Array.isArray(remoteTeams) ? remoteTeams : teams;
  const displaySquads = remoteSquads && typeof remoteSquads === "object"
    ? remoteSquads
    : (() => {
        try {
          const saved = localStorage.getItem("sscup-squads");
          return saved ? JSON.parse(saved) : {};
        } catch {
          return {};
        }
      })();
  const [selectedTeamName, setSelectedTeamName] = useState("");
  const leagueFixtures = Array.isArray(remoteFixtures) ? remoteFixtures : fixtures;
  const localKnockout = (fixtures || []).filter((match) => match?.isKnockout === true);
  const rawKnockoutMatches = remoteKnockout.length > 0 ? remoteKnockout : localKnockout;

  // TakipÃ§i eleme kurasÄ± Ã§ekildiÄŸi anda bÃ¼tÃ¼n yolu gÃ¶rsÃ¼n. HenÃ¼z sonucu
  // belli olmayan eÅŸleÅŸmeler "Ã‡F 1 Galibi" / "YF 1 MaÄŸlubu" ÅŸeklinde kalÄ±r.
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
    const drawPair = Array.isArray(remoteKnockoutDraw?.[i]) ? remoteKnockoutDraw[i] : [];
    const home = m?.home || drawPair[0] || `Ã‡F ${i + 1} TakÄ±m 1`;
    const away = m?.away || drawPair[1] || `Ã‡F ${i + 1} TakÄ±m 2`;
    return { home, away, winner: koWinner(m, home, away) };
  });
  const semiPairs = [
    { home: qTeams[0].winner || "Ã‡F 1 Galibi", away: qTeams[2].winner || "Ã‡F 3 Galibi" },
    { home: qTeams[1].winner || "Ã‡F 2 Galibi", away: qTeams[3].winner || "Ã‡F 4 Galibi" },
  ];
  const semi0 = byKoKey.get("semi-0");
  const semi1 = byKoKey.get("semi-1");
  const s0w = koWinner(semi0, semiPairs[0].home, semiPairs[0].away);
  const s1w = koWinner(semi1, semiPairs[1].home, semiPairs[1].away);
  const s0l = koLoser(semi0, semiPairs[0].home, semiPairs[0].away);
  const s1l = koLoser(semi1, semiPairs[1].home, semiPairs[1].away);

  const hasKnockoutDraw = remoteKnockoutDraw.some((pair) => Array.isArray(pair) && pair[0] && pair[1]);
  const knockoutMatches = (rawKnockoutMatches.length === 0 && !hasKnockoutDraw) ? [] : [
    ...[0,1,2,3].map((i) => ({ ...(byKoKey.get(`quarter-${i}`) || {}), id: byKoKey.get(`quarter-${i}`)?.id || `ko-quarter-${i}`, knockoutKey: `quarter-${i}`, isKnockout: true, stageLabel: "Ã‡EYREK FÄ°NAL", home: qTeams[i].home, away: qTeams[i].away })),
    { ...(semi0 || {}), id: semi0?.id || "ko-semi-0", knockoutKey: "semi-0", isKnockout: true, stageLabel: "YARI FÄ°NAL", home: semiPairs[0].home, away: semiPairs[0].away },
    { ...(semi1 || {}), id: semi1?.id || "ko-semi-1", knockoutKey: "semi-1", isKnockout: true, stageLabel: "YARI FÄ°NAL", home: semiPairs[1].home, away: semiPairs[1].away },
    { ...(byKoKey.get("third-place-0") || {}), id: byKoKey.get("third-place-0")?.id || "ko-third-place-0", knockoutKey: "third-place-0", isKnockout: true, stageLabel: "3.'LÃœK MAÃ‡I", home: s0l || "YF 1 MaÄŸlubu", away: s1l || "YF 2 MaÄŸlubu" },
    { ...(byKoKey.get("final-0") || {}), id: byKoKey.get("final-0")?.id || "ko-final-0", knockoutKey: "final-0", isKnockout: true, stageLabel: "FÄ°NAL", home: s0w || "YF 1 Galibi", away: s1w || "YF 2 Galibi" },
  ];
  const scheduledKnockoutMatches = knockoutMatches.map((m) => ({
    ...m,
    date: remoteKnockoutSchedule?.[m.knockoutKey]?.date || m.date || "",
    time: remoteKnockoutSchedule?.[m.knockoutKey]?.time || m.time || "",
  }));
  const knockoutKeys = new Set(scheduledKnockoutMatches.map((m) => m.knockoutKey).filter(Boolean));
  // TEK KAYNAK SIRASI:
  // Ã–nce tarih, aynÄ± tarihte saat. Bundan sonraki bÃ¼tÃ¼n CanlÄ± Takip
  // bÃ¶lÃ¼mleri bu kronolojik listeyi kullanÄ±r.
  const displayFixtures = sortFixturesBySchedule([
    // Eleme maÃ§larÄ±nÄ±n canlÄ±daki tek kaynaÄŸÄ± remoteKnockout/knockoutMatches olsun.
    // fixtures iÃ§inde geÃ§miÅŸten kalmÄ±ÅŸ eleme satÄ±rÄ± varsa knockoutKey formatÄ± farklÄ±
    // olduÄŸunda (quarter-1 / quarter-0) ikinci bir CANLI maÃ§ olarak seÃ§ilebiliyordu.
    // Bu da ekranda gÃ¼ncel eleme state'i yerine eski skoru gÃ¶stermeye devam ediyordu.
    ...leagueFixtures.filter((m) => m?.isKnockout !== true),
    ...scheduledKnockoutMatches,
  ]);
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
  const actuallyLiveMatch = liveMatches[0] || null;
  const preparedMatch = !actuallyLiveMatch && publicMatchCenterId
    ? displayFixtures.find((match) => String(match?.id) === String(publicMatchCenterId) && match?.played !== true) || null
    : null;
  const liveMatch = actuallyLiveMatch || preparedMatch;
  const upcoming = displayFixtures.filter(
    (match) => match?.played !== true && match?.live !== true
  );
  const completedMatches = displayFixtures.filter((match) => match?.played === true).slice().reverse();
  const recent = completedMatches.slice(0, 8);

  const todayDate = new Date(now);
  const todayKey = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;

  const nightMatches = useMemo(() => {
    // MaÃ§ Merkezi seÃ§imi / geri Ã§ekme sÄ±ralamayÄ± ASLA etkilemez.
    // Gecenin maÃ§larÄ± yalnÄ±z gerÃ§ek fikstÃ¼r saatine gÃ¶re dizilir.
    return displayFixtures
      .filter((match) => normalizeFixtureDate(match?.date) === todayKey)
      .slice()
      .sort((a, b) => {
        const timeDiff = fixtureTimeMinutes(a?.time) - fixtureTimeMinutes(b?.time);
        if (timeDiff !== 0) return timeDiff;
        const idA = Number(a?.id);
        const idB = Number(b?.id);
        if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) return idA - idB;
        return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), "tr", { numeric: true });
      });
  }, [displayFixtures, todayKey]);

  const byeTeamByWeek = useMemo(() => {
    const teamNames = displayTeams
      .map((team) => typeof team === "string" ? team : (team?.name || team?.teamName || ""))
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    const leagueOnly = displayFixtures.filter((match) => !match?.isKnockout && match?.week);
    const byWeek = new Map();

    leagueOnly.forEach((match) => {
      const week = String(match.week);
      if (!byWeek.has(week)) byWeek.set(week, new Set());
      const playedTeams = byWeek.get(week);
      if (match?.home) playedTeams.add(String(match.home).trim());
      if (match?.away) playedTeams.add(String(match.away).trim());
    });

    const result = new Map();
    byWeek.forEach((playedTeams, week) => {
      const missing = teamNames.filter((name) => !playedTeams.has(name));
      // Eksik fikstÃ¼rÃ¼ yanlÄ±ÅŸlÄ±kla BAY saymamak iÃ§in yalnÄ±z tam 1 takÄ±m eksikse gÃ¶ster.
      if (missing.length === 1) result.set(week, missing[0]);
    });
    return result;
  }, [displayTeams, displayFixtures]);

  const upcomingByWeek = useMemo(() => {
    const groups = [];
    const indexByWeek = new Map();
    upcoming.slice(0, 40).forEach((match, index) => {
      const weekKey = match?.week ? String(match.week) : `other-${index}`;
      if (!indexByWeek.has(weekKey)) {
        indexByWeek.set(weekKey, groups.length);
        groups.push({ weekKey, week: match?.week || null, matches: [] });
      }
      groups[indexByWeek.get(weekKey)].matches.push(match);
    });
    return groups;
  }, [upcoming]);

  const liveStandings = useMemo(() => {
    // Takip sayfasÄ±nda eski tarayÄ±cÄ±/localStorage verisine geri dÃ¼ÅŸme.
    // Bulut fikstÃ¼rÃ¼ geldiyse puan durumu yalnÄ±zca gÃ¼ncel turnuvadan hesaplanÄ±r.
    if (Array.isArray(remoteFixtures)) {
      return calculateStandings(displayTeams, displayFixtures);
    }
    const calculated = calculateStandings(displayTeams, displayFixtures);
    return calculated.length > 0 ? calculated : standings;
  }, [displayTeams, displayFixtures, standings, remoteFixtures]);

  const liveScorers = useMemo(() => {
    // Yeni turnuvada henÃ¼z gol yoksa [] dÃ¶nmeli; eski local gol krallÄ±ÄŸÄ±na
    // fallback yapmak eski golcÃ¼leri canlÄ± takipte yeniden gÃ¶steriyordu.
    if (Array.isArray(remoteFixtures)) {
      return deriveScorers(displayFixtures);
    }
    const calculated = deriveScorers(displayFixtures);
    return calculated.length > 0 ? calculated : goalScorers;
  }, [displayFixtures, goalScorers, remoteFixtures]);

  const leader = liveStandings[0];
  const topScorer = liveScorers[0];
  const liveEvents = liveMatch ? getEvents(liveMatch).slice().reverse() : [];
  const lastGoal = liveEvents.find((event) => GOAL_EVENT_TYPES.has(event.type));
  const minute = getMinute(liveMatch, now, displaySettings.halfDurationMinutes || 30);
  const knockoutBadges = knockoutLiveBadges(liveMatch);
  const playedCount = displayFixtures.filter((match) => match?.played === true).length;
  const totalGoals = displayFixtures
    .filter((match) => match?.played === true)
    .reduce((sum, match) => sum + safeNumber(match?.homeScore) + safeNumber(match?.awayScore), 0);
  const tournamentName = displaySettings.tournamentName || displaySettings.title || "S&S CUP";

  // Final tamamlandÄ±ÄŸÄ±nda ÅŸampiyonu doÄŸrudan final skorundan/penaltÄ±sÄ±ndan bul.
  // BÃ¶ylece app_state iÃ§inde ayrÄ±ca winner/champion alanÄ± tutulmasÄ±na ihtiyaÃ§ kalmaz.
  const finalMatch = knockoutMatches.find((match) => match?.knockoutKey === "final-0");
  const finalCompleted = Boolean(
    finalMatch && (
      finalMatch.played === true ||
      finalMatch.match_phase === "completed" ||
      finalMatch.matchPhase === "completed" ||
      finalMatch.status === "completed"
    )
  );
  const championName = finalCompleted
    ? koWinner(finalMatch, finalMatch?.home, finalMatch?.away)
    : "";
  const championPenaltyText = finalMatch &&
    safeNumber(finalMatch.homeScore) === safeNumber(finalMatch.awayScore) &&
    (finalMatch.homePenalties != null || finalMatch.awayPenalties != null || finalMatch.homePen != null || finalMatch.awayPen != null)
      ? `PEN ${safeNumber(finalMatch.homePenalties ?? finalMatch.homePen)} - ${safeNumber(finalMatch.awayPenalties ?? finalMatch.awayPen)}`
      : "";

  return (
    <div className="public-live-page">
      <div className="public-stadium-light light-left" />
      <div className="public-stadium-light light-right" />
      <header className="public-live-header">
        <div className="public-brand-block">
          <div className="public-brand-mark">ğŸ†</div>
          <div><span className="public-kicker">RESMÄ° CANLI TURNUVA MERKEZÄ°</span><h1>{tournamentName}</h1><p>{displaySettings.slogan || "Kazanan Sahada Belli Olur"}</p>{displaySettings.mainSponsor && <small style={{ display: "block", marginTop: "5px", fontWeight: 900 }}>ğŸ¤ ANA SPONSOR â€¢ {displaySettings.mainSponsor}</small>}</div>
        </div>
        <div className="public-header-meta"><span>{displaySettings.season || "2026"}</span><span>ğŸ“ {displaySettings.venue || "Gol Park"}</span><span className="public-sync-dot">â— CANLI VERÄ°</span></div>
      </header>

      <main className="public-live-shell">
        {activeTab === "overview" && (
          <section className="ss26-arena" aria-label="S&S CUP yeni maÃ§ merkezi">
            <div className="ss26-arena-head">
              <div><span className="ss26-eyebrow">S&S CUP â€¢ RAMAZAN Ã–ZEL</span><h2>MAÃ‡IN <em>NABZI</em> BURADA.</h2><p>CanlÄ± skorlar, kadrolar ve bÃ¼tÃ¼n maÃ§ heyecanÄ± tek ekranda.</p></div>
            </div>
            {liveMatch ? (
              <div className="ss26-featured">
                <div className="ss26-featured-top"><span className="ss26-live-label">{liveMatch?.live ? "â— CANLI MAÃ‡" : "MAÃ‡ MERKEZÄ°"}</span><span>{stageText(liveMatch)}</span></div>
                <div className="ss26-versus"><strong>{liveMatch.home}</strong><div><b>{scoreText(liveMatch.homeScore)}</b><span>:</span><b>{scoreText(liveMatch.awayScore)}</b><small>{liveMatch.live ? minute || "CANLI" : statusText(liveMatch)}</small></div><strong>{liveMatch.away}</strong></div>
                <div className="ss26-pitch"><div className="ss26-midline"/><div className="ss26-circle"/><div className="ss26-box ss26-box-left"/><div className="ss26-box ss26-box-right"/>
                  {Array.from({ length: 14 }, (_, i) => {
                    const home = i < 7;
                    const side = home ? "home" : "away";
                    const j = i % 7;
                    // Kaleci, 3 savunma, 2 orta saha, 1 ileri oyuncu (takÄ±m baÅŸÄ±na).
                    const positions = [[8, 50], [23, 19], [23, 50], [23, 81], [37, 32], [37, 68], [44, 50]];
                    const xy = positions[j];
                    const starters = getFeaturedStarters(liveMatch, displaySquads, remoteLineups, side);
                    const player = starters[j];
                    if (!player) return null;
                    const number = player.shirtNumber ?? player.number ?? "â€“";
                    const name = player.name || player.playerName || "Oyuncu";
                    const photo = player.photoUrl || player.photo || player.imageUrl;
                    return <div key={i} className={`ss26-player ${side}`} style={{ left: `${home ? xy[0] : 100 - xy[0]}%`, top: `${xy[1]}%` }} title={`${number} ${name}`}>
                      <span>{photo ? <img src={photo} alt="" loading="lazy" /> : number}</span>
                      <small>{number} {name}</small>
                    </div>;
                  })}
                </div>
                <div className="ss-v10-mobile-rosters" aria-label="Sahadaki oyuncularin tam isimleri">
                  {[["home", liveMatch.home], ["away", liveMatch.away]].map(([side, team]) => (
                    <div className={`ss-v10-roster-side ${side}`} key={side}>
                      <strong>{team}</strong>
                      {getFeaturedStarters(liveMatch, displaySquads, remoteLineups, side).map((player, idx) => (
                        <div className="ss-v10-roster-player" key={idx}>
                          <b>{player.shirtNumber ?? player.number ?? "â€“"}</b>
                          <span>{player.name || player.playerName || "Oyuncu"}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {lastGoal && <div className="ss-v10-last-goal"><span>âš½ SON GOL</span><strong>{lastGoal.player}</strong><small>{lastGoal.team}{lastGoal.minute !== "" ? ` â€¢ ${lastGoal.minute}'` : ""}</small></div>}
                <div className="ss26-featured-bottom"><span>{!getFeaturedStarters(liveMatch, displaySquads, remoteLineups, "home").length && !getFeaturedStarters(liveMatch, displaySquads, remoteLineups, "away").length ? "âš½ Ä°lk 7 kadrolarÄ± yÃ¶netimden seÃ§ildiÄŸinde burada gÃ¶rÃ¼nÃ¼r" : "âš½ 7'YE 7 SAHA GÃ–RÃœNÃœMÃœ"}</span>{<button type="button" onClick={()=>setSelectedMatch(liveMatch)}>MAÃ‡ DETAYINI AÃ‡ â†’</button>}</div>
              </div>
            ) : (
              <div className="ss26-ready"><span>âš½</span><div><strong>YENÄ° SEZONA HAZIRIZ</strong><p>HenÃ¼z aktif maÃ§ yok. MaÃ§ baÅŸladÄ±ÄŸÄ±nda canlÄ± saha burada gÃ¶rÃ¼necek.</p></div></div>
            )}
          </section>
        )}

        {championName && activeTab === "overview" && (
          <section className="public-champion-card">
            <div className="public-champion-glow glow-left" />
            <div className="public-champion-glow glow-right" />
            <div className="public-champion-trophy trophy-left">ğŸ†</div>
            <div className="public-champion-trophy trophy-right">ğŸ†</div>
            <div className="public-champion-content">
              <span className="public-champion-kicker">ğŸ† S&S CUP ÅAMPÄ°YONU ğŸ†</span>
              <h2>{championName}</h2>
              <strong>{displaySettings.season || "2026"} ÅAMPÄ°YONU</strong>
              <div className="public-champion-final">
                <span>FÄ°NAL</span>
                <b>{finalMatch.home}</b>
                <strong>{scoreText(finalMatch.homeScore)} - {scoreText(finalMatch.awayScore)}</strong>
                <b className="champion-winner-side">{finalMatch.away}</b>
                {championPenaltyText && <em>{championPenaltyText}</em>}
              </div>
            </div>
          </section>
        )}

        {liveMatch && activeTab !== "overview" && (
          <section className="public-live-scoreboard public-clickable" onClick={() => setSelectedMatch(liveMatch)}>
            <div className="public-scoreboard-topline"><div className="public-live-pill"><i /> {actuallyLiveMatch ? "CANLI" : "MAÃ‡ MERKEZÄ°"}</div><div className="public-match-status">{actuallyLiveMatch ? (minute || "CANLI") : "BAÅLAMAYI BEKLÄ°YOR"}</div><div className="public-stage-label">{stageText(liveMatch)}</div></div>
            <div className="public-score-grid">
              <div className="public-score-team home"><span>EV SAHÄ°BÄ°</span><strong>{liveMatch.home}</strong>{knockoutBadges?.home && <small className={`public-ko-live-badge ${knockoutBadges.home.tone}`}>{knockoutBadges.home.icon} {knockoutBadges.home.text}</small>}</div>
              <div className="public-score-center"><div className="public-score-numbers"><b>{scoreText(liveMatch.homeScore)}</b><em>:</em><b>{scoreText(liveMatch.awayScore)}</b></div><small>{liveMatch.time || ""} {liveMatch.field ? `â€¢ ${liveMatch.field}` : ""}</small>{knockoutBadges?.balanced && <small className="public-ko-balanced">âš– Tur dengede</small>}</div>
              <div className="public-score-team away"><span>DEPLASMAN</span><strong>{liveMatch.away}</strong>{knockoutBadges?.away && <small className={`public-ko-live-badge ${knockoutBadges.away.tone}`}>{knockoutBadges.away.icon} {knockoutBadges.away.text}</small>}</div>
            </div>
            {lastGoal && <div className="public-last-goal"><span>âš½</span><div><b>SON GOL</b><strong>{lastGoal.player}</strong><small>{lastGoal.team}{lastGoal.minute !== "" ? ` â€¢ ${lastGoal.minute}'` : ""}</small></div></div>}
            <div className="public-tap-hint">MaÃ§ olaylarÄ±nÄ± gÃ¶rmek iÃ§in tÄ±kla â€º</div>
          </section>
        )}

        <section className="public-stat-grid public-stat-grid-top">
          <article><span>ğŸ‘¥</span><div><strong>{displayTeams.length}</strong><b>TAKIM</b><small>MÃ¼cadele ediyor</small></div></article>
          <article><span>âš½</span><div><strong>{playedCount}</strong><b>OYNANAN MAÃ‡</b><small>Toplam</small></div></article>
          <article><span>ğŸ•˜</span><div><strong>{upcoming.length}</strong><b>BEKLEYEN MAÃ‡</b><small>YaklaÅŸan</small></div></article>
          <article><span>âš½</span><div><strong>{totalGoals}</strong><b>TOPLAM GOL</b><small>Oynanan maÃ§lar</small></div></article>
        </section>

        <nav className="public-tabbar">
          {[["overview","âš¡","Genel"],["results","âœ…","Tamamlanan"],["fixtures","ğŸ“…","FikstÃ¼r"],["standings","ğŸ“Š","Puan Durumu"],["scorers","ğŸ‘‘","Gol KrallÄ±ÄŸÄ±"],["teams","ğŸ‘•","TakÄ±mlar"],["knockout","ğŸ†","Eleme TurlarÄ±"]].map(([id, icon, label]) => (
            <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><span>{icon}</span>{label}</button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <div className="public-dashboard-grid">
            <div className="public-dashboard-main">
              <section className="public-section public-night-panel">
                <div className="public-section-head public-section-head-line"><div><span>MAÃ‡ MERKEZÄ°</span><h2>Gecenin MaÃ§larÄ±</h2></div>{nightMatches[0]?.date && <b>{formatDate(nightMatches[0].date, true)}</b>}</div>
                {nightMatches.length === 0 ? <div className="public-empty-box">Bu gece iÃ§in planlanmÄ±ÅŸ maÃ§ bulunmuyor.</div> : (
                  <div className="public-night-list">
                    {nightMatches.map((match, index) => (
                      <button key={match.id || index} className={`public-night-row ${match.live ? "is-live" : ""} ${match.played ? "is-finished" : ""}`} onClick={() => setSelectedMatch(match)}>
                        <div className="public-night-clock"><strong>{match.live ? "CANLI" : match.played ? "MS" : match.time || "--:--"}</strong><small>{formatDate(match.date)}</small></div>
                        <div className="public-night-team home"><strong>{match.home}</strong></div>
                        <div className="public-night-vs">{match.live || match.played ? `${scoreText(match.homeScore)} - ${scoreText(match.awayScore)}` : "VS"}</div>
                        <div className="public-night-team away"><strong>{match.away}</strong></div>
                        <div className="public-night-field">âš‘ {match.field || "Saha 1"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="public-section public-results-panel">
                <div className="public-section-head"><div><span>SON DÃœDÃœK</span><h2>SonuÃ§lanan MaÃ§lar</h2></div><b>MaÃ§a tÄ±kla â€¢ olaylarÄ± gÃ¶r</b></div>
                {recent.length === 0 ? <div className="public-empty-box public-results-empty"><span>ğŸ†</span><strong>HenÃ¼z oynanan maÃ§ bulunmuyor.</strong><small>MaÃ§lar tamamlandÄ±kÃ§a burada gÃ¶rÃ¼necektir.</small></div> : <>
                  <div className="public-results-list">{recent.map((match,index) => <button key={match.id || index} onClick={() => setSelectedMatch(match)}><div><span>{formatDate(match.date)} {match.time || ""}</span><small>{stageText(match,index)}</small></div><strong>{match.home}</strong><b>{scoreText(match.homeScore)} - {scoreText(match.awayScore)}</b><strong>{match.away}</strong><em>MS â€º</em></button>)}</div>
                  {completedMatches.length > 8 && <button className="public-all-results-button" onClick={() => setActiveTab("results")}>TÃœM TAMAMLANAN MAÃ‡LARI GÃ–R <span>â€º</span></button>}
                </>}
              </section>
            </div>

            <aside className="public-dashboard-side">
              <section className="public-side-card">
                <div className="public-side-title">PUAN DURUMU</div>
                <div className="public-side-table-wrap"><table className="public-side-table"><thead><tr><th>#</th><th>TAKIM</th><th>O</th><th>G</th><th>B</th><th>M</th><th>P</th><th>AV</th></tr></thead><tbody>
                  {liveStandings.map((team, index) => <tr key={team.team}><td><span className={`public-mini-rank rank-${index + 1}`}>{index + 1}</span></td><td><strong>{team.team}</strong></td><td>{team.played}</td><td>{team.won}</td><td>{team.drawn}</td><td>{team.lost}</td><td><b>{team.points}</b></td><td>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</td></tr>)}
                </tbody></table></div>
              </section>

              <section className="public-side-card">
                <div className="public-side-title">GOL KRALLIÄI</div>
                {liveScorers.length === 0 ? <div className="public-side-empty">HenÃ¼z gol kaydÄ± yok.</div> : <div className="public-mini-scorers">{liveScorers.slice(0,5).map((p,index) => <div key={p.id || index}><span>{index+1}</span><strong>{p.playerName || p.name}<small>{p.team}</small></strong><b>{p.goals}</b></div>)}</div>}
              </section>
            </aside>
          </div>
        )}

        {activeTab === "results" && (
          <section className="public-section public-results-archive">
            <div className="public-section-head"><div><span>MAÃ‡ ARÅÄ°VÄ°</span><h2>Tamamlanan MaÃ§lar</h2></div><b>{completedMatches.length} maÃ§ â€¢ Detay iÃ§in maÃ§a tÄ±kla</b></div>
            {completedMatches.length === 0 ? <div className="public-empty-box">HenÃ¼z tamamlanan maÃ§ bulunmuyor.</div> : (
              <div className="public-results-list public-results-list-all">{completedMatches.map((match,index) => (
                <button key={match.id || index} onClick={() => setSelectedMatch(match)}>
                  <div><span>{formatDate(match.date)} {match.time || ""}</span><small>{stageText(match,index)}</small></div>
                  <strong>{match.home}</strong><b>{scoreText(match.homeScore)} - {scoreText(match.awayScore)}</b><strong>{match.away}</strong><em>DETAY â€º</em>
                </button>
              ))}</div>
            )}
          </section>
        )}

        {activeTab === "fixtures" && (
          <section className="public-section">
            <div className="public-section-head"><div><span>MAÃ‡ MERKEZÄ°</span><h2>FikstÃ¼r</h2></div><b>{upcoming.length} karÅŸÄ±laÅŸma</b></div>
            {upcoming.length === 0 ? <div className="public-empty-box">PlanlanmÄ±ÅŸ yeni maÃ§ bulunmuyor.</div> : (
              <div className="public-fixture-weeks">{upcomingByWeek.map((group, groupIndex) => {
                const byeTeam = group.week ? byeTeamByWeek.get(String(group.week)) : "";
                return (
                  <div className="public-fixture-week" key={group.weekKey}>
                    <div className="public-fixture-week-head">
                      <strong>{group.week ? `${group.week}. HAFTA` : "FÄ°KSTÃœR"}</strong>
                      {byeTeam && <span className="public-bye-team">BAY: {byeTeam}</span>}
                    </div>
                    <div className="public-fixture-grid">{group.matches.map((match, index) => (
                      <button className="public-fixture-card" key={match.id || index} onClick={() => setSelectedMatch(match)}>
                        <div className="public-fixture-meta"><span>{stageText(match, groupIndex + index)}</span><b>{formatDate(match.date)} â€¢ {match.time || "Saat aÃ§Ä±klanacak"}</b></div>
                        <div className="public-fixture-teams"><strong>{match.home}</strong><span>VS</span><strong>{match.away}</strong></div>
                        <div className="public-fixture-place">ğŸ“ {match.field || displaySettings.venue || "Gol Park HalÄ± Saha"}<i>Detay â€º</i></div>
                      </button>
                    ))}</div>
                  </div>
                );
              })}</div>
            )}
          </section>
        )}

        {activeTab === "standings" && (
          <section className="public-section public-table-section">
            <div className="public-section-head"><div><span>LÄ°G TABLOSU</span><h2>Puan Durumu</h2></div><b>Ä°lk 8 eleme hattÄ±</b></div>
            <div className="public-table-wrap"><table className="public-standings-table"><thead><tr><th>#</th><th>TAKIM</th><th>O</th><th>G</th><th>B</th><th>M</th><th>A</th><th>Y</th><th>AV</th><th>P</th></tr></thead><tbody>
              {liveStandings.map((team, index) => <tr key={team.team} className={index < 8 ? "qualification" : ""}><td><span className={`public-rank rank-${index + 1}`}>{index + 1}</span></td><td><strong>{team.team}</strong>{index === 7 && <small className="public-cutoff">ELEME Ã‡Ä°ZGÄ°SÄ°</small>}</td><td>{team.played}</td><td>{team.won}</td><td>{team.drawn}</td><td>{team.lost}</td><td>{team.goalsFor}</td><td>{team.goalsAgainst}</td><td>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</td><td className="points">{team.points}</td></tr>)}
            </tbody></table></div>
          </section>
        )}

        {activeTab === "scorers" && (
          <section className="public-section">
            <div className="public-section-head"><div><span>BÄ°REYSEL PERFORMANS</span><h2>Gol KrallÄ±ÄŸÄ±</h2></div><b>AltÄ±n ayakkabÄ± yarÄ±ÅŸÄ±</b></div>
            {liveScorers.length === 0 ? <div className="public-empty-box">Gol krallÄ±ÄŸÄ± henÃ¼z oluÅŸmadÄ±.</div> : <>
              <div className="public-podium">{[1,0,2].map((sourceIndex, podiumIndex) => { const p = liveScorers[sourceIndex]; if (!p) return <div key={podiumIndex} className="public-podium-card empty" />; const medal = sourceIndex === 0 ? "ğŸ¥‡" : sourceIndex === 1 ? "ğŸ¥ˆ" : "ğŸ¥‰"; return <article key={p.id || sourceIndex} className={`public-podium-card place-${sourceIndex + 1}`}><div className="public-medal">{medal}</div><span>{sourceIndex + 1}. SIRA</span><strong>{p.playerName || p.name}</strong><small>{p.team}</small><b>âš½ {p.goals} GOL</b></article>; })}</div>
              {liveScorers.length > 3 && <div className="public-scorer-list">{liveScorers.slice(3,10).map((p,index) => <div key={p.id || index}><span>{index+4}</span><strong>{p.playerName || p.name}<small>{p.team}</small></strong><b>âš½ {p.goals}</b></div>)}</div>}
            </>}
          </section>
        )}

        {activeTab === "teams" && (
          <section className="public-section public-teams-section">
            <div className="public-section-head"><div><span>TAKIM KADROLARI</span><h2>TakÄ±mlar</h2></div><b>{displayTeams.length} takÄ±m</b></div>
            {!selectedTeamName ? (
              <div className="public-team-grid">
                {displayTeams.map((team, index) => {
                  const teamName = typeof team === "string" ? team : team?.name || team?.teamName || `TakÄ±m ${index + 1}`;
                  const playerCount = Array.isArray(displaySquads?.[teamName]) ? displaySquads[teamName].length : 0;
                  return (
                    <button key={teamName} type="button" className="public-team-card" onClick={() => setSelectedTeamName(teamName)}>
                      <span className="public-team-card-number">{String(index + 1).padStart(2, "0")}</span>
                      <strong>{teamName}</strong>
                      <small>{playerCount} oyuncu</small>
                      <b>Kadroyu GÃ¶r â€º</b>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="public-squad-panel">
                <button type="button" className="public-team-back" onClick={() => setSelectedTeamName("")}>â€¹ TÃ¼m TakÄ±mlar</button>
                <div className="public-squad-title"><span>ğŸ‘•</span><div><small>TAKIM KADROSU</small><h3>{selectedTeamName}</h3></div></div>
                {(!Array.isArray(displaySquads?.[selectedTeamName]) || displaySquads[selectedTeamName].length === 0) ? (
                  <div className="public-empty-box">Bu takÄ±m iÃ§in kayÄ±tlÄ± oyuncu bulunmuyor.</div>
                ) : (
                  <div className="public-player-list">
                    {[...displaySquads[selectedTeamName]]
                      .sort((a, b) => Number(a?.shirtNumber ?? a?.number ?? 999) - Number(b?.shirtNumber ?? b?.number ?? 999))
                      .map((player, index) => (
                        <div className="public-player-row" key={player?.id || `${selectedTeamName}-${index}`}>
                          <span>{player?.shirtNumber ?? player?.number ?? "-"}</span>
                          <strong>{player?.name || player?.playerName || "Oyuncu"}</strong>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === "knockout" && (
          <section className="public-section public-knockout-section">
            <div className="public-section-head"><div><span>ÅAMPÄ°YONLUK YOLU</span><h2>ğŸ† Eleme TurlarÄ±</h2></div><b>Ã‡eyrek Final â€¢ YarÄ± Final â€¢ 3.'lÃ¼k â€¢ Final</b></div>
            {scheduledKnockoutMatches.length === 0 ? <div className="public-empty-box">Eleme eÅŸleÅŸmeleri henÃ¼z oluÅŸmadÄ±.</div> : (
              <div className="public-knockout-stages">
                {["Ã‡EYREK FÄ°NAL", "YARI FÄ°NAL", "3.'LÃœK MAÃ‡I", "FÄ°NAL"].map((stage) => {
                  const matches = scheduledKnockoutMatches.filter((m) => stageText(m) === stage);
                  if (!matches.length) return null;
                  return <div className="public-knockout-stage" key={stage}><h3>{stage}</h3><div className="public-knockout-grid">{matches.map((match, index) => (
                    <button className={`public-knockout-card ${match.live ? "is-live" : ""}`} key={match.knockoutKey || match.id || index} onClick={() => setSelectedMatch(match)}>
                      <div className="public-ko-meta"><span>{match.live ? "â— CANLI" : match.played ? "MS" : match.time || "PROGRAM"}</span><small>{formatDate(match.date)} {match.field ? `â€¢ ${match.field}` : ""}</small></div>
                      <div className="public-ko-team"><strong>{match.home}</strong><b>{match.live || match.played ? scoreText(match.homeScore) : ""}</b></div>
                      <div className="public-ko-team"><strong>{match.away}</strong><b>{match.live || match.played ? scoreText(match.awayScore) : ""}</b></div>
                      {(match.homePenalties !== "" || match.awayPenalties !== "") && <div className="public-ko-pen">PEN {safeNumber(match.homePenalties)} - {safeNumber(match.awayPenalties)}</div>}
                      <div className="public-tap-hint">Goller â€¢ kartlar â€¢ penaltÄ±lar â€º</div>
                    </button>
                  ))}</div></div>;
                })}
              </div>
            )}
          </section>
        )}

        <footer className="public-live-footer"><div><b>{tournamentName}</b><span>{displaySettings.slogan || "Kazanan Sahada Belli Olur"}</span></div><small>{lastSync ? `Son veri: ${lastSync.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "CanlÄ± veri baÄŸlantÄ±sÄ± kuruluyorâ€¦"}</small></footer>
      </main>

      <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} now={now} halfDurationMinutes={displaySettings.halfDurationMinutes || 30} squads={displaySquads} lineups={remoteLineups} />
    </div>
  );
}

