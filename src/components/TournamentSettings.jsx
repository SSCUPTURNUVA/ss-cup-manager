import { useEffect, useState } from "react";

const DEFAULT_SETTINGS = {
  tournamentName: "S&S CUP",
  slogan: "Kazanan Sahada Belli Olur",
  season: "2026",
  organizer: "",
  venue: "",
  startDate: "",
  mainSponsor: "",
  subSponsors: [],
  primaryColor: "#d4af37",
  halfDurationMinutes: 25,
  halftimeDurationMinutes: 5,
};

function readSettings() {
  try {
    const saved = localStorage.getItem("sscup-settings");

    return saved
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function TournamentSettings() {
  const [settings, setSettings] = useState(readSettings);
  const [newSponsor, setNewSponsor] = useState("");

  useEffect(() => {
    localStorage.setItem(
      "sscup-settings",
      JSON.stringify(settings)
    );

    window.dispatchEvent(
      new CustomEvent("sscup-settings-updated", {
        detail: settings,
      })
    );
  }, [settings]);

  function updateField(field, value) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function addSponsor() {
    const sponsor = newSponsor.trim();

    if (!sponsor) return;

    if (
      settings.subSponsors.some(
        (item) =>
          item.toLocaleLowerCase("tr") ===
          sponsor.toLocaleLowerCase("tr")
      )
    ) {
      alert("Bu sponsor zaten ekli.");
      return;
    }

    setSettings((current) => ({
      ...current,
      subSponsors: [...current.subSponsors, sponsor],
    }));

    setNewSponsor("");
  }

  function removeSponsor(index) {
    setSettings((current) => ({
      ...current,
      subSponsors: current.subSponsors.filter(
        (_, sponsorIndex) => sponsorIndex !== index
      ),
    }));
  }

  function resetSettings() {
    const confirmed = window.confirm(
      "Turnuva bilgileri varsayılan ayarlara döndürülsün mü?"
    );

    if (!confirmed) return;

    setSettings(DEFAULT_SETTINGS);
    setNewSponsor("");
  }

  function saveSettings() {
    localStorage.setItem(
      "sscup-settings",
      JSON.stringify(settings)
    );

    window.dispatchEvent(
      new CustomEvent("sscup-settings-updated", {
        detail: settings,
      })
    );

    alert("Turnuva ayarları kaydedildi.");
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            TURNUVA YÖNETİMİ
          </span>

          <h2>🏆 Turnuva Ayarları</h2>

          <p>
            Turnuva adı, slogan, sezon ve sponsor
            bilgilerini buradan değiştirebilirsin.
          </p>
        </div>
      </section>

      <section
        className="panel-card"
        style={{ display: "grid", gap: "18px" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          <>
  <label style={{ display: "grid", gap: "7px" }}>
    <strong>👤 Organizatör</strong>

    <input
      type="text"
      value={settings.organizer}
      onChange={(event) =>
        updateField(
          "organizer",
          event.target.value
        )
      }
      placeholder="Organizatör adı"
    />
  </label>

  <label style={{ display: "grid", gap: "7px" }}>
    <strong>📍 Tesis</strong>

    <input
      type="text"
      value={settings.venue}
      onChange={(event) =>
        updateField(
          "venue",
          event.target.value
        )
      }
      placeholder="GolPark Spor Tesisleri"
    />
  </label>

  <label style={{ display: "grid", gap: "7px" }}>
    <strong>🗓️ Başlangıç Tarihi</strong>

    <input
      type="date"
      value={settings.startDate}
      onChange={(event) =>
        updateField(
          "startDate",
          event.target.value
        )
      }
    />
  </label>
</>

          <label style={{ display: "grid", gap: "7px" }}>
            <strong>📣 Slogan</strong>

            <input
              type="text"
              value={settings.slogan}
              onChange={(event) =>
                updateField("slogan", event.target.value)
              }
              placeholder="Kazanan Sahada Belli Olur"
            />
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <strong>📅 Sezon</strong>

            <input
              type="text"
              value={settings.season}
              onChange={(event) =>
                updateField("season", event.target.value)
              }
              placeholder="2026 Yaz"
            />
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <strong>👤 Organizatör</strong>

            <input
              type="text"
              value={settings.organizer}
              onChange={(event) =>
                updateField(
                  "organizer",
                  event.target.value
                )
              }
              placeholder="Organizatör adı"
            />
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <strong>🥇 Ana Sponsor</strong>

            <input
              type="text"
              value={settings.mainSponsor}
              onChange={(event) =>
                updateField(
                  "mainSponsor",
                  event.target.value
                )
              }
              placeholder="Cep Store"
            />
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <strong>⏱ Devre Süresi (dakika)</strong>

            <input
              type="number"
              min="1"
              max="90"
              value={settings.halfDurationMinutes}
              onChange={(event) =>
                updateField(
                  "halfDurationMinutes",
                  Math.max(1, Number(event.target.value) || 1)
                )
              }
            />
            <small style={{ opacity: 0.68 }}>
              Bütün maçlar 2 devre oynanır. Örnek: 25 seçilirse 25 + 25 dakika.
            </small>
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <strong>☕ Devre Arası Süresi (dakika)</strong>

            <input
              type="number"
              min="0"
              max="30"
              value={settings.halftimeDurationMinutes}
              onChange={(event) =>
                updateField(
                  "halftimeDurationMinutes",
                  Math.max(0, Number(event.target.value) || 0)
                )
              }
            />
            <small style={{ opacity: 0.68 }}>
              Devre arasında sayaç ayrı çalışır; istersen beklemeden 2. devreyi başlatabilirsin.
            </small>
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <strong>🎨 Ana Renk</strong>

            <input
              type="color"
              value={settings.primaryColor}
              onChange={(event) =>
                updateField(
                  "primaryColor",
                  event.target.value
                )
              }
              style={{
                width: "100%",
                minHeight: "46px",
                padding: "5px",
              }}
            />
          </label>
        </div>
      </section>

      <section
        className="panel-card"
        style={{ display: "grid", gap: "16px" }}
      >
        <div className="section-title">
          <div>
            <h3>🤝 Alt Sponsorlar</h3>

            <small style={{ opacity: 0.68 }}>
              İstediğin kadar sponsor ekleyebilirsin.
            </small>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            value={newSponsor}
            onChange={(event) =>
              setNewSponsor(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addSponsor();
              }
            }}
            placeholder="Sponsor adı"
            style={{ flex: "1 1 240px" }}
          />

          <button
            type="button"
            className="primary-button"
            onClick={addSponsor}
          >
            ➕ Sponsor Ekle
          </button>
        </div>

        {settings.subSponsors.length === 0 ? (
          <p className="empty-message">
            Henüz alt sponsor eklenmedi.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "10px",
            }}
          >
            {settings.subSponsors.map(
              (sponsor, index) => (
                <article
                  key={`${sponsor}-${index}`}
                  style={{
                    padding: "14px",
                    borderRadius: "14px",
                    background:
                      "rgba(255,255,255,0.05)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <strong>{sponsor}</strong>

                  <button
                    type="button"
                    onClick={() =>
                      removeSponsor(index)
                    }
                    aria-label={`${sponsor} sponsorunu sil`}
                  >
                    🗑️
                  </button>
                </article>
              )
            )}
          </div>
        )}
      </section>

      <section
        className="panel-card"
        style={{ display: "grid", gap: "14px" }}
      >
        <div className="section-title">
          <div>
            <h3>👁️ Önizleme</h3>

            <small style={{ opacity: 0.68 }}>
              Uygulamanın üst bölümünde görünecek
              bilgiler.
            </small>
          </div>
        </div>

        <div
          style={{
            padding: "24px",
            borderRadius: "18px",
            textAlign: "center",
            border: `2px solid ${settings.primaryColor}`,
            background:
              "linear-gradient(135deg, #071a3d, #102f68)",
            color: "white",
          }}
        >
          <h1 style={{ marginBottom: "8px" }}>
            🏆{" "}
            {settings.tournamentName || "Turnuva Adı"}
          </h1>

          <p style={{ margin: "6px 0", opacity: 0.84 }}>
            {settings.slogan || "Turnuva sloganı"}
          </p>

          {settings.season && (
            <p
              style={{
                margin: "6px 0",
                fontWeight: 800,
              }}
            >
              {settings.season}
            </p>
          )}

          {settings.mainSponsor && (
            <p style={{ marginTop: "14px" }}>
              Ana Sponsor:{" "}
              <strong>{settings.mainSponsor}</strong>
            </p>
          )}
        </div>
      </section>

      <section
        className="panel-card"
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="primary-button"
          onClick={saveSettings}
        >
          💾 Ayarları Kaydet
        </button>

        <button
          type="button"
          onClick={resetSettings}
        >
          ↩️ Varsayılana Dön
        </button>
      </section>
    </div>
  );
}