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
                className="public-match-card"
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
          <div className="public-standing-cards">
            {standings.slice(0, 8).map((team, index) => {
              const goalDifference = Number(team.goalDifference || 0);
              const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1;

              return (
                <article
                  className={`public-standing-card ${index === 0 ? "is-leader" : ""}`}
                  key={team.team}
                >
                  <div className="public-standing-rank">{medal}</div>

                  <div className="public-standing-main">
                    <strong>{team.team}</strong>
                    <div className="public-standing-stats">
                      <span><small>O</small><b>{team.played || 0}</b></span>
                      <span><small>G</small><b>{team.won || 0}</b></span>
                      <span><small>B</small><b>{team.drawn || 0}</b></span>
                      <span><small>M</small><b>{team.lost || 0}</b></span>
                      <span className={goalDifference >= 0 ? "positive" : "negative"}>
                        <small>AV</small>
                        <b>{goalDifference > 0 ? `+${goalDifference}` : goalDifference}</b>
                      </span>
                    </div>
                  </div>

                  <div className="public-standing-points">
                    <strong>{team.points || 0}</strong>
                    <small>PUAN</small>
                  </div>
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
                  className={`public-scorer-card ${index === 0 ? "is-leader" : ""}`}
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
        .public-standing-cards {
          display: grid;
          gap: 12px;
          padding: 16px;
        }

        .public-standing-card {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr) 82px;
          align-items: center;
          gap: 14px;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.09);
          background: linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.018));
          box-shadow: inset 0 1px rgba(255,255,255,.035);
        }

        .public-standing-card.is-leader {
          border-color: rgba(212,175,55,.5);
          background: linear-gradient(100deg, rgba(212,175,55,.22), rgba(212,175,55,.055));
        }

        .public-standing-rank {
          width: 46px;
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          color: #f7d76d;
          background: rgba(212,175,55,.1);
          border: 1px solid rgba(212,175,55,.28);
          font-size: 20px;
          font-weight: 1000;
        }

        .public-standing-card.is-leader .public-standing-rank {
          color: #111827;
          background: linear-gradient(135deg, #f7df7a, #d4af37);
        }

        .public-standing-main { min-width: 0; }
        .public-standing-main > strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: white;
          font-size: 18px;
        }
        .public-standing-card.is-leader .public-standing-main > strong { color: #f7d76d; }

        .public-standing-stats {
          display: grid;
          grid-template-columns: repeat(5, minmax(42px, 1fr));
          gap: 8px;
          margin-top: 11px;
        }
        .public-standing-stats span {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 5px;
          padding: 7px 6px;
          border-radius: 10px;
          background: rgba(255,255,255,.045);
        }
        .public-standing-stats small { color: #94a3b8; font-size: 10px; font-weight: 900; }
        .public-standing-stats b { color: white; font-size: 14px; }
        .public-standing-stats .positive b { color: #4ade80; }
        .public-standing-stats .negative b { color: #f87171; }

        .public-standing-points {
          min-width: 70px;
          padding: 10px 8px;
          text-align: center;
          border-radius: 14px;
          color: #111827;
          background: linear-gradient(135deg, #f7df7a, #d4af37);
          box-shadow: 0 8px 20px rgba(212,175,55,.17);
        }
        .public-standing-points strong { display: block; font-size: 23px; line-height: 1; }
        .public-standing-points small { display: block; margin-top: 4px; font-size: 9px; font-weight: 1000; letter-spacing: .8px; }

        @media (max-width: 760px) {
          .public-tournament-page { gap: 14px !important; }

          .public-match-card {
            grid-template-columns: 1fr !important;
            min-height: auto !important;
          }

          .public-match-card > div:first-child {
            align-items: center;
            text-align: center;
            padding: 13px 14px !important;
          }

          .public-match-card > div:nth-child(2) {
            padding: 18px 12px !important;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;
            gap: 8px !important;
          }

          .public-match-card > div:nth-child(2) strong {
            font-size: 14px !important;
            overflow-wrap: anywhere;
          }

          .public-match-card > div:nth-child(2) > div {
            min-width: 58px !important;
            padding: 9px 8px !important;
            font-size: 17px !important;
          }

          .public-match-card > div:last-child {
            min-height: 48px;
            border-left: none !important;
            border-top: 1px solid rgba(255,255,255,.08);
          }

          .public-standing-cards { padding: 12px; gap: 10px; }
          .public-standing-card {
            grid-template-columns: 48px minmax(0,1fr) 64px;
            gap: 10px;
            padding: 13px 12px;
            border-radius: 16px;
          }
          .public-standing-rank { width: 40px; height: 40px; border-radius: 12px; font-size: 17px; }
          .public-standing-main > strong { font-size: 17px; }
          .public-standing-stats { grid-template-columns: repeat(5, 1fr); gap: 5px; margin-top: 9px; }
          .public-standing-stats span { flex-direction: column; gap: 1px; padding: 5px 2px; }
          .public-standing-stats small { font-size: 9px; }
          .public-standing-stats b { font-size: 13px; }
          .public-standing-points { min-width: 58px; padding: 9px 5px; border-radius: 12px; }
          .public-standing-points strong { font-size: 20px; }

          .public-scorer-card {
            grid-template-columns: 54px minmax(0, 1fr) 78px !important;
            gap: 8px !important;
            min-height: 76px !important;
            padding: 12px 10px !important;
          }
          .public-scorer-card > span {
            width: 40px !important;
            height: 40px !important;
            border-radius: 12px !important;
            font-size: 18px !important;
          }
          .public-scorer-card strong { font-size: 15px !important; }
          .public-scorer-card small { font-size: 11px !important; }
          .public-scorer-card > b {
            min-width: 68px !important;
            padding: 9px 6px !important;
            border-radius: 12px !important;
            font-size: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}