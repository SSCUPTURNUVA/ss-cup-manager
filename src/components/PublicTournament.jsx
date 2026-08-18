import { useEffect, useMemo, useState } from "react";
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
  return {
    id: item.id,
    home: item.home,
    away: item.away,
    date: item.date,
    time: item.time,
    field: item.pitch || item.field,
    week: item.week,
    played: item.played,
    homeScore: item.home_score,
    awayScore: item.away_score,
    live: item.live,
    timerRunning: item.timer_running,
    timerStartedAt: item.timer_started_at,
    elapsedSeconds: item.elapsed_seconds,
    matchPhase: item.match_phase,
    isKnockout: item.is_knockout === true,
    knockoutKey: item.knockout_key || "",
    stageLabel: item.stage || item.stage_label || "",
    homePenalties: item.home_penalties,
    awayPenalties: item.away_penalties,
    events: Array.isArray(item.events) ? item.events : [],
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
          <div className="public-modal-pen">Penaltılar: {safeNumber(match.homePenalties)} - {safeNumber(match.awayPenalties)}</div>
        )}
        <div className="public-modal-place">📍 {match.field || "Gol Park Halı Saha"} {match.time ? `• ${match.time}` : ""}</div>
        <div className="public-modal-divider" />
        <div className="public-modal-events-title"><span>MAÇ OLAYLARI</span><b>{events.length}</b></div>
        {events.length === 0 ? (
          <div className="public-modal-empty">{match.played ? "Bu maç için kayıtlı olay bulunmuyor." : "Maç başladığında goller ve kartlar burada görünecek."}</div>
        ) : (
          <div className="public-modal-events">
            {events.map((event) => (
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
  const [now, setNow] = useState(Date.now());
  const [lastSync, setLastSync] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const { data, error } = await supabase.from("fixtures").select("*").order("id");
      if (!active || error || !data) return;
      const mapped = data.map(mapCloudFixture);
      setRemoteFixtures(mapped);
      setLastSync(new Date());
      if (selectedMatch) {
        const updated = mapped.find((m) => String(m.id) === String(selectedMatch.id));
        if (updated) setSelectedMatch(updated);
      }
    }
    refresh();
    const poll = window.setInterval(refresh, 2500);
    return () => { active = false; window.clearInterval(poll); };
  }, [selectedMatch?.id]);

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

  const displayFixtures = remoteFixtures.length > 0 ? remoteFixtures : fixtures;
  const liveMatches = displayFixtures.filter((match) => match?.live === true && match?.played !== true);
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

  return (
    <div className="public-live-page">
      <div className="public-stadium-light light-left" />
      <div className="public-stadium-light light-right" />
      <header className="public-live-header">
        <div className="public-brand-block">
          <div className="public-brand-mark">S&S</div>
          <div><span className="public-kicker">RESMİ CANLI TURNUVA MERKEZİ</span><h1>{tournamentName}</h1><p>{settings.slogan || "Kazanan Sahada Belli Olur"}</p></div>
        </div>
        <div className="public-header-meta"><span>{settings.season || "2026"}</span><span>📍 {settings.venue || "Gol Park"}</span><span className="public-sync-dot">● CANLI VERİ</span></div>
      </header>

      <main className="public-live-shell">
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
          {[["overview","⚡","Genel"],["fixtures","📅","Fikstür"],["standings","📊","Puan Durumu"],["scorers","👑","Gol Krallığı"]].map(([id, icon, label]) => (
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

        <footer className="public-live-footer"><div><b>{tournamentName}</b><span>{settings.slogan || "Kazanan Sahada Belli Olur"}</span></div><small>{lastSync ? `Son veri: ${lastSync.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Canlı veri bağlantısı kuruluyor…"}</small></footer>
      </main>

      <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} now={now} halfDurationMinutes={settings.halfDurationMinutes || 25} />
    </div>
  );
}
