export default function PublicTournament({
  teams = [],
  fixtures = [],
  standings = [],
  goalScorers = [],
  settings = {},
}) {
  const upcomingMatches = fixtures
    .filter((match) => match.played !== true)
    .slice(0, 4);

  return (
    <div className="page-stack public-tournament-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">S&S CUP CANLI DURUM</span>
          <h2>🏆 S&S CUP</h2>

          <p>
            {settings.venue || "Tesis bilgisi bekleniyor"}
            {settings.season ? ` • ${settings.season}` : ""}
          </p>
        </div>
      </section>

      <section className="panel-card">
        <div className="section-title">
          <h3>📅 Sıradaki Maçlar</h3>
        </div>

        {upcomingMatches.length === 0 ? (
          <p className="empty-message">
            Henüz oynanacak maç bulunmuyor.
          </p>
        ) : (
          <div className="public-match-list">
            {upcomingMatches.map((match) => (
              <article
                key={
                  match.id ||
                  `${match.home}-${match.away}-${match.date}-${match.time}`
                }
              >
                <span>{match.time || "--:--"}</span>

                <strong>{match.home}</strong>

                <b>VS</b>

                <strong>{match.away}</strong>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="section-title">
          <h3>📊 Puan Durumu</h3>
        </div>

        {standings.length === 0 ? (
          <p className="empty-message">
            Puan durumu henüz oluşmadı.
          </p>
        ) : (
          <div className="public-standings">
            {standings.slice(0, 8).map((team, index) => (
              <article key={team.team}>
                <span>{index + 1}</span>
                <strong>{team.team}</strong>
                <b>{team.points} P</b>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="section-title">
          <h3>⚽ Gol Krallığı</h3>
        </div>

        {goalScorers.length === 0 ? (
          <p className="empty-message">
            Gol krallığı henüz oluşmadı.
          </p>
        ) : (
          <div className="public-scorers">
            {goalScorers.slice(0, 5).map((player, index) => (
              <article
                key={`${player.playerName || player.name}-${index}`}
              >
                <span>{index + 1}</span>

                <strong>
                  {player.playerName || player.name}
                </strong>

                <b>{player.goals || 0} Gol</b>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card public-info-card">
        <strong>👥 {teams.length} Takım</strong>

        <span>
          Bu sayfa yalnızca görüntüleme amaçlıdır.
        </span>
      </section>
    </div>
  );
}