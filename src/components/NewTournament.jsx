import { useState } from "react";
import { supabase } from "../supabase";

const DEFAULT_SETUP = {
  mainSponsor: "",
  organizer: "",
  venue: "",
  season: new Date().getFullYear().toString(),
  startDate: "",
};

export default function NewTournament({
  setTeams,
  setFixtures,
  setDrawOrder,
  setGoalScorers,
  setSettings,
  onNavigate,
}) {
  const [showSetup, setShowSetup] = useState(false);
  const [form, setForm] = useState(DEFAULT_SETUP);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function clearTournamentData() {
    // Telefon takip sayfası Supabase'i okur. Bu nedenle önce bulutu,
    // sonra PC'deki yerel veriyi temizliyoruz.
    // Buluttaki eski eleme ve turnuva durumlarını boşalt; tablo yapısını koru.
    const now = new Date().toISOString();
    const emptyStates = {
      knockout: {}, active_fixture_ids: { ids: [] }, match_lineups: {},
      knockout_draw_v1: {}, knockout_results_v1: [],
      knockout_goal_scorers_v1: [], knockout_cards_v1: [],
      knockout_schedule_v1: {}, knockout_match_center_v1: { activeMatch: null },
      squads: {}, team_contacts: {}, fixtures_snapshot: [],
      public_match_center: {},
    };
    for (const [id, value] of Object.entries(emptyStates)) {
      const { error } = await supabase.from("app_state").upsert({ id, value, updated_at: now });
      if (error) throw new Error(`${id}: ${error.message}`);
    }

    // ID türüne bakmadan gerçek kayıtları sil ve sonucu doğrula.
    for (const table of ["goal_scorers", "fixtures", "teams"]) {
      const { data, error: readError } = await supabase.from(table).select("id");
      if (readError) throw new Error(`${table} okuma: ${readError.message}`);
      const ids = (data || []).map((item) => item.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from(table).delete().in("id", ids.slice(i, i + 100));
        if (error) throw new Error(`${table} silme: ${error.message}`);
      }
      const { count, error: countError } = await supabase.from(table)
        .select("id", { count: "exact", head: true });
      if (countError) throw new Error(`${table} doğrulama: ${countError.message}`);
      if (count !== 0) throw new Error(`${table}: ${count} kayıt kaldı; silme yetkisini kontrol edin`);
    }

    setTeams([]);
    setFixtures([]);
    if (typeof setDrawOrder === "function") setDrawOrder([]);
    if (typeof setGoalScorers === "function") setGoalScorers([]);

    const keysToRemove = [
      "sscup-teams","sscup-fixtures","sscup-draw-order","sscup-scores",
      "sscup-goals","sscup-goal-scorers","sscup-match-goals","sscup-squads",
      "sscup-knockout","sscup-knockout-data","sscup-quarterfinals",
      "sscup-semifinals","sscup-champion","sscup-groups","sscup-group-count",
      "sscup-group-fixtures","sscup-group-standings","sscup-group-qualified",
      "sscup-quarter","sscup-semi","sscup-final","sscup-third-place",
      "sscup-quarter-pot-one","sscup-quarter-pot-two","sscup-quarter-draw-started",
      "sscup-match-events","sscup-active-match","sscup-live-match",
      "sscup-match-lineups","sscup-match-center-active",
      "sscup-match-event-side","sscup-match-event-type","sscup-penalty-side",
      "sscup-pending-fixture-sync","sscup-pending-app-state-sync",
      "sscup-knockout-match-center-active","sscup-knockout-draw-id",
      "sscup-quarter-mode","sscup-team-contacts"
    ];
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  function notifyApplication() {
    window.dispatchEvent(
      new CustomEvent("sscup-goals-updated", {
        detail: [],
      })
    );

    window.dispatchEvent(
      new CustomEvent("sscup-fixtures-updated", {
        detail: [],
      })
    );

    window.dispatchEvent(
      new Event("sscup-group-fixtures-updated")
    );

    window.dispatchEvent(
      new Event("sscup-group-standings-updated")
    );
  }

  async function startNewTournament() {
    const confirmed = window.confirm(
      "Aktif turnuvanın takım, fikstür, skor, golcü ve eleme verileri PC ve telefondan silinecek. Devam etmek istiyor musunuz?"
    );

    if (!confirmed) return;

    try {
      await clearTournamentData();
      notifyApplication();
      setShowSetup(true);
      alert("Turnuva PC ve canlı takip tarafında sıfırlandı.");
    } catch (error) {
      alert(
        "Sıfırlama tamamlanamadı. Hata: " +
        (error?.message || "Bilinmeyen hata") +
        "\n\nPC verileri korunmuştur."
      );
    }
  }

  function createTournament(event) {
    event.preventDefault();

    if (!form.organizer.trim()) {
      alert("Organizatör adını girin.");
      return;
    }

    if (!form.venue.trim()) {
      alert("Tesis adını girin.");
      return;
    }

    const currentSettings = JSON.parse(
      localStorage.getItem("sscup-settings") || "{}"
    );

    const updatedSettings = {
      ...currentSettings,
      tournamentName: "S&S CUP",
      slogan:
        currentSettings.slogan ||
        "Kazanan Sahada Belli Olur",
      mainSponsor: form.mainSponsor.trim(),
      organizer: form.organizer.trim(),
      venue: form.venue.trim(),
      season:
        form.season.trim() ||
        new Date().getFullYear().toString(),
      startDate: form.startDate,
      setupCompleted: true,
    };

    localStorage.setItem(
      "sscup-settings",
      JSON.stringify(updatedSettings)
    );

    if (typeof setSettings === "function") {
      setSettings(updatedSettings);
    }

    window.dispatchEvent(
      new CustomEvent("sscup-settings-updated", {
        detail: updatedSettings,
      })
    );

    setShowSetup(false);
    setForm(DEFAULT_SETUP);

    if (typeof onNavigate === "function") {
      onNavigate("teams");
    }

    alert(
      `${
        updatedSettings.mainSponsor
          ? `${updatedSettings.mainSponsor} `
          : ""
      }S&S CUP ${updatedSettings.season} hazır.`
    );
  }

  function cancelSetup() {
    setShowSetup(false);
    setForm(DEFAULT_SETUP);
  }

  return (
    <section className="new-tournament-card">
      <div className="new-tournament-heading">
        <span className="new-tournament-icon">🏆</span>

        <div>
          <span className="eyebrow">YENİ SEZON</span>
          <h2>Yeni Turnuva Başlat</h2>
          <p>
            Mevcut maç ve takım verilerini temizleyerek
            yeni bir S&S CUP sezonu oluşturur.
          </p>
        </div>
      </div>

      <div className="new-tournament-warning">
        <strong>S&S CUP adı değiştirilemez.</strong>
        <span>
          Ana sponsor, organizatör, tesis ve sezon
          bilgilerini yeniden belirleyebilirsiniz.
        </span>
      </div>

      {!showSetup ? (
        <button
          type="button"
          className="danger-button new-tournament-start"
          onClick={startNewTournament}
        >
          🆕 Yeni Turnuva Başlat
        </button>
      ) : (
        <form
          className="new-tournament-form"
          onSubmit={createTournament}
        >
          <div className="setup-brand-preview">
            <small>TURNUVA BAŞLIĞI</small>
            <strong>
              {form.mainSponsor.trim()
                ? `${form.mainSponsor.trim()} S&S CUP`
                : "S&S CUP"}
            </strong>
            <span>Kazanan Sahada Belli Olur</span>
          </div>

          <div className="form-grid">
            <label>
              Ana Sponsor
              <input
                type="text"
                name="mainSponsor"
                value={form.mainSponsor}
                onChange={updateField}
                placeholder="Örnek: CEP STORE"
                maxLength={50}
              />
              <small>İsteğe bağlıdır.</small>
            </label>

            <label>
              Sezon
              <input
                type="text"
                name="season"
                value={form.season}
                onChange={updateField}
                placeholder="2026"
                maxLength={12}
              />
            </label>

            <label>
              Organizatör
              <input
                type="text"
                name="organizer"
                value={form.organizer}
                onChange={updateField}
                placeholder="Serkan Toy"
                maxLength={80}
                required
              />
            </label>

            <label>
              Tesis Adı
              <input
                type="text"
                name="venue"
                value={form.venue}
                onChange={updateField}
                placeholder="GolPark Tesisleri"
                maxLength={80}
                required
              />
            </label>

            <label>
              Başlangıç Tarihi
              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={updateField}
              />
            </label>
          </div>

          <div className="new-tournament-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={cancelSetup}
            >
              Vazgeç
            </button>

            <button
              type="submit"
              className="primary-button"
            >
              🏆 Turnuvayı Oluştur
            </button>
          </div>
        </form>
      )}
    </section>
  );
}