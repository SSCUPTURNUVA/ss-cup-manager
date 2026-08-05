function getMatchStatus(match) {
  if (match?.live === true) {
    return {
      label: "CANLI",
      icon: "🔴",
      color: "#ef4444",
      background: "rgba(239, 68, 68, 0.12)",
    };
  }

  if (match?.played === true) {
    return {
      label: "BİTTİ",
      icon: "✅",
      color: "#22c55e",
      background: "rgba(34, 197, 94, 0.12)",
    };
  }

  return {
    label: "BEKLİYOR",
    icon: "⏳",
    color: "#facc15",
    background: "rgba(250, 204, 21, 0.12)",
  };
}

function getTeamName(team) {
  if (typeof team === "string") return team;
  return team?.name || team?.teamName || "Takım";
}

function getDisplayScore(match) {
  if (match?.played !== true && match?.live !== true) return "VS";

  const homeScore = Number.isFinite(Number(match?.homeScore))
    ? Number(match.homeScore)
    : 0;
  const awayScore = Number.isFinite(Number(match?.awayScore))
    ? Number(match.awayScore)
    : 0;

  return `${homeScore} - ${awayScore}`;
}

const FIXED_TIME_RANGES = [
  "20:00 - 21:00",
  "21:00 - 22:00",
  "22:00 - 23:00",
  "23:00 - 00:00",
];

