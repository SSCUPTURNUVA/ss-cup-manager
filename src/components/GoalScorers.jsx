import { useMemo } from "react";

export default function GoalScorers({ goalScorers = [] }) {
  const goalStats = Array.isArray(goalScorers) ? goalScorers : [];

  const sortedGoalStats = useMemo(() => {
    return [...goalStats].sort((a, b) => {
      const goalDifference =
        Number(b.goals) - Number(a.goals);

      if (goalDifference !== 0) {
        return goalDifference;
      }

      return String(a.name).localeCompare(
        String(b.name),
        "tr-TR"
      );
    });
  }, [goalStats]);

  function medal(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";

    return "⚽";
  }

  return (
    <div className="card">
      <h2>⚽ Gol Krallığı</h2>

      <p>
        Bu tablo, fikstürde kaydedilen golcülere
        göre otomatik hesaplanır.
      </p>

      {sortedGoalStats.length === 0 ? (
        <p>
          Henüz kaydedilmiş golcü bulunmuyor.
          Fikstürde skoru ve bütün golcüleri
          seçtikten sonra
          <b> Golcüleri Kaydet </b>
          butonuna basın.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    padding: "10px",
                    borderBottom:
                      "1px solid #ddd",
                  }}
                >
                  Sıra
                </th>

                <th
                  style={{
                    padding: "10px",
                    borderBottom:
                      "1px solid #ddd",
                  }}
                >
                  Forma
                </th>

                <th
                  style={{
                    padding: "10px",
                    borderBottom:
                      "1px solid #ddd",
                  }}
                >
                  Oyuncu
                </th>

                <th
                  style={{
                    padding: "10px",
                    borderBottom:
                      "1px solid #ddd",
                  }}
                >
                  Takım
                </th>

                <th
                  style={{
                    padding: "10px",
                    borderBottom:
                      "1px solid #ddd",
                  }}
                >
                  Gol
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedGoalStats.map(
                (player, index) => (
                  <tr
                    key={
                      player.id ||
                      `${player.team}-${player.playerId}`
                    }
                  >
                    <td
                      style={{
                        textAlign: "center",
                        padding: "10px",
                        borderBottom:
                          "1px solid #eee",
                      }}
                    >
                      {medal(index)} {index + 1}
                    </td>

                    <td
                      style={{
                        textAlign: "center",
                        padding: "10px",
                        borderBottom:
                          "1px solid #eee",
                      }}
                    >
                      #{player.shirtNumber ?? "-"}
                    </td>

                    <td
                      style={{
                        padding: "10px",
                        borderBottom:
                          "1px solid #eee",
                      }}
                    >
                      <b>{player.name}</b>
                    </td>

                    <td
                      style={{
                        padding: "10px",
                        borderBottom:
                          "1px solid #eee",
                      }}
                    >
                      {player.team}
                    </td>

                    <td
                      style={{
                        textAlign: "center",
                        padding: "10px",
                        borderBottom:
                          "1px solid #eee",
                      }}
                    >
                      <b>⚽ {player.goals}</b>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}