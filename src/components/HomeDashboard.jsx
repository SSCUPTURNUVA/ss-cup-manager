import { useEffect, useState } from "react";
import BackupManager from "./BackupManager";
import NewTournament from "./NewTournament";

function getTeamName(team) {
  return typeof team === "string"
    ? team
    : team?.name || team?.teamName || "";
}

export default function HomeDashboard({
  teams,
  fixtures,
  standings,
  goalScorers,
  setTeams,
  setFixtures,
  setDrawOrder,
  setGoalScorers,
  setSettings,
  settings,
  onNavigate,
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayIso = now.toLocaleDateString("en-CA");
  const dateLabel = now.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const teamNames = new Set(teams.map(getTeamName).filter(Boolean));

  // Takım listesi sıfırlandığında eski veya bozuk fikstürlerin ana ekranda
  // görünmesini engeller. Böylece Akıllı Asistan eski maçları saymaz.
  const validFixtures = teams.length
    ? fixtures.filter(
        (match) =>
          match?.home &&
          match?.away &&
          teamNames.has(match.home) &&
          teamNames.has(match.away)
      )
    : [];

  const sortedFixtures = [...validFixtures].sort((a, b) => {
    const first = `${a.date || "9999-12-31"} ${a.time || "99:99"}`;
    const second = `${b.date || "9999-12-31"} ${b.time || "99:99"}`;
    return first.localeCompare(second);
  });

  const scheduledToday = sortedFixtures.filter(
    (match) => match.date === todayIso
  );

  const visibleMatches =
    scheduledToday.length > 0
      ? scheduledToday
      : sortedFixtures.filter((match) => match.played !== true).slice(0, 4);

  const pendingToday = visibleMatches.filter(
    (match) => match.played !== true
  );
  const completedToday = visibleMatches.filter(
    (match) => match.played === true
  );
  const liveMatch = pendingToday.find((match) => match.live === true);
  const nextMatch = liveMatch || pendingToday[0] || null;

  const playedMatches = validFixtures.filter(
    (match) => match.played === true
  );
  const leagueMatches = validFixtures.filter(
    (match) => match?.isKnockout !== true
  );
  const pendingLeagueMatches = leagueMatches.filter(
    (match) => match.played !== true
  );
  const knockoutMatches = validFixtures.filter(
    (match) => match?.isKnockout === true
  );

  const progress = validFixtures.length
    ? Math.round((playedMatches.length / validFixtures.length) * 100)
    : 0;

  const currentWeek = pendingLeagueMatches
    .map((match) => Number(match.week))
    .filter((week) => Number.isFinite(week) && week > 0)
    .sort((a, b) => a - b)[0];

  const lastResult = [...playedMatches].sort((a, b) => {
    const first = `${a.date || "0000-00-00"} ${a.time || "00:00"}`;
    const second = `${b.date || "0000-00-00"} ${b.time || "00:00"}`;
    return second.localeCompare(first);
  })[0];

  const leagueComplete =
    leagueMatches.length > 0 && pendingLeagueMatches.length === 0;

  const smartAlerts = [];

  if (teams.length === 0) {
    smartAlerts.push({
      tone: "warning",
      icon: "👥",
      title: "Takım listesi boş",
      text: "Turnuvaya başlayabilmek için önce takımları ekleyin.",
      action: "teams",
      actionLabel: "Takımları Aç",
    });
  } else if (leagueMatches.length === 0) {
    const needsMoreTeams = teams.length < 2;
    smartAlerts.push({
      tone: "warning",
      icon: needsMoreTeams ? "👥" : "🎲",
      title: needsMoreTeams
        ? `${teams.length} takım kayıtlı`
        : "Fikstür henüz oluşturulmadı",
      text: needsMoreTeams
        ? "Test yapabilirsiniz; gerçek kura için takım eklemeye devam edin."
        : `${teams.length} takım hazır. Fanus ve lig kurası aşamasına geçebilirsiniz.`,
      action: needsMoreTeams ? "teams" : "draw",
      actionLabel: needsMoreTeams ? "Takım Ekle" : "Kuraya Git",
    });
  } else if (pendingLeagueMatches.length > 0) {
    smartAlerts.push({
      tone: "info",
      icon: "📝",
      title: `${pendingLeagueMatches.length} lig maçı bekliyor`,
      text: currentWeek
        ? `${currentWeek}. hafta devam ediyor. Oynanan maçların skorlarını Maç Merkezi'nden kaydedin.`
        : "Oynanan maçların skorlarını Maç Merkezi'nden kaydedin.",
      action: "matchcenter",
      actionLabel: "Maç Merkezini Aç",
    });
  }

  if (leagueComplete && knockoutMatches.length === 0) {
    smartAlerts.push({
      tone: "success",
      icon: "🏆",
      title: "Lig aşaması tamamlandı",
      text: "İlk 8 takım belli oldu. Çeyrek final kura aşamasına geçebilirsiniz.",
      action: "knockout",
      actionLabel: "Eleme Turuna Git",
    });
  }

  if (smartAlerts.length === 0) {
    smartAlerts.push({
      tone: "success",
      icon: "✅",
      title: "Turnuva kontrol altında",
      text: "Şu anda acil bekleyen bir yönetim işlemi bulunmuyor.",
    });
  }

  const topScorer = goalScorers[0];
  const leader = standings[0];
  const totalGoals = playedMatches.reduce(
    (sum, match) =>
      sum + Number(match.homeScore || 0) + Number(match.awayScore || 0),
    0
  );
  const remainingMatches = Math.max(validFixtures.length - playedMatches.length, 0);

  function openMatch(match) {
    if (!match || match.played === true) return;

    const updatedFixtures = fixtures.map((fixture) => ({
      ...fixture,
      live: fixture.id === match.id,
      timerRunning:
        fixture.id === match.id ? fixture.timerRunning === true : false,
    }));

    setFixtures(updatedFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));
    onNavigate("matchcenter");
  }

  const quickActions = [
    { id: "matchcenter", icon: "🏟️", label: "Maç Merkezi", primary: true },
    { id: "standings", icon: "📊", label: "Puan Durumu" },
    { id: "scorers", icon: "🥇", label: "Gol Krallığı" },
    { id: "knockout", icon: "🏆", label: "Eleme Turu" },
    { id: "fixture", icon: "📅", label: "Fikstür" },
    { id: "teams", icon: "👥", label: "Takımlar" },
  ];

  return (
    <div className="page-stack dashboard-v2">
      <section className="dashboard-identity">
        <div className="dashboard-identity-copy">
          <span className="dashboard-kicker">S&amp;S CUP MANAGER PRO</span>
          <h2>🏆 {settings.tournamentName}</h2>
          <p>{settings.season} • {settings.slogan}</p>
          <small className="dashboard-subtitle">Turnuva Kontrol Merkezi</small>
          <div className="dashboard-identity-meta">
            {settings.venue && <span>🏟️ {settings.venue}</span>}
            {settings.organizer && <span>👤 {settings.organizer}</span>}
            {settings.mainSponsor && <span>🤝 {settings.mainSponsor}</span>}
          </div>
        </div>
        <div className="dashboard-live-panel" aria-label="Turnuva durumu ve saat">
          <span className="dashboard-live-status"><i /> Turnuva Aktif</span>
          <strong>{timeLabel}</strong>
          <small>{dateLabel}</small>
          <div className="dashboard-team-count">
            <strong>{teams.length}</strong>
            <span>Takım</span>
          </div>
        </div>
      </section>

      <section className="dashboard-kpi-grid" aria-label="Turnuva özeti">
        <article><span>👥</span><div><strong>{teams.length}</strong><small>Takım</small></div></article>
        <article><span>✅</span><div><strong>{playedMatches.length}</strong><small>Oynanan Maç</small></div></article>
        <article><span>⏳</span><div><strong>{remainingMatches}</strong><small>Kalan Maç</small></div></article>
        <article><span>⚽</span><div><strong>{totalGoals}</strong><small>Toplam Gol</small></div></article>
      </section>

      <section className="dashboard-command-grid">
        <article className="tournament-progress-card">
          <div className="progress-card-heading">
            <div>
              <span className="dashboard-kicker">TURNUVA DURUMU</span>
              <h3>{leagueComplete ? "Eleme Aşaması" : currentWeek ? `${currentWeek}. Hafta` : "Hazırlık Aşaması"}</h3>
            </div>
            <strong>%{progress}</strong>
          </div>
          <div className="tournament-progress-track" aria-label={`Turnuva ilerlemesi yüzde ${progress}`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-details">
            <span>✅ {playedMatches.length} tamamlandı</span>
            <span>⌛ {Math.max(validFixtures.length - playedMatches.length, 0)} kaldı</span>
          </div>
          {lastResult && (
            <div className="last-result-box">
              <small>SON GİRİLEN SONUÇ</small>
              <strong>{lastResult.home} {lastResult.homeScore} - {lastResult.awayScore} {lastResult.away}</strong>
            </div>
          )}
        </article>

        <article className="smart-alerts-card">
          <div className="today-heading"><div><span className="dashboard-kicker">AKILLI ASİSTAN</span><h3>🔔 Bekleyen İşlemler</h3></div></div>
          <div className="smart-alert-list">
            {smartAlerts.map((alert, index) => (
              <div className={`smart-alert smart-alert-${alert.tone}`} key={`${alert.title}-${index}`}>
                <span className="smart-alert-icon">{alert.icon}</span>
                <div><strong>{alert.title}</strong><p>{alert.text}</p></div>
                {alert.action && <button type="button" onClick={() => onNavigate(alert.action)}>{alert.actionLabel}</button>}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="today-section">
        <div className="today-heading">
          <div><span className="dashboard-kicker">{scheduledToday.length > 0 ? "BUGÜN" : "SIRADAKİ PROGRAM"}</span><h3>📅 Bugünün Maçları</h3></div>
          <span className="today-counter">{pendingToday.length} maç bekliyor</span>
        </div>

        {nextMatch ? (
          <article className={`featured-match ${nextMatch.live ? "is-live" : ""}`}>
            <div className="featured-match-status">{nextMatch.live ? "🔴 ŞİMDİ OYNANIYOR" : "🟢 SIRADAKİ MAÇ"}</div>
            <div className="featured-match-time">{nextMatch.time || "Saat yok"}</div>
            <div className="featured-match-teams"><strong>{nextMatch.home}</strong><span>VS</span><strong>{nextMatch.away}</strong></div>
            <div className="featured-match-meta"><span>📍 {nextMatch.pitch || nextMatch.field || "Saha 1"}</span><span>📅 {nextMatch.date || "Tarih belirlenmedi"}</span></div>
            <button type="button" className="open-match-button" onClick={() => openMatch(nextMatch)}>{nextMatch.live ? "🏟️ MAÇA DÖN" : "▶️ MAÇI AÇ"}</button>
          </article>
        ) : (
          <div className="dashboard-empty-state">
            <span>{teams.length === 0 ? "👥" : "📅"}</span>
            <h3>{teams.length === 0 ? "Önce takımları ekleyin" : "Henüz fikstür oluşturulmadı"}</h3>
            <p>{teams.length === 0 ? "Takımlar eklendikten sonra kura ve fikstür oluşturabilirsiniz." : "Kura tamamlandığında sıradaki maç burada görünecek."}</p>
          </div>
        )}

        {pendingToday.length > 1 && (
          <div className="upcoming-match-list">
            {pendingToday.filter((match) => match.id !== nextMatch?.id).map((match) => (
              <article key={match.id || `${match.home}-${match.away}-${match.time}`}>
                <div className="upcoming-time">{match.time || "--:--"}</div>
                <div className="upcoming-teams"><strong>{match.home}</strong><span>—</span><strong>{match.away}</strong></div>
                <button type="button" onClick={() => openMatch(match)}>Aç</button>
              </article>
            ))}
          </div>
        )}

        {completedToday.length > 0 && (
          <details className="completed-matches"><summary>✅ Tamamlanan Maçlar ({completedToday.length})</summary><div>
            {completedToday.map((match) => <p key={match.id || `${match.home}-${match.away}-${match.time}`}><span>{match.time || ""}</span><strong>{match.home}</strong><b>{match.homeScore} - {match.awayScore}</b><strong>{match.away}</strong></p>)}
          </div></details>
        )}
      </section>

      <section className="quick-actions-section">
        <div className="today-heading"><div><span className="dashboard-kicker">TEK DOKUNUŞ</span><h3>⚡ Hızlı İşlemler</h3></div></div>
        <div className="quick-actions-grid">
          {quickActions.map((action) => <button key={action.id} type="button" className={action.primary ? "primary-action" : ""} onClick={() => onNavigate(action.id)}><span>{action.icon}</span><strong>{action.label}</strong></button>)}
        </div>
      </section>

      <section className="dashboard-mini-summary">
        <article><span>🥇</span><strong>{leader?.team || "—"}</strong><small>{leader ? `${leader.points} puanla lider` : "Lider bekleniyor"}</small></article>
        <article><span>👑</span><strong>{topScorer?.playerName || topScorer?.name || "—"}</strong><small>{topScorer ? `${topScorer.goals || 0} gol` : "Golcü bekleniyor"}</small></article>
        <article><span>📈</span><strong>%{progress}</strong><small>Turnuva tamamlanma oranı</small></article>
      </section>

      <section className="panel-card admin-card compact-admin-card">
        <div className="section-title"><h3>🛠️ Yönetim Araçları</h3></div>
        <div className="admin-tools">
          <BackupManager teams={teams} fixtures={fixtures} />
       <NewTournament
  setTeams={setTeams}
  setFixtures={setFixtures}
  setDrawOrder={setDrawOrder}
  setGoalScorers={setGoalScorers}
  setSettings={setSettings}
  onNavigate={onNavigate}
/>
        </div>
      </section>
    </div>
  );
}