function shareNightMatches({ tournamentName, venue, selectedDate, nightMatches }) {
  const lines = nightMatches.map(({ timeRange, match }) => {
    if (!match) return `${timeRange} • Maç bilgisi bekleniyor`;
    return `${timeRange} • ${getTeamName(match.home)} - ${getTeamName(match.away)}`;
  });

  const text = [
    `🏆 ${tournamentName || "S&S CUP"}`,
    "",
    "📅 BU GECENİN MAÇLARI",
    selectedDate || "",
    "",
    ...lines,
    "",
    `📍 ${venue || "GolPark Spor Tesisleri"}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (navigator.share) {
    navigator.share({ title: tournamentName || "S&S CUP", text }).catch(() => {});
    return;
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

export default function PublicTournament({
  teams = [],
  fixtures = [],
  standings = [],
  goalScorers = [],
  settings = {},
}) {
  const sortedMatches = [...fixtures]
    .filter((match) => match?.home && match?.away)
    .sort((a, b) => {
      const first = `${a.date || "9999-12-31"} ${a.time || "99:99"}`;
      const second = `${b.date || "9999-12-31"} ${b.time || "99:99"}`;
      return first.localeCompare(second);
    });

  const activeOrUpcoming = sortedMatches.filter(
    (match) => match.live === true || match.played !== true
  );

  const selectedDate = activeOrUpcoming[0]?.date || sortedMatches[0]?.date || "";

  const sameNightMatches = sortedMatches
    .filter((match) => (selectedDate ? match.date === selectedDate : true))
    .slice(0, 4);

  const nightMatches = FIXED_TIME_RANGES.map((timeRange, index) => ({
    timeRange,
    match: sameNightMatches[index] || null,
  }));

  return (
    <div className="page-stack public-tournament-page">
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "28px",
          padding: "28px",
          color: "white",
          background:
            "radial-gradient(circle at top right, rgba(212,175,55,.22), transparent 36%), linear-gradient(135deg, #07111f 0%, #0d1c33 56%, #07101d 100%)",
          border: "1px solid rgba(212,175,55,.45)",
          boxShadow: "0 24px 60px rgba(0,0,0,.28)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(120deg, transparent 0 68%, rgba(212,175,55,.08) 68% 72%, transparent 72%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 12px",
              borderRadius: "999px",
              color: "#f7d76d",
              background: "rgba(212,175,55,.11)",
              border: "1px solid rgba(212,175,55,.3)",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "1.2px",
            }}
          >
            🏆 S&S CUP CANLI DURUM
          </span>

          <h2
            style={{
              margin: "15px 0 6px",
              fontSize: "clamp(30px, 5vw, 48px)",
              lineHeight: 1,
              color: "#f5cf55",
            }}
          >
            {settings.tournamentName || "S&S CUP"}
          </h2>

          <p style={{ margin: 0, opacity: 0.82, fontWeight: 700 }}>
            {settings.venue || "GolPark Spor Tesisleri"}
            {settings.season ? ` • ${settings.season} Sezonu` : ""}
          </p>
        </div>
      </section>

      <section
        style={{
          borderRadius: "26px",
          overflow: "hidden",
          background: "linear-gradient(145deg, #081321, #0f2038)",
          border: "1px solid rgba(212,175,55,.4)",
          boxShadow: "0 18px 50px rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            padding: "22px 24px",
            textAlign: "center",
            color: "white",
            borderBottom: "1px solid rgba(212,175,55,.25)",
            background:
              "linear-gradient(90deg, rgba(212,175,55,.06), rgba(212,175,55,.16), rgba(212,175,55,.06))",
          }}
        >
          <span
            style={{
              display: "block",
              color: "#f7d76d",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "1.5px",
            }}
          >
            MAÇ PROGRAMI
          </span>
          <h3 style={{ margin: "5px 0 0", fontSize: "24px" }}>
            📅 Bu Gecenin 4 Maçı
          </h3>
          {selectedDate && (
            <small style={{ display: "block", marginTop: "6px", opacity: 0.68 }}>
              {selectedDate}
            </small>
          )}
        </div>

        <div>
          {nightMatches.map(({ timeRange, match }, index) => {
            const status = getMatchStatus(match);

            return (
              <article
                key={`${timeRange}-${match?.id || index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(155px, .8fr) minmax(0, 2.6fr) minmax(120px, .8fr)",
                  alignItems: "stretch",
                  minHeight: "112px",
                  color: "white",
                  borderBottom:
                    index === nightMatches.length - 1
                      ? "none"
                      : "1px solid rgba(255,255,255,.09)",
                  background:
                    index % 2 === 0
                      ? "rgba(255,255,255,.018)"
                      : "rgba(255,255,255,.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "18px 20px",
                    color: "#111827",
                    background:
                      "linear-gradient(135deg, #f7df7a 0%, #d4af37 58%, #aa8120 100%)",
                    boxShadow: "inset -1px 0 rgba(255,255,255,.35)",
                  }}
                >
                  <strong style={{ fontSize: "19px", whiteSpace: "nowrap" }}>
                    🕒 {timeRange}
                  </strong>
                  <small style={{ marginTop: "7px", fontWeight: 900, opacity: 0.68 }}>
                    {index + 1}. MAÇ
                  </small>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    gap: "18px",
                    padding: "18px 28px",
                  }}
                >
                  <strong
                    style={{
                      textAlign: "right",
                      fontSize: "clamp(15px, 2.2vw, 21px)",
                      lineHeight: 1.25,
                    }}
                  >
                    {match ? getTeamName(match.home) : "Takım bekleniyor"}
                  </strong>

                  <div
                    style={{
                      minWidth: "74px",
                      padding: "12px 10px",
                      textAlign: "center",
                      color: "#f5cf55",
                      borderRadius: "16px",
                      fontSize: "21px",
                      fontWeight: 1000,
                      background: "rgba(212,175,55,.08)",
                      border: "1px solid rgba(212,175,55,.3)",
                    }}
                  >
                    {match ? getDisplayScore(match) : "VS"}
                  </div>

                  <strong
                    style={{
                      textAlign: "left",
                      fontSize: "clamp(15px, 2.2vw, 21px)",
                      lineHeight: 1.25,
                    }}
                  >
                    {match ? getTeamName(match.away) : "Takım bekleniyor"}
                  </strong>

                  {match && (
                    <small
                      style={{
                        gridColumn: "1 / -1",
                        textAlign: "center",
                        marginTop: "-5px",
                        opacity: 0.58,
                        fontWeight: 700,
                      }}
                    >
                      📍 {match.field || match.pitch || "Saha 1"}
                    </small>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "18px",
                    color: status.color,
                    background: status.background,
                    borderLeft: "1px solid rgba(255,255,255,.08)",
                    fontWeight: 1000,
                    letterSpacing: ".7px",
                  }}
                >
                  {match ? `${status.icon} ${status.label}` : "—"}
                </div>
              </article>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "18px",
            borderTop: "1px solid rgba(212,175,55,.18)",
            background: "rgba(0,0,0,.12)",
          }}
        >
          <button
            type="button"
            onClick={() =>
              shareNightMatches({
                tournamentName: settings.tournamentName,
                venue: settings.venue,
                selectedDate,
                nightMatches,
              })
            }
            style={{
              border: "none",
              borderRadius: "14px",
              padding: "12px 20px",
              color: "#111827",
              background: "linear-gradient(135deg, #f7df7a, #d4af37)",
              fontWeight: 1000,
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(212,175,55,.2)",
            }}
          >
            📲 Bu Gecenin 4 Maçını Paylaş
          </button>
        </div>
      </section>

      <section
        style={{
          overflow: "hidden",
          borderRadius: "26px",
          color: "white",
          background: "linear-gradient(145deg, #081321, #0f2038)",
          border: "1px solid rgba(212,175,55,.4)",
          boxShadow: "0 18px 50px rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            textAlign: "center",
            borderBottom: "1px solid rgba(212,175,55,.25)",
            background:
              "linear-gradient(90deg, rgba(212,175,55,.06), rgba(212,175,55,.16), rgba(212,175,55,.06))",
          }}
        >
          <span
            style={{
              display: "block",
              color: "#f7d76d",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "1.5px",
            }}
          >
            TAKIM SIRALAMASI
          </span>
          <h3 style={{ margin: "5px 0 0", fontSize: "24px" }}>📊 Puan Durumu</h3>
        </div>

        {standings.length === 0 ? (
          <p style={{ padding: "24px", margin: 0, textAlign: "center", opacity: 0.7 }}>
            Puan durumu henüz oluşmadı.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div
              style={{
                minWidth: "720px",
                display: "grid",
                gridTemplateColumns: "64px minmax(220px, 1fr) repeat(6, 70px)",
                alignItems: "center",
                padding: "13px 18px",
                color: "#f7d76d",
                background: "rgba(212,175,55,.08)",
                borderBottom: "1px solid rgba(212,175,55,.22)",
                fontSize: "12px",
                fontWeight: 1000,
                letterSpacing: ".7px",
                textAlign: "center",
              }}
            >
              <span>SIRA</span>
              <span style={{ textAlign: "left" }}>TAKIM</span>
              <span>O</span>
              <span>G</span>
              <span>B</span>
              <span>M</span>
              <span>AV</span>
              <span>PUAN</span>
            </div>

            {standings.slice(0, 8).map((team, index) => {
              const goalDifference = Number(team.goalDifference || 0);
              const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";

              return (
                <article
                  key={team.team}
                  style={{
                    minWidth: "720px",
                    display: "grid",
                    gridTemplateColumns: "64px minmax(220px, 1fr) repeat(6, 70px)",
                    alignItems: "center",
                    padding: "15px 18px",
                    borderBottom:
                      index === Math.min(standings.length, 8) - 1
                        ? "none"
                        : "1px solid rgba(255,255,255,.08)",
                    background:
                      index === 0
                        ? "linear-gradient(90deg, rgba(212,175,55,.18), rgba(212,175,55,.05))"
                        : index % 2 === 0
                        ? "rgba(255,255,255,.018)"
                        : "rgba(255,255,255,.04)",
                    textAlign: "center",
                  }}
                >
                  <span
                    style={{
                      width: "38px",
                      height: "38px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto",
                      borderRadius: "12px",
                      color: index === 0 ? "#111827" : "#f7d76d",
                      background:
                        index === 0
                          ? "linear-gradient(135deg, #f7df7a, #d4af37)"
                          : "rgba(212,175,55,.1)",
                      border: "1px solid rgba(212,175,55,.25)",
                      fontWeight: 1000,
                    }}
                  >
                    {medal || index + 1}
                  </span>

                  <strong
                    style={{
                      textAlign: "left",
                      fontSize: "16px",
                      color: index === 0 ? "#f7d76d" : "white",
                    }}
                  >
                    {team.team}
                  </strong>

                  <span>{team.played || 0}</span>
                  <span>{team.won || 0}</span>
                  <span>{team.drawn || 0}</span>
                  <span>{team.lost || 0}</span>
                  <span style={{ color: goalDifference >= 0 ? "#4ade80" : "#f87171" }}>
                    {goalDifference > 0 ? `+${goalDifference}` : goalDifference}
                  </span>
                  <b
                    style={{
                      display: "inline-flex",
                      justifyContent: "center",
                      minWidth: "52px",
                      padding: "8px 10px",
                      margin: "0 auto",
                      borderRadius: "12px",
                      color: "#111827",
                      background: "linear-gradient(135deg, #f7df7a, #d4af37)",
                    }}
                  >
                    {team.points || 0}
                  </b>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        style={{
          overflow: "hidden",
          borderRadius: "26px",
          color: "white",
          background: "linear-gradient(145deg, #081321, #0f2038)",
          border: "1px solid rgba(212,175,55,.4)",
          boxShadow: "0 18px 50px rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            textAlign: "center",
            borderBottom: "1px solid rgba(212,175,55,.25)",
            background:
              "linear-gradient(90deg, rgba(212,175,55,.06), rgba(212,175,55,.16), rgba(212,175,55,.06))",
          }}
        >
          <span
            style={{
              display: "block",
              color: "#f7d76d",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "1.5px",
            }}
          >
            EN ÇOK GOL ATANLAR
          </span>
          <h3 style={{ margin: "5px 0 0", fontSize: "24px" }}>⚽ Gol Krallığı</h3>
        </div>

        {goalScorers.length === 0 ? (
          <p style={{ padding: "24px", margin: 0, textAlign: "center", opacity: 0.7 }}>
            Gol krallığı henüz oluşmadı.
          </p>
        ) : (
          <div>
            {goalScorers.slice(0, 5).map((player, index) => {
              const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "⚽";
              const playerName = player.playerName || player.name || "Oyuncu";
              const teamName = player.team || player.teamName || "Takım";

              return (
                <article
                  key={`${playerName}-${teamName}-${index}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "72px minmax(0, 1fr) 110px",
                    alignItems: "center",
                    gap: "16px",
                    minHeight: "82px",
                    padding: "14px 20px",
                    borderBottom:
                      index === Math.min(goalScorers.length, 5) - 1
                        ? "none"
                        : "1px solid rgba(255,255,255,.08)",
                    background:
                      index === 0
                        ? "linear-gradient(90deg, rgba(212,175,55,.2), rgba(212,175,55,.05))"
                        : index % 2 === 0
                        ? "rgba(255,255,255,.018)"
                        : "rgba(255,255,255,.04)",
                  }}
                >
                  <span
                    style={{
                      width: "46px",
                      height: "46px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto",
                      borderRadius: "15px",
                      color: index === 0 ? "#111827" : "#f7d76d",
                      background:
                        index === 0
                          ? "linear-gradient(135deg, #f7df7a, #d4af37)"
                          : "rgba(212,175,55,.1)",
                      border: "1px solid rgba(212,175,55,.28)",
                      fontSize: "22px",
                      fontWeight: 1000,
                    }}
                  >
                    {medal}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: index === 0 ? "#f7d76d" : "white",
                        fontSize: "17px",
                      }}
                    >
                      {playerName}
                    </strong>
                    <small
                      style={{
                        display: "block",
                        marginTop: "5px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: 0.62,
                        fontWeight: 700,
                      }}
                    >
                      {player.shirtNumber || player.number
                        ? `#${player.shirtNumber || player.number} • `
                        : ""}
                      {teamName}
                    </small>
                  </div>

                  <b
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      minWidth: "84px",
                      padding: "11px 12px",
                      borderRadius: "14px",
                      color: "#111827",
                      background: "linear-gradient(135deg, #f7df7a, #d4af37)",
                      boxShadow: "0 8px 20px rgba(212,175,55,.16)",
                    }}
                  >
                    {player.goals || 0} GOL
                  </b>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel-card public-info-card">
        <strong>👥 {teams.length} Takım</strong>
        <span>Bu sayfa yalnızca görüntüleme amaçlıdır.</span>
      </section>

      <style>{`
        @media (max-width: 760px) {
          .public-tournament-page article[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }

          .public-tournament-page article[style*="grid-template-columns"] > div:first-child {
            align-items: center;
            text-align: center;
          }

          .public-tournament-page article[style*="grid-template-columns"] > div:nth-child(2) {
            padding: 20px 14px !important;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;
            gap: 10px !important;
          }

          .public-tournament-page article[style*="grid-template-columns"] > div:last-child {
            min-height: 52px;
            border-left: none !important;
            border-top: 1px solid rgba(255,255,255,.08);
          }
        }
      `}</style>
    </div>
  );
}