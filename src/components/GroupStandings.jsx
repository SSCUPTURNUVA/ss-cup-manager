import { useEffect, useMemo, useState } from "react";

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function getTeamName(team) {
  if (typeof team === "string") return team;
  return team?.name || team?.teamName || "";
}

function createEmptyRow(teamName) {
  return {
    team: teamName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function calculateGroupStandings(group, fixtures) {
  const table = {};

  (group.teams || []).forEach((team) => {
    const teamName = getTeamName(team);
    if (teamName) {
      table[teamName] = createEmptyRow(teamName);
    }
  });

  fixtures
    .filter((match) => match.groupId === group.id)
    .forEach((match) => {
      const home = match.home;
      const away = match.away;

      if (!home || !away) return;

      if (!table[home]) table[home] = createEmptyRow(home);
      if (!table[away]) table[away] = createEmptyRow(away);

      const isPlayed =
        match.played === true ||
        match.status === "completed" ||
        (match.homeScore !== "" && match.awayScore !== "");

      if (!isPlayed) return;

      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);

      if (
        !Number.isInteger(homeScore) ||
        !Number.isInteger(awayScore) ||
        homeScore < 0 ||
        awayScore < 0
      ) {
        return;
      }

      table[home].played += 1;
      table[away].played += 1;

      table[home].goalsFor += homeScore;
      table[home].goalsAgainst += awayScore;
      table[away].goalsFor += awayScore;
      table[away].goalsAgainst += homeScore;

      if (homeScore > awayScore) {
        table[home].won += 1;
        table[home].points += 3;
        table[away].lost += 1;
      } else if (awayScore > homeScore) {
        table[away].won += 1;
        table[away].points += 3;
        table[home].lost += 1;
      } else {
        table[home].drawn += 1;
        table[away].drawn += 1;
        table[home].points += 1;
        table[away].points += 1;
      }
    });

  return Object.values(table)
    .map((team) => ({
      ...team,
      goalDifference: team.goalsFor - team.goalsAgainst,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.localeCompare(b.team, "tr");
    });
}

export default function GroupStandings() {
  const [groups, setGroups] = useState(() =>
    readStorage("sscup-groups", [])
  );

  const [fixtures, setFixtures] = useState(() =>
    readStorage("sscup-group-fixtures", [])
  );

  useEffect(() => {
    const refreshGroups = () => {
      setGroups(readStorage("sscup-groups", []));
    };

    const refreshFixtures = () => {
      setFixtures(readStorage("sscup-group-fixtures", []));
    };

    window.addEventListener("storage", refreshGroups);
    window.addEventListener("storage", refreshFixtures);
    window.addEventListener(
      "sscup-group-fixtures-updated",
      refreshFixtures
    );

    const interval = window.setInterval(() => {
      refreshGroups();
      refreshFixtures();
    }, 1000);

    return () => {
      window.removeEventListener("storage", refreshGroups);
      window.removeEventListener("storage", refreshFixtures);
      window.removeEventListener(
        "sscup-group-fixtures-updated",
        refreshFixtures
      );
      window.clearInterval(interval);
    };
  }, []);

  const groupTables = useMemo(() => {
    return groups.map((group) => ({
      ...group,
      standings: calculateGroupStandings(group, fixtures),
    }));
  }, [groups, fixtures]);

  const qualifiedTeams = useMemo(() => {
    return groupTables.flatMap((group) =>
      group.standings.slice(0, 2).map((team, index) => ({
        groupId: group.id,
        groupName: group.name,
        position: index + 1,
        team: team.team,
        points: team.points,
        goalDifference: team.goalDifference,
        goalsFor: team.goalsFor,
      }))
    );
  }, [groupTables]);

  useEffect(() => {
    localStorage.setItem(
      "sscup-group-standings",
      JSON.stringify(groupTables)
    );

    localStorage.setItem(
      "sscup-group-qualified",
      JSON.stringify(qualifiedTeams)
    );

    window.dispatchEvent(
      new Event("sscup-group-standings-updated")
    );
  }, [groupTables, qualifiedTeams]);

  function refreshData() {
    setGroups(readStorage("sscup-groups", []));
    setFixtures(readStorage("sscup-group-fixtures", []));
    alert("Grup puan durumları güncellendi.");
  }

  const totalPlayedMatches = fixtures.filter(
    (match) =>
      match.played === true ||
      match.status === "completed" ||
      (match.homeScore !== "" && match.awayScore !== "")
  ).length;

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">GRUP AŞAMASI</span>
          <h2>📊 Grup Puan Durumu</h2>
          <p>
            Grup maç sonuçları otomatik hesaplanır. Her grubun ilk
            iki takımı eleme turuna yükselir.
          </p>
        </div>
      </section>

      <section
        className="panel-card"
        style={{ display: "grid", gap: "16px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong>{groups.length} Grup</strong>
            <span style={{ opacity: 0.65 }}> • </span>
            <strong>{totalPlayedMatches} Oynanan Maç</strong>
            <span style={{ opacity: 0.65 }}> • </span>
            <strong>{qualifiedTeams.length} Eleme Adayı</strong>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={refreshData}
          >
            🔄 Puan Durumunu Yenile
          </button>
        </div>
      </section>

      {!groups.length ? (
        <section className="panel-card">
          <p className="empty-message">
            Henüz grup oluşturulmadı. Önce Turnuva Formatı
            sayfasından grupları oluşturmalısın.
          </p>
        </section>
      ) : (
        groupTables.map((group) => (
          <section
            key={group.id}
            className="panel-card"
            style={{ display: "grid", gap: "18px" }}
          >
            <div className="section-title">
              <div>
                <h3>🏆 {group.name}</h3>
                <small style={{ opacity: 0.68 }}>
                  İlk 2 takım eleme turuna yükselir
                </small>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: "760px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "58px" }}>#</th>
                    <th style={{ textAlign: "left" }}>Takım</th>
                    <th>O</th>
                    <th>G</th>
                    <th>B</th>
                    <th>M</th>
                    <th>AG</th>
                    <th>YG</th>
                    <th>AV</th>
                    <th>P</th>
                    <th>Durum</th>
                  </tr>
                </thead>

                <tbody>
                  {group.standings.map((team, index) => {
                    const qualified = index < 2;

                    return (
                      <tr
                        key={team.team}
                        style={{
                          background: qualified
                            ? "rgba(58, 196, 117, 0.13)"
                            : undefined,
                        }}
                      >
                        <td style={{ textAlign: "center" }}>
                          <strong>{index + 1}</strong>
                        </td>

                        <td>
                          <strong>{team.team}</strong>
                        </td>

                        <td style={{ textAlign: "center" }}>
                          {team.played}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {team.won}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {team.drawn}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {team.lost}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {team.goalsFor}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {team.goalsAgainst}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {team.goalDifference > 0 ? "+" : ""}
                          {team.goalDifference}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <strong>{team.points}</strong>
                        </td>

                        <td style={{ textAlign: "center" }}>
                          {qualified ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: "999px",
                                background:
                                  "rgba(58, 196, 117, 0.18)",
                                color: "#8ff0b8",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                            >
                              ✅ Eleme Turu
                            </span>
                          ) : (
                            <span style={{ opacity: 0.58 }}>
                              Grup Aşaması
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {qualifiedTeams.length > 0 && (
        <section
          className="panel-card"
          style={{ display: "grid", gap: "16px" }}
        >
          <div className="section-title">
            <div>
              <h3>🎟️ Eleme Turuna Yükselenler</h3>
              <small style={{ opacity: 0.68 }}>
                Bu liste Eleme Turu sayfasında otomatik kullanılacak.
              </small>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            {qualifiedTeams.map((team) => (
              <article
                key={`${team.groupId}-${team.position}-${team.team}`}
                style={{
                  padding: "15px",
                  borderRadius: "14px",
                  border:
                    team.position === 1
                      ? "1px solid rgba(244, 201, 93, 0.52)"
                      : "1px solid rgba(143, 183, 255, 0.38)",
                  background:
                    team.position === 1
                      ? "rgba(244, 201, 93, 0.10)"
                      : "rgba(143, 183, 255, 0.08)",
                }}
              >
                <small style={{ opacity: 0.68 }}>
                  {team.groupName} • {team.position}. Sıra
                </small>

                <strong
                  style={{
                    display: "block",
                    marginTop: "7px",
                    fontSize: "17px",
                  }}
                >
                  {team.team}
                </strong>

                <span style={{ opacity: 0.72 }}>
                  {team.points} P • AV{" "}
                  {team.goalDifference > 0 ? "+" : ""}
                  {team.goalDifference}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}