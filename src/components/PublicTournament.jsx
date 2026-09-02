import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import "./PublicTournament.css";
import { normalizeFixtureDate, fixtureTimeMinutes, sortFixturesBySchedule } from "../utils/fixtureOrder";

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
  // match_phase maçın esas durumudur. live/played bayrakları gecikmiş bir yazıdan
  // kısa süreli farklı gelse bile izleyici ekranı maçı kaybetmemeli.
  const phase = item.match_phase || "waiting";
  const activePhases = new Set(["first_half", "halftime", "second_half", "penalty"]);
  const played = item.played === true || phase === "completed";
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isFutureFixture = Boolean(item.date && String(item.date).slice(0, 10) > todayKey);
  const live = !played && !isFutureFixture && activePhases.has(phase);
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
    matchPhase: phase,
    isKnockout: item.is_knockout === true,
    knockoutKey: item.knockout_key || "",
    stageLabel: item.stage || item.stage_label || "",
    homePenalties: item.home_penalties ?? item.homePen ?? "",
    awayPenalties: item.away_penalties ?? item.awayPen ?? "",
    events: Array.isArray(item.events) ? item.events : [],
    cloudUpdatedAt: item.updated_at || item.updatedAt || "",
  };
}


function matchPhaseRank(phase) {
  const ranks = { waiting: 0, first_half: 1, halftime: 2, second_half: 3, penalty: 4, completed: 5 };
  return ranks[phase || "waiting"] ?? 0;
}

function mergeRuntimeMonotonic(base, runtime) {
  if (!runtime) return base;
  const basePhase = base?.matchPhase || "waiting";
  const runtimePhase = runtime?.matchPhase || "waiting";
  const baseRank = matchPhaseRank(basePhase);
  const runtimeRank = matchPhaseRank(runtimePhase);

  // Bir maç ilerledikten/bitirildikten sonra eski runtime kaydı onu ASLA geriye alamaz.
  if (runtimeRank < baseRank) return base;

  const baseEvents = Array.isArray(base?.events) ? base.events : [];
  const runtimeEvents = Array.isArray(runtime?.events) ? runtime.events : [];
  if (runtimeRank === baseRank && baseEvents.length > runtimeEvents.length) return base;

  const played = base?.played === true || runtime?.played === true || runtimePhase === "completed" || basePhase === "completed";
  const finalPhase = played ? "completed" : runtimePhase;
  return {
    ...base,
    homeScore: Number(runtime?.homeScore ?? base?.homeScore ?? 0),
    awayScore: Number(runtime?.awayScore ?? base?.awayScore ?? 0),
    played,
    live: !played && ["first_half", "halftime", "second_half", "penalty"].includes(finalPhase),
    timerRunning: !played && runtime?.timerRunning === true,
    timerStartedAt: played ? null : (runtime?.timerStartedAt ?? null),
    elapsedSeconds: Number(runtime?.elapsedSeconds ?? base?.elapsedSeconds ?? 0),
    matchPhase: finalPhase,
    events: runtimeEvents.length >= baseEvents.length ? runtimeEvents : baseEvents,
    cloudUpdatedAt: runtime?.updatedAt || base?.cloudUpdatedAt || "",
  };
}

function normalizePublicFixtureCandidate(match) {
  if (!match) return null;
  if (Object.prototype.hasOwnProperty.call(match, "home_score") || Object.prototype.hasOwnProperty.call(match, "match_phase")) {
    return mapCloudFixture(match);
  }
  return {
    ...match,
    played: match.played === true || match.matchPhase === "completed",
    live: match.played === true || match.matchPhase === "completed" ? false : match.live === true,
    timerRunning: match.played === true || match.matchPhase === "completed" ? false : match.timerRunning === true,
    matchPhase: match.played === true ? "completed" : (match.matchPhase || "waiting"),
    events: Array.isArray(match.events) ? match.events : [],
    homeScore: Number(match.homeScore ?? 0),
    awayScore: Number(match.awayScore ?? 0),
  };
}

