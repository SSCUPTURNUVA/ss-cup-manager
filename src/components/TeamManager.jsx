import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { syncAppStateWithRetry } from "../utils/pendingAppStateSync";
export default function TeamManager({
  teams,
  setTeams,
  drawOrder,
  setDrawOrder,
  fixtures = [],
  setFixtures,
}) {
  const [teamName, setTeamName] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingName, setEditingName] = useState("");

  const drawCompleted = useMemo(() => {
    return (
      teams.length > 0 &&
      drawOrder.length === teams.length &&
      teams.every((team) => drawOrder.includes(team))
    );
  }, [teams, drawOrder]);

  // Fikstür oluştuysa kura dizisi yanlışlıkla bozulsa bile takım ekleme/silme açılmaz.
  // Saha sürümünde mevcut turnuva verisini kazara sıfırlamaya karşı ikinci kilit.
  const competitionLocked = drawCompleted || (Array.isArray(fixtures) && fixtures.length > 0);

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

    if (competitionLocked) {
      alert(
        "Turnuva fikstürü/kurası oluşturulduğu için takım listesi değiştirilemez."
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


  function startEditTeam(index) {
    setEditingIndex(index);
    setEditingName(teams[index] || "");
  }

  function cancelEditTeam() {
    setEditingIndex(null);
    setEditingName("");
  }

  async function saveTeamName(index) {
    const oldName = teams[index];
    const newName = editingName.trim();

    if (!oldName) return;

    if (!newName) {
      alert("Takım adı boş bırakılamaz.");
      return;
    }

    const duplicateTeam = teams.some(
      (team, teamIndex) =>
        teamIndex !== index &&
        team.toLocaleLowerCase("tr-TR") ===
          newName.toLocaleLowerCase("tr-TR")
    );

    if (duplicateTeam) {
      alert("Bu takım adı zaten kullanılıyor.");
      return;
    }

    if (oldName === newName) {
      cancelEditTeam();
      return;
    }

    const updatedTeams = teams.map((team, teamIndex) =>
      teamIndex === index ? newName : team
    );

    const updatedDrawOrder = drawOrder.map((team) =>
      team === oldName ? newName : team
    );

    setTeams(updatedTeams);
    setDrawOrder(updatedDrawOrder);

    localStorage.setItem("sscup-teams", JSON.stringify(updatedTeams));
    localStorage.setItem("sscup-draw-order", JSON.stringify(updatedDrawOrder));

    setFixtures((currentFixtures) => {
      const updatedFixtures = currentFixtures.map((match) => ({
        ...match,
        home: match.home === oldName ? newName : match.home,
        away: match.away === oldName ? newName : match.away,
      }));

      localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));
      return updatedFixtures;
    });

    try {
      const savedSquads = localStorage.getItem("sscup-squads");
      const squads = savedSquads ? JSON.parse(savedSquads) : {};
      if (Object.prototype.hasOwnProperty.call(squads, oldName)) {
        squads[newName] = squads[oldName];
        delete squads[oldName];
        localStorage.setItem("sscup-squads", JSON.stringify(squads));
        await syncAppStateWithRetry("squads", squads);
      }
    } catch (error) {
      console.error("Kadro takım adı güncelleme hatası:", error);
    }

    try {
      const { error: teamError } = await supabase
        .from("teams")
        .update({ name: newName })
        .eq("name", oldName);

      if (teamError) {
        console.error("Supabase takım adı güncelleme hatası:", teamError);
      }

      const { error: homeError } = await supabase
        .from("fixtures")
        .update({ home: newName })
        .eq("home", oldName);

      if (homeError) {
        console.error("Supabase ev sahibi adı güncelleme hatası:", homeError);
      }

      const { error: awayError } = await supabase
        .from("fixtures")
        .update({ away: newName })
        .eq("away", oldName);

      if (awayError) {
        console.error("Supabase deplasman adı güncelleme hatası:", awayError);
      }
    } catch (error) {
      console.error("Takım adı eşitleme hatası:", error);
    }

    cancelEditTeam();
  }

  async function deleteTeam(index) {
    if (competitionLocked) {
      alert(
        "Turnuva fikstürü/kurası oluşturulduğu için takım silinemez."
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
        await syncAppStateWithRetry("squads", {});
      } else {
        delete squads[teamToDelete];

        localStorage.setItem(
          "sscup-squads",
          JSON.stringify(squads)
        );
        await syncAppStateWithRetry("squads", squads);
      }
    } catch {
      localStorage.setItem(
        "sscup-squads",
        JSON.stringify({})
      );
    }

    setTeams(updatedTeams);
    localStorage.setItem("sscup-teams", JSON.stringify(updatedTeams));

    try {
      const { error: deleteError } = await supabase
        .from("teams")
        .delete()
        .eq("name", teamToDelete);

      if (deleteError) {
        console.error("Supabase takım silme hatası:", deleteError);
        alert("Takım PC'den silindi ancak canlı takip verisinden silinemedi. Takip Sayfasıyla Eşitle butonuna basın.");
      }
    } catch (error) {
      console.error("Supabase takım silme hatası:", error);
    }

    await clearCompetitionData();

    setTeamName("");

    if (isLastTeam) {
      alert(
        "Turnuvadaki bütün takımlar ve turnuva verileri temizlendi."
      );
    }
  }

  async function syncTeamsToCloud() {
    const confirmed = window.confirm(
      `PC'deki ${teams.length} takım canlı takip sayfasına aynen aktarılsın mı?\n\nBuluttaki eski takım listesi bununla değiştirilecek.`
    );

    if (!confirmed) return;

    try {
      const { error: clearError } = await supabase
        .from("teams")
        .delete()
        .neq("id", 0);

      if (clearError) throw clearError;

      if (teams.length > 0) {
        const { error: insertError } = await supabase
          .from("teams")
          .insert(teams.map((name) => ({ name })));

        if (insertError) throw insertError;
      }

      localStorage.setItem("sscup-teams", JSON.stringify(teams));
      alert(`✅ Canlı takip takım listesi eşitlendi. Şu an ${teams.length} takım var.`);
    } catch (error) {
      console.error("Takım eşitleme hatası:", error);
      alert("Takım listesi canlı takiple eşitlenemedi. İnternet/Supabase bağlantısını kontrol edin.");
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      addTeam();
    }
  }

  return (
    <div className="card team-manager-card">
      <div className="team-manager-header">
        <div>
          <span className="team-manager-kicker">TURNUVA YÖNETİMİ</span>
          <h2>👥 Takımlar</h2>
          <p>Takımları ekleyin, isimlerini düzenleyin veya kura öncesinde silin.</p>
        </div>

        <div className="team-manager-actions">
          <button
            type="button"
            className="team-sync-button"
            onClick={syncTeamsToCloud}
            title="PC'deki takım listesini canlı takip sayfasıyla eşitle"
          >
            ☁️ Takip Sayfasıyla Eşitle
          </button>
          <div className="team-manager-count">
            <strong>{teams.length}</strong>
            <span>/ 30 TAKIM</span>
          </div>
        </div>
      </div>

      {competitionLocked && (
        <div className="team-lock-notice">
          <div className="team-lock-icon">🔒</div>
          <div>
            <strong>Fanus kurası tamamlandı</strong>
            <p>Yeni takım ekleme ve silme kapalıdır. Takım adını gerektiğinde düzenleyebilirsiniz.</p>
          </div>
        </div>
      )}

      <div className="team-add-panel">
        <div className="team-add-label">YENİ TAKIM</div>
        <div className="team-add-row">
          <input
            type="text"
            placeholder={
              competitionLocked
                ? "Turnuva başladı — yeni takım ekleme kapalı"
                : "Takım adını yazın..."
            }
            value={teamName}
            disabled={competitionLocked}
            onChange={(event) => setTeamName(event.target.value)}
            onKeyDown={handleKeyDown}
          />

          <button
            type="button"
            className="team-add-button"
            onClick={addTeam}
            disabled={competitionLocked}
          >
            {competitionLocked ? "🔒 Kilitli" : "＋ Takım Ekle"}
          </button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="team-empty-state">
          <span>⚽</span>
          <strong>Henüz takım eklenmedi</strong>
          <small>İlk takımı yukarıdaki alandan ekleyebilirsiniz.</small>
        </div>
      ) : (
        <div className="team-cards">
          {teams.map((team, index) => {
            const isEditing = editingIndex === index;

            return (
              <div className={`team-card-row ${isEditing ? "editing" : ""}`} key={`${team}-${index}`}>
                <div className="team-card-number">{String(index + 1).padStart(2, "0")}</div>

                <div className="team-card-main">
                  {isEditing ? (
                    <input
                      className="team-edit-input"
                      value={editingName}
                      autoFocus
                      maxLength={60}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveTeamName(index);
                        if (event.key === "Escape") cancelEditTeam();
                      }}
                    />
                  ) : (
                    <>
                      <span className="team-card-label">TAKIM</span>
                      <strong>{team}</strong>
                    </>
                  )}
                </div>

                <div className="team-card-actions">
                  {isEditing ? (
                    <>
                      <button type="button" className="team-save-button" onClick={() => saveTeamName(index)}>
                        ✓ Kaydet
                      </button>
                      <button type="button" className="team-cancel-button" onClick={cancelEditTeam}>
                        Vazgeç
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="team-edit-button" onClick={() => startEditTeam(index)}>
                        ✏️ Düzenle
                      </button>
                      <button
                        type="button"
                        className="team-delete-button"
                        disabled={competitionLocked}
                        onClick={() => deleteTeam(index)}
                        title={competitionLocked ? "Turnuva başladığı için takım silinemez" : "Takımı sil"}
                      >
                        {competitionLocked ? "🔒 Sil" : "🗑️ Sil"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}