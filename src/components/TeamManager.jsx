import { useMemo, useState } from "react";
import { supabase } from "../supabase";
export default function TeamManager({
  teams,
  setTeams,
  drawOrder,
  setDrawOrder,
  setFixtures,
}) {
  const [teamName, setTeamName] = useState("");

  const drawCompleted = useMemo(() => {
    return (
      teams.length > 0 &&
      drawOrder.length === teams.length &&
      teams.every((team) => drawOrder.includes(team))
    );
  }, [teams, drawOrder]);

  async function clearCompetitionData() {
    try {
      await supabase.from("fixtures").delete().neq("id", 0);
      await supabase.from("goal_scorers").delete().neq("id", 0);
    } catch (error) {
      console.error("Turnuva temizleme Supabase hatası:", error);
    }

    setFixtures([]);
    setDrawOrder([]);

    localStorage.setItem(
      "sscup-fixtures",
      JSON.stringify([])
    );

    localStorage.setItem(
      "sscup-draw-order",
      JSON.stringify([])
    );

    localStorage.setItem(
      "sscup-scores",
      JSON.stringify({})
    );

    localStorage.setItem(
      "sscup-match-goals",
      JSON.stringify({})
    );

    localStorage.setItem(
      "sscup-goals",
      JSON.stringify([])
    );

    /*
      Eleme turu bileşeninde kullanılan kayıt
      isimleri farklı olabileceği için muhtemel
      kayıtlar da temizlenir.
    */
    localStorage.removeItem("sscup-knockout");
    localStorage.removeItem("sscup-knockout-data");
    localStorage.removeItem("sscup-quarterfinals");
    localStorage.removeItem("sscup-semifinals");
    localStorage.removeItem("sscup-final");
    localStorage.removeItem("sscup-champion");

    window.dispatchEvent(
      new CustomEvent("sscup-goals-updated", {
        detail: [],
      })
    );
  }

  async function addTeam() {

    if (drawCompleted) {
      alert(
        "Fanus kurası tamamlandığı için takım listesi değiştirilemez."
      );
      return;
    }

    const name = teamName.trim();

    if (!name) {
      alert("Takım adı giriniz.");
      return;
    }

    const duplicateTeam = teams.some(
      (team) =>
        team.toLocaleLowerCase("tr-TR") ===
        name.toLocaleLowerCase("tr-TR")
    );

    if (duplicateTeam) {
      alert("Bu takım zaten eklendi.");
      return;
    }

    if (teams.length >= 30) {
      alert("En fazla 30 takım eklenebilir.");
      return;
    }

    const { error } = await supabase
      .from("teams")
      .insert([
        {
          name: name,
        },
      ]);

    if (error) {
      console.error(
        "Supabase takım ekleme hatası:",
        error
      );

      setTeams([...teams, name]);
      localStorage.setItem(
        "sscup-teams",
        JSON.stringify([...teams, name])
      );
      setTeamName("");
      return;
    }

    setTeams([...teams, name]);
    localStorage.setItem(
      "sscup-teams",
      JSON.stringify([...teams, name])
    );
    setTeamName("");

  }

  function deleteTeam(index) {
    if (drawCompleted) {
      alert(
        "Fanus kurası tamamlandığı için takım silinemez."
      );
      return;
    }

    const teamToDelete = teams[index];

    if (!teamToDelete) {
      return;
    }

    const isLastTeam = teams.length === 1;

    const message = isLastTeam
      ? `"${teamToDelete}" son takım.\n\nBu takım silinirse fikstür, kura sırası, skorlar, gol krallığı ve turnuva verileri temizlenecek.\n\nDevam edilsin mi?`
      : `"${teamToDelete}" takımı silinsin mi?\n\nTakım silindiğinde mevcut kura, fikstür, skor ve golcü kayıtları sıfırlanacaktır.`;

    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    const updatedTeams = teams.filter(
      (_, teamIndex) => teamIndex !== index
    );

    /*
      Silinen takımın kadrosunu da temizler.
      Diğer takımların kadroları korunur.
    */
    try {
      const savedSquads =
        localStorage.getItem("sscup-squads");

      const squads = savedSquads
        ? JSON.parse(savedSquads)
        : {};

      if (isLastTeam) {
        localStorage.setItem(
          "sscup-squads",
          JSON.stringify({})
        );
      } else {
        delete squads[teamToDelete];

        localStorage.setItem(
          "sscup-squads",
          JSON.stringify(squads)
        );
      }
    } catch {
      localStorage.setItem(
        "sscup-squads",
        JSON.stringify({})
      );
    }

    setTeams(updatedTeams);
    clearCompetitionData();

    setTeamName("");

    if (isLastTeam) {
      alert(
        "Turnuvadaki bütün takımlar ve turnuva verileri temizlendi."
      );
    } else {
      alert(
        `${teamToDelete} silindi. Takım listesi değiştiği için eski kura ve fikstür temizlendi.`
      );
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      addTeam();
    }
  }

  return (
    <div className="card">
      <h2>👥 Takımlar ({teams.length}/30)</h2>

      {drawCompleted && (
        <div
          style={{
            padding: "14px",
            marginBottom: "16px",
            border: "2px solid #d6a800",
            borderRadius: "10px",
            backgroundColor: "rgba(214, 168, 0, 0.1)",
          }}
        >
          <b>🔒 Takım listesi kilitlendi</b>

          <p style={{ marginBottom: 0 }}>
            Fanus kurası tamamlandığı için artık
            takım eklenemez veya silinemez.
          </p>
        </div>
      )}

      <div className="addRow">
        <input
          type="text"
          placeholder={
            drawCompleted
              ? "Kura tamamlandı — takım listesi kilitli"
              : "Takım adı"
          }
          value={teamName}
          disabled={drawCompleted}
          onChange={(event) =>
            setTeamName(event.target.value)
          }
          onKeyDown={handleKeyDown}
        />

        <button
          type="button"
          onClick={addTeam}
          disabled={drawCompleted}
        >
          {drawCompleted
            ? "🔒 Kilitli"
            : "Takım Ekle"}
        </button>
      </div>

      {teams.length === 0 ? (
        <p>Henüz takım eklenmedi.</p>
      ) : (
        <ul className="teamList">
          {teams.map((team, index) => (
            <li key={team}>
              <span>
                <b>{index + 1}.</b> {team}
              </span>

              <button
                type="button"
                className="deleteBtn"
                disabled={drawCompleted}
                onClick={() => deleteTeam(index)}
              >
                {drawCompleted ? "🔒" : "Sil"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}