function cloudTime(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function isMoreAdvancedFixture(candidate, incoming) {
  if (!candidate) return false;
  if (!incoming) return true;
  if (String(candidate?.home || "") !== String(incoming?.home || "") ||
      String(candidate?.away || "") !== String(incoming?.away || "")) return false;

  const candidatePhase = candidate?.played === true ? "completed" : (candidate?.matchPhase || "waiting");
  const incomingPhase = incoming?.played === true ? "completed" : (incoming?.matchPhase || "waiting");
  const candidateRank = matchPhaseRank(candidatePhase);
  const incomingRank = matchPhaseRank(incomingPhase);
  if (candidateRank > incomingRank) {
    const candidateTime = cloudTime(candidate?.cloudUpdatedAt || candidate?.updatedAt);
    const incomingTime = cloudTime(incoming?.cloudUpdatedAt || incoming?.updatedAt);
    // Yönetimde bilinçli "maçı yeniden aç" işlemi daha yeni bir waiting kaydı üretirse
    // eski completed/live görüntüsü bunu kilitlemesin.
    if (incomingTime > candidateTime && incomingTime > 0) return false;
    return true;
  }

  const candidateEvents = Array.isArray(candidate?.events) ? candidate.events.length : 0;
  const incomingEvents = Array.isArray(incoming?.events) ? incoming.events.length : 0;
  if (candidateRank === incomingRank && candidateEvents > incomingEvents) return true;

  // Aynı fazda publicte görünen gerçek skorun 0-0/waiting cevabıyla silinmesini engelle.
  if (candidateRank > 0 && incomingRank === candidateRank) {
    const candidateScore = Number(candidate?.homeScore ?? 0) + Number(candidate?.awayScore ?? 0);
    const incomingScore = Number(incoming?.homeScore ?? 0) + Number(incoming?.awayScore ?? 0);
    if (candidateScore > incomingScore && incomingScore === 0) return true;
  }
  return false;
}

function keepVisibleMatchState(incomingFixtures, previousFixtures, initialFixtures) {
  const incoming = Array.isArray(incomingFixtures) ? incomingFixtures : [];
  const result = new Map(incoming.map((match) => [String(match?.id), match]));
  const protectedSources = [
    ...(Array.isArray(previousFixtures) ? previousFixtures : []),
    ...(Array.isArray(initialFixtures) ? initialFixtures : []),
  ];

  for (const raw of protectedSources) {
    const candidate = normalizePublicFixtureCandidate(raw);
    if (!candidate?.id) continue;
    const key = String(candidate.id);
    const current = result.get(key);
    if (isMoreAdvancedFixture(candidate, current)) result.set(key, candidate);
  }
  return sortFixturesBySchedule([...result.values()]);
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
  const [remoteFixtures, setRemoteFixtures] = useState(null);
  const [publicMatchCenterId, setPublicMatchCenterId] = useState("");
  const [remoteTeams, setRemoteTeams] = useState(null);
  const [remoteSquads, setRemoteSquads] = useState(null);
  const [remoteKnockout, setRemoteKnockout] = useState([]);
  const [activeFixtureIds, setActiveFixtureIds] = useState(null);
  const activeFixtureIdsRef = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [lastSync, setLastSync] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const refreshSequence = useRef(0);
  const lastAppliedRefreshSequence = useRef(0);

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
    const sequence = ++refreshSequence.current;

    const [fixturesResult, teamsResult, squadsResult, knockoutResult, activeFixtureResult, publicCenterResult, runtimeResult, completedResult, snapshotResult] = await Promise.allSettled([
      supabase.from("fixtures").select("*").order("id"),
      supabase.from("teams").select("id,name").order("id"),
      supabase.from("app_state").select("value,updated_at").eq("id", "squads").maybeSingle(),
      supabase.from("app_state").select("value,updated_at").eq("id", "knockout").maybeSingle(),
      supabase.from("app_state").select("value,updated_at").eq("id", "active_fixture_ids").maybeSingle(),
      supabase.from("app_state").select("value,updated_at").eq("id", "public_match_center").maybeSingle(),
      supabase.from("app_state").select("value,updated_at").eq("id", "fixture_runtime").maybeSingle(),
      supabase.from("app_state").select("value,updated_at").eq("id", "completed_fixture_results").maybeSingle(),
      supabase.from("app_state").select("value,updated_at").eq("id", "fixtures_snapshot").maybeSingle(),
    ]);

    // Realtime sırasında fixtures + runtime + snapshot art arda değişebilir.
    // Önceki mantık yeni bir refresh BAŞLADIĞI anda devam eden isteği çöpe atıyordu;
    // yoğun maç işlemlerinde hiçbir istek tamamlanamıyor ve public ancak F5 ile güncelleniyordu.
    // Sadece DAHA YENİ bir cevap gerçekten ekrana uygulandıysa bu eski cevabı yok say.
    if (sequence < lastAppliedRefreshSequence.current) return;
    lastAppliedRefreshSequence.current = sequence;

    let mappedFixtures = null;
    let stagedKnockout = null;
    let currentActiveIds = activeFixtureIdsRef.current;
    if (publicCenterResult.status === "fulfilled") {
      const { data: centerRow, error: centerError } = publicCenterResult.value;
      if (!centerError) setPublicMatchCenterId(String(centerRow?.value?.matchId || ""));
    }
    let runtimeMap = {};
    let completedMap = {};
    let snapshotMap = {};
    let snapshotFixtures = [];
    let snapshotUpdatedAt = "";
    if (runtimeResult.status === "fulfilled") {
      const { data: runtimeRow, error: runtimeError } = runtimeResult.value;
      if (!runtimeError && runtimeRow?.value && typeof runtimeRow.value === "object" && !Array.isArray(runtimeRow.value)) runtimeMap = runtimeRow.value;
    }

    if (completedResult.status === "fulfilled") {
      const { data: completedRow, error: completedError } = completedResult.value;
      if (!completedError && completedRow?.value && typeof completedRow.value === "object" && !Array.isArray(completedRow.value)) completedMap = completedRow.value;
    }

    if (snapshotResult.status === "fulfilled") {
      const { data: snapshotRow, error: snapshotError } = snapshotResult.value;
      const list = !snapshotError && Array.isArray(snapshotRow?.value?.fixtures) ? snapshotRow.value.fixtures : [];
      snapshotFixtures = list;
      snapshotUpdatedAt = snapshotRow?.value?.updatedAt || snapshotRow?.updated_at || "";
      snapshotMap = Object.fromEntries(
        list
          .filter((match) => match?.id !== null && match?.id !== undefined && match?.id !== "")
          .map((match) => [String(match.id), match])
      );
    }

    if (activeFixtureResult.status === "fulfilled") {
      const { data: activeRow, error: activeError } = activeFixtureResult.value;
      if (!activeError) {
        const ids = Array.isArray(activeRow?.value?.ids) ? activeRow.value.ids : null;
        currentActiveIds = ids;
        activeFixtureIdsRef.current = ids;
        setActiveFixtureIds(ids);
      }
    }

    const fixtureRows = fixturesResult.status === "fulfilled" && !fixturesResult.value?.error && Array.isArray(fixturesResult.value?.data)
      ? fixturesResult.value.data
      : [];

    if (snapshotFixtures.length > 0 || fixtureRows.length > 0) {
      const data = fixtureRows;
        // Yönetim snapshot'ı mevcutsa PUBLIC için esas fikstür budur.
        // Önceki kod snapshot'ı yalnız fixtures tablosunda zaten bulunan satırların üstüne
        // bindiriyordu. Supabase fixtures cevabında güncel maç eksikse public ilk doğru
        // görüntüden sonra remoteFixtures ile o maçı tamamen siliyordu.
        const sourceRows = snapshotFixtures.length > 0
          ? snapshotFixtures.map((match) => ({
              id: match.id,
              home: match.home || "",
              away: match.away || "",
              date: match.date || null,
              time: match.time || null,
              pitch: match.field || match.pitch || null,
              field: match.field || match.pitch || null,
              week: match.week ?? null,
              home_score: Number(match.homeScore ?? 0),
              away_score: Number(match.awayScore ?? 0),
              played: match.played === true || match.matchPhase === "completed",
              live: match.live === true,
              timer_running: match.timerRunning === true,
              timer_started_at: match.timerStartedAt ?? null,
              elapsed_seconds: Number(match.elapsedSeconds ?? 0),
              match_phase: match.played === true ? "completed" : (match.matchPhase || "waiting"),
              events: Array.isArray(match.events) ? match.events : [],
              updated_at: match.updatedAt || snapshotUpdatedAt || "",
            }))
          : data;

        // active_fixture_ids Maç Merkezi seçimi değildir; DrawManager mevcut turnuvanın
        // TÜM lig fikstür ID'lerini buraya yazar. Supabase DELETE/RLS eski satırları
        // bıraksa bile canlı takip yalnız güncel turnuvanın maçlarını göstermelidir.
        // Bu filtre eski test maçının (ör. 21:00) gecenin en başında kalmasını da önler.
        // active_fixture_ids bazen Supabase/app_state yenilenirken geçici olarak [] dönebilir.
        // Boş dizi "aktif fikstür yok" anlamına gelmez; filtre uygularsak canlı ekran
        // bir yenilemede bütün maçları silip sonraki yenilemede tekrar gösterir.
        // Yalnız gerçekten en az bir aktif ID varsa filtrele.
        // Snapshot zaten yönetimdeki güncel turnuvanın tamamıdır; snapshot kullanılırken
        // active_fixture_ids ile tekrar filtrelemek doğru maçı yeniden saklayabilir.
        const activeIdSet = snapshotFixtures.length > 0
          ? null
          : (Array.isArray(currentActiveIds) && currentActiveIds.length > 0
              ? new Set(currentActiveIds.map((id) => String(id)))
              : null);

        const currentRows = activeIdSet
          ? sourceRows.filter((row) => {
              const key = String(row?.id);
              if (activeIdSet.has(key)) return true;

              // Tamamlanan maç aktif fikstür ID listesinden yanlışlıkla düşse bile
              // public ekrandan ASLA kaybolamaz. Önceki kod bu filtreyi arşiv merge'inden
              // önce uyguladığı için bitmiş maç ilk görüntüden sonra siliniyordu.
              const completed = completedMap[key];
              if (completed &&
                  String(completed?.id ?? "") === key &&
                  completed?.home === row?.home &&
                  completed?.away === row?.away) return true;

              // Yönetimin tek-kaynak snapshot'ı bu maçı güncel/live/completed olarak biliyorsa
              // active_fixture_ids onu publicten saklayamaz. Takım çifti de eşleşmeli.
              const snap = snapshotMap[key];
              if (snap && String(snap?.id ?? "") === key && snap?.home === row?.home && snap?.away === row?.away &&
                  (snap?.played === true || snap?.matchPhase === "completed" || snap?.live === true)) return true;

              // Arşiv yazısı bir an gecikirse completed runtime da aynı korumayı sağlar.
              const runtime = runtimeMap[key];
              return Boolean(runtime &&
                String(runtime?.id ?? "") === key &&
                (runtime?.played === true || runtime?.matchPhase === "completed"));
            })
          : sourceRows;

        mappedFixtures = sortFixturesBySchedule(currentRows.map((row) => {
          let merged = mapCloudFixture(row);
          const snap = snapshotMap[String(row?.id)];
          if (snap &&
              String(snap?.id ?? "") === String(row?.id ?? "") &&
              snap?.home === row?.home &&
              snap?.away === row?.away) {
            merged = mergeRuntimeMonotonic(merged, {
              ...snap,
              updatedAt: snap?.updatedAt || "",
            });
          }
          const runtime = runtimeMap[String(row?.id)];
          if (runtime && String(runtime?.id ?? "") === String(row?.id ?? "")) {
            merged = mergeRuntimeMonotonic(merged, runtime);
          }

          // Bitmiş maç arşivi append-only kaynaktır. Aynı fixture kimliği + takım çifti
          // eşleşiyorsa hiçbir waiting/canlı/runtime kaydı tamamlanmış sonucu geri alamaz.
          const completed = completedMap[String(row?.id)];
          if (completed &&
              String(completed?.id ?? "") === String(row?.id ?? "") &&
              completed?.home === row?.home &&
              completed?.away === row?.away) {
            const mergedEvents = Array.isArray(merged?.events) ? merged.events : [];
            const completedEvents = Array.isArray(completed?.events) ? completed.events : [];
            merged = {
              ...merged,
              homeScore: Number(completed?.homeScore ?? merged?.homeScore ?? 0),
              awayScore: Number(completed?.awayScore ?? merged?.awayScore ?? 0),
              played: true,
              live: false,
              timerRunning: false,
              timerStartedAt: null,
              elapsedSeconds: Number(completed?.elapsedSeconds ?? merged?.elapsedSeconds ?? 0),
              matchPhase: "completed",
              events: completedEvents.length >= mergedEvents.length ? completedEvents : mergedEvents,
              cloudUpdatedAt: completed?.updatedAt || merged?.cloudUpdatedAt || "",
            };
          }
          return merged;
        }));
        setRemoteFixtures((previous) => keepVisibleMatchState(mappedFixtures, previous, fixtures));
    }

    if (teamsResult.status === "fulfilled") {
      const { data: teamRows, error: teamsError } = teamsResult.value;
      if (!teamsError && Array.isArray(teamRows)) {
        setRemoteTeams(teamRows.map((row) => row?.name).filter(Boolean));
      }
    }

    if (squadsResult.status === "fulfilled") {
      const { data: squadsRow, error: squadsError } = squadsResult.value;
      if (!squadsError) {
        const value = squadsRow?.value;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          setRemoteSquads(value);
        } else {
          setRemoteSquads({});
        }
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
          live: m.live === true && m.played !== true && m.matchPhase !== "completed" && m.matchPhase !== "waiting",
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
    refreshTeams();
    const teamPoll = window.setInterval(refreshTeams, 1500);

    const teamChannel = supabase
      .channel(`sscup-public-teams-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, refreshTeams)
      .subscribe();

    return () => {
      window.clearInterval(teamPoll);
      supabase.removeChannel(teamChannel);
    };
  }, [refreshTeams]);

  // SAHA GÜVENLİ MODU:
  // Public ekranın kritik maç verisi tek hafif sorgudan gelir:
  // fixtures_snapshot = skor/faz/olaylar, public_match_center = hazırlanan maç.
  // Bu poll realtime çalışmasa bile açık sayfayı F5 istemeden güncel tutar.
  useEffect(() => {
    let disposed = false;

    const pullPublicMatchState = async () => {
      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("id,value,updated_at")
          .in("id", ["fixtures_snapshot", "public_match_center"]);

        if (disposed || error || !Array.isArray(data)) return;

        const snapshotRow = data.find((row) => row?.id === "fixtures_snapshot");
        const centerRow = data.find((row) => row?.id === "public_match_center");

        if (centerRow) {
          setPublicMatchCenterId(String(centerRow?.value?.matchId || ""));
        }

        if (Array.isArray(snapshotRow?.value?.fixtures)) {
          const updatedAt = snapshotRow?.value?.updatedAt || snapshotRow?.updated_at || "";
          const mapped = sortFixturesBySchedule(
            snapshotRow.value.fixtures
              .filter((match) => match?.isKnockout !== true && match?.id !== null && match?.id !== undefined && match?.id !== "")
              .map((match) => normalizePublicFixtureCandidate({
                ...match,
                updatedAt: match?.updatedAt || updatedAt,
                cloudUpdatedAt: match?.cloudUpdatedAt || updatedAt,
              }))
              .filter(Boolean)
          );

          if (!disposed) {
            setRemoteFixtures((previous) => keepVisibleMatchState(mapped, previous, fixtures));
          }
        }

        if (!disposed) setLastSync(new Date());
      } catch (error) {
        console.warn("Public maç durumu yenileme hatası:", error);
      }
    };

    pullPublicMatchState();
    const publicStatePoll = window.setInterval(pullPublicMatchState, 1000);

    return () => {
      disposed = true;
      window.clearInterval(publicStatePoll);
    };
  }, [fixtures]);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 3000);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.active_fixture_ids" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.public_match_center" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.fixture_runtime" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.completed_fixture_results" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.fixtures_snapshot" }, refresh)
      .subscribe();

    return () => {
      refreshSequence.current += 1;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
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
  // TEK KAYNAK SIRASI:
  // Önce tarih, aynı tarihte saat. Bundan sonraki bütün Canlı Takip
  // bölümleri bu kronolojik listeyi kullanır.
  const displayFixtures = sortFixturesBySchedule([
    ...leagueFixtures.filter((m) => !m?.isKnockout || !knockoutKeys.has(m.knockoutKey)),
    ...knockoutMatches,
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
  const liveMatch = liveMatches[0] || null;
  const preparedMatch = !liveMatch && publicMatchCenterId
    ? displayFixtures.find((match) => String(match?.id ?? "") === publicMatchCenterId && match?.played !== true) || null
    : null;
  const featuredMatch = liveMatch || preparedMatch;
  const upcoming = displayFixtures.filter(
    (match) => match?.played !== true && match?.live !== true
  );
  const recent = displayFixtures.filter((match) => match?.played === true).slice().reverse().slice(0, 8);

  const todayDate = new Date(now);
  const todayKey = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;

  const nightMatches = useMemo(() => {
    // Maç Merkezi seçimi / geri çekme sıralamayı ASLA etkilemez.
    // Gecenin maçları yalnız gerçek fikstür saatine göre dizilir.
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

  const liveStandings = useMemo(() => {
    // Takip sayfasında eski tarayıcı/localStorage verisine geri düşme.
    // Bulut fikstürü geldiyse puan durumu yalnızca güncel turnuvadan hesaplanır.
    if (Array.isArray(remoteFixtures)) {
      return calculateStandings(displayTeams, displayFixtures);
    }
    const calculated = calculateStandings(displayTeams, displayFixtures);
    return calculated.length > 0 ? calculated : standings;
  }, [displayTeams, displayFixtures, standings, remoteFixtures]);

  const liveScorers = useMemo(() => {
    // Yeni turnuvada henüz gol yoksa [] dönmeli; eski local gol krallığına
    // fallback yapmak eski golcüleri canlı takipte yeniden gösteriyordu.
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
  const minute = getMinute(liveMatch, now, settings.halfDurationMinutes || 30);
  const playedCount = displayFixtures.filter((match) => match?.played === true).length;
  const tournamentName = settings.tournamentName || settings.title || "S&S CUP";

  // Final tamamlandığında şampiyonu doğrudan final skorundan/penaltısından bul.
  // Böylece app_state içinde ayrıca winner/champion alanı tutulmasına ihtiyaç kalmaz.
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
          <div className="public-brand-mark">🏆</div>
          <div><span className="public-kicker">RESMİ CANLI TURNUVA MERKEZİ</span><h1>{tournamentName}</h1><p>{settings.slogan || "Kazanan Sahada Belli Olur"}</p>{settings.mainSponsor && <small style={{ display: "block", marginTop: "5px", fontWeight: 900 }}>🤝 ANA SPONSOR • {settings.mainSponsor}</small>}</div>
        </div>
        <div className="public-header-meta"><span>{settings.season || "2026"}</span><span>📍 {settings.venue || "Gol Park"}</span><span className="public-sync-dot">● CANLI VERİ</span></div>
      </header>

      <main className="public-live-shell">
        {championName && activeTab === "overview" && (
          <section className="public-champion-card">
            <div className="public-champion-glow glow-left" />
            <div className="public-champion-glow glow-right" />
            <div className="public-champion-trophy trophy-left">🏆</div>
            <div className="public-champion-trophy trophy-right">🏆</div>
            <div className="public-champion-content">
              <span className="public-champion-kicker">🏆 S&S CUP ŞAMPİYONU 🏆</span>
              <h2>{championName}</h2>
              <strong>{settings.season || "2026"} ŞAMPİYONU</strong>
              <div className="public-champion-final">
                <span>FİNAL</span>
                <b>{finalMatch.home}</b>
                <strong>{scoreText(finalMatch.homeScore)} - {scoreText(finalMatch.awayScore)}</strong>
                <b className="champion-winner-side">{finalMatch.away}</b>
                {championPenaltyText && <em>{championPenaltyText}</em>}
              </div>
            </div>
          </section>
        )}

        {featuredMatch && (
          <section className="public-live-scoreboard public-clickable" onClick={() => setSelectedMatch(featuredMatch)}>
            <div className="public-scoreboard-topline"><div className="public-live-pill"><i /> {liveMatch ? "CANLI" : "MAÇ MERKEZİ"}</div><div className="public-match-status">{liveMatch ? (minute || "CANLI") : "BAŞLAMAYI BEKLİYOR"}</div><div className="public-stage-label">{stageText(featuredMatch)}</div></div>
            <div className="public-score-grid">
              <div className="public-score-team home"><span>EV SAHİBİ</span><strong>{featuredMatch.home}</strong></div>
              <div className="public-score-center"><div className="public-score-numbers"><b>{scoreText(featuredMatch.homeScore)}</b><em>:</em><b>{scoreText(featuredMatch.awayScore)}</b></div><small>{featuredMatch.time || ""} {featuredMatch.field ? `• ${featuredMatch.field}` : ""}</small></div>
              <div className="public-score-team away"><span>DEPLASMAN</span><strong>{featuredMatch.away}</strong></div>
            </div>
            {lastGoal && <div className="public-last-goal"><span>⚽</span><div><b>SON GOL</b><strong>{lastGoal.player}</strong><small>{lastGoal.team}{lastGoal.minute !== "" ? ` • ${lastGoal.minute}'` : ""}</small></div></div>}
            <div className="public-tap-hint">Maç olaylarını görmek için tıkla ›</div>
          </section>
        )}

        <section className="public-stat-grid public-stat-grid-top">
          <article><span>👥</span><div><strong>{displayTeams.length}</strong><b>TAKIM</b><small>Mücadele ediyor</small></div></article>
          <article><span>⚽</span><div><strong>{playedCount}</strong><b>OYNANAN MAÇ</b><small>Toplam</small></div></article>
          <article><span>🕘</span><div><strong>{upcoming.length}</strong><b>BEKLEYEN MAÇ</b><small>Yaklaşan</small></div></article>
          <article><span>👑</span><div><strong>{topScorer?.goals || 0}</strong><b>LİDER GOL</b><small>{topScorer?.playerName || topScorer?.name || "Gol Kralı"}</small></div></article>
        </section>

        <nav className="public-tabbar">
          {[["overview","⚡","Genel"],["fixtures","📅","Fikstür"],["standings","📊","Puan Durumu"],["scorers","👑","Gol Krallığı"],["teams","👕","Takımlar"],["knockout","🏆","Eleme Turları"]].map(([id, icon, label]) => (
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
                  {liveStandings.map((team, index) => <tr key={team.team}><td><span className={`public-mini-rank rank-${index + 1}`}>{index + 1}</span></td><td><strong>{team.team}</strong></td><td>{team.played}</td><td>{team.won}</td><td>{team.drawn}</td><td>{team.lost}</td><td><b>{team.points}</b></td><td>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</td></tr>)}
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

        {activeTab === "teams" && (
          <section className="public-section public-teams-section">
            <div className="public-section-head"><div><span>TAKIM KADROLARI</span><h2>Takımlar</h2></div><b>{displayTeams.length} takım</b></div>
            {!selectedTeamName ? (
              <div className="public-team-grid">
                {displayTeams.map((team, index) => {
                  const teamName = typeof team === "string" ? team : team?.name || team?.teamName || `Takım ${index + 1}`;
                  const playerCount = Array.isArray(displaySquads?.[teamName]) ? displaySquads[teamName].length : 0;
                  return (
                    <button key={teamName} type="button" className="public-team-card" onClick={() => setSelectedTeamName(teamName)}>
                      <span className="public-team-card-number">{String(index + 1).padStart(2, "0")}</span>
                      <strong>{teamName}</strong>
                      <small>{playerCount} oyuncu</small>
                      <b>Kadroyu Gör ›</b>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="public-squad-panel">
                <button type="button" className="public-team-back" onClick={() => setSelectedTeamName("")}>‹ Tüm Takımlar</button>
                <div className="public-squad-title"><span>👕</span><div><small>TAKIM KADROSU</small><h3>{selectedTeamName}</h3></div></div>
                {(!Array.isArray(displaySquads?.[selectedTeamName]) || displaySquads[selectedTeamName].length === 0) ? (
                  <div className="public-empty-box">Bu takım için kayıtlı oyuncu bulunmuyor.</div>
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

      <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} now={now} halfDurationMinutes={settings.halfDurationMinutes || 30} />
    </div>
  );
}
