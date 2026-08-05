import { useEffect, useMemo, useState } from "react";

export default function GoalScorers() {
  const [goalStats, setGoalStats] = useState(() => {
    try {
      const saved =
        localStorage.getItem("sscup-goal-scorers") ||
        localStorage.getItem("sscup-goals");

      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    function loadGoals() {
      try {
        const saved =
          localStorage.getItem("sscup-goal-scorers") ||
          localStorage.getItem("sscup-goals");

        setGoalStats(
          saved ? JSON.parse(saved) : []
        );
      } catch {
        setGoalStats([]);
      }
    }

    function handleGoalsUpdated(event) {
      if (Array.isArray(event.detail)) {
        setGoalStats(event.detail);
      } else {
        loadGoals();
      }
    }

    window.addEventListener(
      "sscup-goals-updated",
      handleGoalsUpdated
    );

    window.addEventListener(
      "storage",
      loadGoals
    );

    window.addEventListener(
      "focus",
      loadGoals
    );

    loadGoals();

    return () => {
      window.removeEventListener(
        "sscup-goals-updated",
        handleGoalsUpdated
      );

      window.removeEventListener(
        "storage",
        loadGoals
      );

      window.removeEventListener(
        "focus",
        loadGoals
      );
    };
  }, []);

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

  function clearGoalScorers() {
    if (goalStats.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      "Gol krallığı kayıtları silinsin mi? Maçları tekrar kaydederseniz otomatik yeniden oluşur."
    );

    if (!confirmed) {
      return;
    }

    localStorage.setItem(
      "sscup-goal-scorers",
      JSON.stringify([])
    );
    localStorage.setItem(
      "sscup-goals",
      JSON.stringify([])
    );

    setGoalStats([]);
    window.dispatchEvent(
      new CustomEvent("sscup-goals-updated", { detail: [] })
    );
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

      {goalStats.length > 0 && (
        <button
          type="button"
          onClick={clearGoalScorers}
          style={{ marginTop: "20px" }}
        >
          🗑️ Gol Krallığını Temizle
        </button>
      )}
    </div>
  );
}