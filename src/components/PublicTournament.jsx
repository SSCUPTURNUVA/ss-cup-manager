import React, { useMemo, useState } from "react";

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(date) {
  if (!date) return "Tarih bekleniyor";
  try {
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "long",
      weekday: "short",
    }).format(parsed);
  } catch {
    return date;
  }
}

function matchStamp(match) {
  return `${match?.date || "9999-12-31"} ${match?.time || "23:59"}`;
}

export default function PublicTournament({
  teams = [],
  fixtures = [],
  standings = [],
  goalScorers = [],
  settings = {},
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const title = settings.tournamentName || settings.title || "S&S CUP";
  const slogan = settings.slogan || "Kazanan Sahada Belli Olur";
  const venue = settings.venue || "Gol Park Halı Saha";

  const leagueStandings = useMemo(() => standings.slice(), [standings]);

  const liveMatches = useMemo(
    () => fixtures.filter((match) => match?.live === true && match?.played !== true),
    [fixtures]
  );

  const upcomingMatches = useMemo(
    () =>
      fixtures
        .filter((match) => match?.played !== true && match?.live !== true)
        .sort((a, b) => matchStamp(a).localeCompare(matchStamp(b), "tr"))
        .slice(0, 8),
    [fixtures]
  );

  const completedMatches = useMemo(
    () =>
      fixtures
        .filter((match) => match?.played === true)
        .sort((a, b) => matchStamp(b).localeCompare(matchStamp(a), "tr"))
        .slice(0, 8),
    [fixtures]
  );

  const scorers = useMemo(() => {
    // Takip sayfası başka telefonda açıldığında localStorage paylaşılmaz.
    // Bu yüzden Supabase'den gelen maç eventlerinden gol krallığını da üretiriz.
    const cloudTotals = {};
    fixtures.forEach((match) => {
      const events = Array.isArray(match?.events) ? match.events : [];
      events
        .filter((event) => event?.type === "goal" || event?.type === "penalty_goal")
        .forEach((event) => {
          const team = event?.team || event?.teamName || "";
          const playerId = event?.playerId || event?.id || event?.playerName || event?.name;
          if (!team || !playerId) return;
          const key = `${team}-${playerId}`;
          if (!cloudTotals[key]) {
            cloudTotals[key] = {
              id: key,
              playerId,
              name: event?.playerName || event?.name || "Oyuncu",
              playerName: event?.playerName || event?.name || "Oyuncu",
              team,
              shirtNumber: event?.shirtNumber || "",
              goals: 0,
            };
          }
          cloudTotals[key].goals += 1;
        });
    });

    const source = Object.keys(cloudTotals).length
      ? Object.values(cloudTotals)
      : goalScorers;

    return [...source]
      .filter((player) => player && (player.name || player.playerName))
      .sort((a, b) => {
        const diff = asNumber(b.goals) - asNumber(a.goals);
        if (diff !== 0) return diff;
        return String(a.name || a.playerName).localeCompare(
          String(b.name || b.playerName),
          "tr-TR"
        );
      });
  }, [fixtures, goalScorers]);

  const playedCount = fixtures.filter((match) => match?.played === true).length;
  const totalGoals = completedMatches.reduce(
    (sum, match) => sum + asNumber(match.homeScore) + asNumber(match.awayScore),
    0
  );

  const tabs = [
    ["overview", "Genel", "⚡"],
    ["matches", "Maçlar", "📅"],
    ["standings", "Puan", "📊"],
    ["scorers", "Gol Krallığı", "⚽"],
  ];

  return (
    <div className="sst-public-page">
      <style>{css}</style>

      <div className="sst-public-glow sst-public-glow-one" />
      <div className="sst-public-glow sst-public-glow-two" />

      <main className="sst-public-shell">
        <header className="sst-public-hero">
          <div className="sst-public-hero-top">
            <div className="sst-public-live-badge">
              <span className="sst-public-live-dot" /> CANLI TURNUVA TAKİBİ
            </div>
            <div className="sst-public-season">{settings.season || "2026"}</div>
          </div>

          <div className="sst-public-brand-row">
            <div className="sst-public-cup">🏆</div>
            <div>
              <h1>{title}</h1>
              <p>{slogan}</p>
            </div>
          </div>

          <div className="sst-public-meta-row">
            <span>📍 {venue}</span>
            {settings.mainSponsor && <span>🤝 {settings.mainSponsor}</span>}
            <span>👥 {teams.length} Takım</span>
          </div>
        </header>

        <section className="sst-public-stats">
          <div><strong>{teams.length}</strong><span>Takım</span></div>
          <div><strong>{playedCount}</strong><span>Oynanan Maç</span></div>
          <div><strong>{upcomingMatches.length + liveMatches.length}</strong><span>Bekleyen Maç</span></div>
          <div><strong>{scorers[0]?.goals || 0}</strong><span>Lider Gol</span></div>
        </section>

        {liveMatches.length > 0 && (
          <section className="sst-public-live-area">
            <div className="sst-section-heading">
              <div><small>ŞU ANDA</small><h2>🔴 Canlı Maç</h2></div>
              <span className="sst-live-text">CANLI</span>
            </div>
            <div className="sst-live-grid">
              {liveMatches.map((match, index) => (
                <div className="sst-live-match" key={match.id || index}>
                  <div className="sst-live-meta">{match.time || "--:--"} • {match.field || venue}</div>
                  <div className="sst-live-score-row">
                    <span>{match.home}</span>
                    <strong>{asNumber(match.homeScore)} <em>:</em> {asNumber(match.awayScore)}</strong>
                    <span>{match.away}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <nav className="sst-public-tabs">
          {tabs.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              className={activeTab === id ? "active" : ""}
              onClick={() => setActiveTab(id)}
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>

        {(activeTab === "overview" || activeTab === "matches") && (
          <section className="sst-public-panel">
            <div className="sst-section-heading">
              <div><small>FİKSTÜR</small><h2>📅 Sıradaki Maçlar</h2></div>
              <span>{upcomingMatches.length} karşılaşma</span>
            </div>

            {upcomingMatches.length === 0 ? (
              <div className="sst-empty">Planlanmış yeni maç bulunmuyor.</div>
            ) : (
              <div className="sst-upcoming-list">
                {upcomingMatches.map((match, index) => (
                  <div className="sst-upcoming-card" key={match.id || index}>
                    <div className="sst-date-box">
                      <strong>{match.time || "--:--"}</strong>
                      <span>{formatDate(match.date)}</span>
                    </div>
                    <div className="sst-match-teams">
                      <span>{match.home}</span>
                      <b>VS</b>
                      <span>{match.away}</span>
                    </div>
                    <div className="sst-pitch">📍 {match.field || "Saha 1"}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {(activeTab === "overview" || activeTab === "standings") && (
          <section className="sst-public-panel">
            <div className="sst-section-heading">
              <div><small>LİG</small><h2>📊 Puan Durumu</h2></div>
              <span>İlk 8 final yolunda</span>
            </div>

            {leagueStandings.length === 0 ? (
              <div className="sst-empty">Puan durumu henüz oluşmadı.</div>
            ) : (
              <div className="sst-table-scroll">
                <table className="sst-standings-table">
                  <thead>
                    <tr><th>#</th><th>Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>A</th><th>Y</th><th>AV</th><th>P</th></tr>
                  </thead>
                  <tbody>
                    {leagueStandings.map((team, index) => {
                      const gd = team.goalDifference ?? team.gd ?? team.av ?? (asNumber(team.goalsFor) - asNumber(team.goalsAgainst));
                      return (
                        <tr key={team.team || index} className={index < 8 ? "qualifying" : ""}>
                          <td><span className={`sst-rank ${index < 8 ? "sst-rank-top" : ""}`}>{index + 1}</span></td>
                          <td className="sst-team-name">{team.team}</td>
                          <td>{team.played ?? team.om ?? 0}</td>
                          <td>{team.won ?? team.g ?? 0}</td>
                          <td>{team.drawn ?? team.b ?? 0}</td>
                          <td>{team.lost ?? team.m ?? 0}</td>
                          <td>{team.goalsFor ?? team.a ?? 0}</td>
                          <td>{team.goalsAgainst ?? team.y ?? 0}</td>
                          <td>{gd > 0 ? `+${gd}` : gd}</td>
                          <td className="sst-points">{team.points ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {(activeTab === "overview" || activeTab === "scorers") && (
          <section className="sst-public-panel">
            <div className="sst-section-heading">
              <div><small>BİREYSEL PERFORMANS</small><h2>⚽ Gol Krallığı</h2></div>
              <span>{scorers.length} oyuncu</span>
            </div>

            {scorers.length === 0 ? (
              <div className="sst-empty">Gol krallığı henüz oluşmadı.</div>
            ) : (
              <>
                <div className="sst-podium">
                  {scorers.slice(0, 3).map((player, index) => (
                    <div className={`sst-podium-card place-${index + 1}`} key={`${player.team}-${player.name || player.playerName}`}>
                      <div className="sst-medal">{index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}</div>
                      <strong>{player.name || player.playerName}</strong>
                      <span>{player.team || "Takım"}</span>
                      <b>⚽ {asNumber(player.goals)} GOL</b>
                    </div>
                  ))}
                </div>
                {scorers.length > 3 && (
                  <div className="sst-scorer-list">
                    {scorers.slice(3, 10).map((player, index) => (
                      <div key={`${player.team}-${player.name || player.playerName}-${index}`}>
                        <span className="sst-list-rank">{index + 4}</span>
                        <div><strong>{player.name || player.playerName}</strong><small>{player.team || "Takım"}</small></div>
                        <b>⚽ {asNumber(player.goals)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === "overview" && completedMatches.length > 0 && (
          <section className="sst-public-panel">
            <div className="sst-section-heading">
              <div><small>SONUÇLAR</small><h2>✅ Son Oynanan Maçlar</h2></div>
              <span>{totalGoals} gol</span>
            </div>
            <div className="sst-results-grid">
              {completedMatches.slice(0, 6).map((match, index) => (
                <div className="sst-result-card" key={match.id || index}>
                  <small>{formatDate(match.date)} • {match.time || "--:--"}</small>
                  <div><span>{match.home}</span><strong>{asNumber(match.homeScore)} - {asNumber(match.awayScore)}</strong><span>{match.away}</span></div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="sst-public-footer">
          <strong>🏆 {title}</strong>
          <span>Fikstür • Puan Durumu • Gol Krallığı • Canlı Sonuçlar</span>
          <small>Bu sayfa yalnızca görüntüleme amaçlıdır.</small>
        </footer>
      </main>
    </div>
  );
}

const css = `
*{box-sizing:border-box}.sst-public-page{min-height:100vh;background:#05070c;color:#f7f8fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:relative;overflow:hidden}.sst-public-page:before{content:"";position:fixed;inset:0;background:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:34px 34px;pointer-events:none}.sst-public-glow{position:fixed;width:430px;height:430px;border-radius:50%;filter:blur(110px);opacity:.16;pointer-events:none}.sst-public-glow-one{background:#e8b931;top:-180px;left:-130px}.sst-public-glow-two{background:#126bff;right:-180px;top:240px}.sst-public-shell{position:relative;z-index:1;width:min(1120px,100%);margin:0 auto;padding:28px 18px 50px}.sst-public-hero{border:1px solid rgba(232,185,49,.35);background:linear-gradient(135deg,rgba(32,29,17,.96),rgba(12,15,23,.94) 55%,rgba(13,27,51,.9));border-radius:26px;padding:26px;box-shadow:0 28px 80px rgba(0,0,0,.38)}.sst-public-hero-top,.sst-public-meta-row,.sst-section-heading,.sst-public-brand-row{display:flex;align-items:center}.sst-public-hero-top,.sst-section-heading{justify-content:space-between;gap:16px}.sst-public-live-badge{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.09);color:#ff8a8a;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:900;letter-spacing:.11em}.sst-public-live-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 0 rgba(239,68,68,.7);animation:sstPulse 1.8s infinite}@keyframes sstPulse{70%{box-shadow:0 0 0 9px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}.sst-public-season{font-size:12px;font-weight:800;color:#cbd5e1;border:1px solid #293244;background:#111722;padding:7px 12px;border-radius:999px}.sst-public-brand-row{gap:17px;margin:24px 0 18px}.sst-public-cup{width:66px;height:66px;border-radius:18px;display:grid;place-items:center;font-size:32px;background:linear-gradient(145deg,#f8d66d,#b9820e);box-shadow:0 12px 30px rgba(207,157,29,.22)}.sst-public-brand-row h1{margin:0;font-size:clamp(30px,5vw,54px);line-height:.95;letter-spacing:-.045em}.sst-public-brand-row p{margin:9px 0 0;color:#b6c0d0;font-weight:700}.sst-public-meta-row{gap:9px;flex-wrap:wrap}.sst-public-meta-row span{font-size:12px;color:#cbd5e1;background:rgba(8,12,18,.52);border:1px solid #293244;border-radius:999px;padding:8px 11px}.sst-public-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.sst-public-stats div{background:rgba(14,18,27,.88);border:1px solid #242d3d;border-radius:16px;padding:15px 16px}.sst-public-stats strong{display:block;font-size:23px;color:#f2c84b}.sst-public-stats span{font-size:11px;color:#8390a5;font-weight:700}.sst-public-tabs{position:sticky;top:10px;z-index:20;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:14px 0;padding:7px;background:rgba(11,14,21,.88);backdrop-filter:blur(16px);border:1px solid #252e3d;border-radius:17px}.sst-public-tabs button{border:0;background:transparent;color:#8d99aa;border-radius:11px;padding:11px 8px;font-weight:850;cursor:pointer;transition:.2s}.sst-public-tabs button span{margin-right:6px}.sst-public-tabs button.active{background:linear-gradient(135deg,#e8bb37,#c28b13);color:#171205;box-shadow:0 7px 20px rgba(210,158,25,.18)}.sst-public-panel,.sst-public-live-area{margin-top:14px;background:linear-gradient(180deg,rgba(15,19,28,.96),rgba(9,12,18,.96));border:1px solid #252e3d;border-radius:22px;padding:20px;box-shadow:0 22px 60px rgba(0,0,0,.19)}.sst-public-live-area{border-color:rgba(239,68,68,.35)}.sst-section-heading{margin-bottom:16px}.sst-section-heading small{display:block;font-size:9px;letter-spacing:.15em;color:#e7bb3d;font-weight:900;margin-bottom:3px}.sst-section-heading h2{font-size:18px;margin:0}.sst-section-heading>span{font-size:11px;color:#7e8a9d;font-weight:700}.sst-live-text{color:#ff6666!important}.sst-live-grid,.sst-results-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.sst-live-match,.sst-result-card{border:1px solid #293244;border-radius:15px;background:#0b0f17;padding:14px}.sst-live-meta,.sst-result-card small{display:block;color:#77859a;font-size:10px;margin-bottom:10px}.sst-live-score-row,.sst-result-card div{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;text-align:center}.sst-live-score-row span,.sst-result-card span{font-size:12px;font-weight:850}.sst-live-score-row strong{font-size:22px;color:#fff}.sst-live-score-row em{font-style:normal;color:#ef4444}.sst-upcoming-list{display:grid;gap:9px}.sst-upcoming-card{display:grid;grid-template-columns:150px 1fr 130px;align-items:center;gap:14px;background:#0b0f17;border:1px solid #242d3d;border-radius:15px;padding:12px 14px;transition:.2s}.sst-upcoming-card:hover{transform:translateY(-1px);border-color:#3b465b}.sst-date-box{border-right:1px solid #273043}.sst-date-box strong{display:block;color:#f0c64d;font-size:16px}.sst-date-box span{font-size:10px;color:#8591a4;text-transform:capitalize}.sst-match-teams{display:grid;grid-template-columns:1fr 36px 1fr;align-items:center;gap:10px;text-align:center;font-size:13px;font-weight:900}.sst-match-teams b{font-size:9px;color:#7b879a;background:#1a2130;border-radius:8px;padding:6px}.sst-pitch{text-align:right;color:#768399;font-size:10px}.sst-table-scroll{overflow:auto;border-radius:13px;border:1px solid #222b3a}.sst-standings-table{width:100%;border-collapse:collapse;min-width:720px;background:#0b0f17}.sst-standings-table th{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#748198;background:#111722;padding:11px 9px;text-align:center}.sst-standings-table th:nth-child(2){text-align:left}.sst-standings-table td{border-top:1px solid #1d2532;padding:10px 9px;text-align:center;font-size:11px;color:#aeb7c5}.sst-standings-table tr.qualifying{background:linear-gradient(90deg,rgba(232,185,49,.055),transparent 35%)}.sst-team-name{text-align:left!important;color:#f4f6f8!important;font-weight:850;font-size:12px!important}.sst-rank{display:inline-grid;place-items:center;width:25px;height:25px;border-radius:8px;background:#171e2a;font-weight:900}.sst-rank-top{background:rgba(232,185,49,.17);color:#f0c64d}.sst-points{font-size:14px!important;color:#f0c64d!important;font-weight:950}.sst-podium{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:end}.sst-podium-card{position:relative;text-align:center;border:1px solid #293244;background:linear-gradient(180deg,#111722,#0b0f17);border-radius:16px;padding:18px 12px 15px;min-height:145px}.sst-podium-card.place-1{order:2;min-height:175px;border-color:rgba(232,185,49,.45);background:linear-gradient(180deg,rgba(232,185,49,.12),#0b0f17)}.sst-podium-card.place-2{order:1}.sst-podium-card.place-3{order:3}.sst-medal{font-size:29px;margin-bottom:8px}.sst-podium-card strong{display:block;font-size:13px}.sst-podium-card span{display:block;font-size:10px;color:#7f8b9d;margin:4px 0 12px}.sst-podium-card b{font-size:12px;color:#f0c64d}.sst-scorer-list{margin-top:10px;display:grid;gap:7px}.sst-scorer-list>div{display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;border:1px solid #222b39;background:#0b0f17;border-radius:12px;padding:10px 12px}.sst-list-rank{display:grid;place-items:center;width:27px;height:27px;border-radius:8px;background:#171e2a;color:#8e9aad;font-weight:900;font-size:11px}.sst-scorer-list strong{display:block;font-size:12px}.sst-scorer-list small{display:block;color:#737f91;font-size:9px}.sst-scorer-list b{color:#f0c64d;font-size:12px}.sst-result-card div strong{font-size:17px;color:#f0c64d}.sst-empty{text-align:center;color:#748198;font-size:12px;padding:30px 15px;border:1px dashed #2b3443;border-radius:13px;background:#0a0e15}.sst-public-footer{text-align:center;padding:34px 10px 0;display:flex;flex-direction:column;gap:5px}.sst-public-footer strong{color:#f0c64d}.sst-public-footer span{color:#8692a4;font-size:11px}.sst-public-footer small{color:#596476;font-size:9px}
@media(max-width:720px){.sst-public-shell{padding:14px 10px 35px}.sst-public-hero{padding:18px;border-radius:20px}.sst-public-brand-row{margin:18px 0 15px}.sst-public-cup{width:52px;height:52px;font-size:25px;border-radius:15px}.sst-public-brand-row h1{font-size:31px}.sst-public-brand-row p{font-size:11px}.sst-public-stats{grid-template-columns:repeat(2,1fr)}.sst-public-tabs{top:5px}.sst-public-tabs button{font-size:10px}.sst-public-tabs button span{display:block;margin:0 0 2px;font-size:15px}.sst-public-panel,.sst-public-live-area{padding:15px;border-radius:18px}.sst-upcoming-card{grid-template-columns:82px 1fr;padding:11px}.sst-pitch{display:none}.sst-date-box{padding-right:8px}.sst-date-box strong{font-size:14px}.sst-date-box span{font-size:8px}.sst-match-teams{grid-template-columns:1fr 27px 1fr;gap:5px;font-size:10px}.sst-live-grid,.sst-results-grid{grid-template-columns:1fr}.sst-podium{gap:6px}.sst-podium-card{padding:14px 6px;min-height:135px}.sst-podium-card.place-1{min-height:158px}.sst-podium-card strong{font-size:10px}.sst-podium-card b{font-size:10px}.sst-medal{font-size:24px}.sst-section-heading h2{font-size:16px}.sst-section-heading>span{font-size:9px}}
`;
