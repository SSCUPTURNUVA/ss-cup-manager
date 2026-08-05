export default function Statistics({ fixtures, standings }) {
  const playedMatches = fixtures.filter((match) => match.played === true);

  const totalGoals = playedMatches.reduce(
    (total, match) =>
      total + Number(match.homeScore || 0) + Number(match.awayScore || 0),
    0
  );

  const draws = playedMatches.filter(
    (match) => Number(match.homeScore) === Number(match.awayScore)
  ).length;

  const topAttack = [...standings].sort(
    (a, b) => b.goalsFor - a.goalsFor
  )[0];

  const bestDefense = [...standings]
    .filter((team) => team.played > 0)
    .sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];

  const averageGoals = playedMatches.length
    ? (totalGoals / playedMatches.length).toFixed(2)
    : "0.00";

  const cards = [
    { icon: "✅", value: playedMatches.length, label: "Oynanan Maç" },
    { icon: "⚽", value: totalGoals, label: "Toplam Gol" },
    { icon: "🤝", value: draws, label: "Beraberlik" },
    { icon: "🎯", value: averageGoals, label: "Maç Başına Gol" },
  ];

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">TURNUVA VERİLERİ</span>
          <h2>📈 İstatistikler</h2>
          <p>Turnuvanın öne çıkan rakamları ve takım performansları.</p>
        </div>
      </section>

      <section className="dashboard-grid">
        {cards.map((card) => (
          <article key={card.label} className="stat-card">
            <span>{card.icon}</span>
            <strong>{card.value}</strong>
            <small>{card.label}</small>
          </article>
        ))}
      </section>

      <section className="home-columns statistics-columns">
        <article className="panel-card highlight-panel">
          <span className="large-icon">🔥</span>
          <h3>En İyi Hücum</h3>
          <strong>{topAttack?.team || "Henüz belli değil"}</strong>
          <p>{topAttack ? `${topAttack.goalsFor} gol attı` : "Maç sonucu bekleniyor"}</p>
        </article>

        <article className="panel-card highlight-panel">
          <span className="large-icon">🛡️</span>
          <h3>En İyi Savunma</h3>
          <strong>{bestDefense?.team || "Henüz belli değil"}</strong>
          <p>{bestDefense ? `${bestDefense.goalsAgainst} gol yedi` : "Maç sonucu bekleniyor"}</p>
        </article>

        <article className="panel-card highlight-panel">
          <span className="large-icon">👑</span>
          <h3>Lider</h3>
          <strong>{standings[0]?.team || "Henüz belli değil"}</strong>
          <p>{standings[0] ? `${standings[0].points} puan` : "Puan durumu bekleniyor"}</p>
        </article>
      </section>
    </div>
  );
}
