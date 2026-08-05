import { useEffect, useMemo, useState } from "react";

const FORMAT_OPTIONS = [
  {
    id: "league",
    icon: "🌐",
    title: "Lig Usulü",
    description:
      "Mevcut S&S CUP sistemi. Takımlar belirlenen maç sayısı kadar farklı rakiple oynar ve ilk 8 üst tura çıkar.",
    status: "Hazır ve aktif",
  },
  {
    id: "groups",
    icon: "🧩",
    title: "Grup Aşaması",
    description:
      "Takımlar gruplara ayrılır; grup fikstürü, grup puan durumu ve üst tura çıkış bu yapı üzerinden yönetilir.",
    status: "Grup oluşturma hazır",
  },
];

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function getTeamName(team) {
  if (typeof team === "string") return team.trim();
  return (team?.name || team?.teamName || "").trim();
}

function shuffle(items) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [
      result[randomIndex],
      result[index],
    ];
  }

  return result;
}

function groupLetter(index) {
  return String.fromCharCode(65 + index);
}

export default function TournamentFormat({
  tournamentFormat,
  setTournamentFormat,
  teams = [],
}) {
  const [selectedFormat, setSelectedFormat] = useState(
    tournamentFormat || "league"
  );

  const [groupCount, setGroupCount] = useState(() =>
    readStorage("sscup-group-count", 4)
  );

  const [groups, setGroups] = useState(() =>
    readStorage("sscup-groups", [])
  );

  const teamNames = useMemo(
    () => teams.map(getTeamName).filter(Boolean),
    [teams]
  );

  const groupOptions = useMemo(() => {
    const maximum = Math.min(8, Math.max(2, Math.floor(teamNames.length / 2)));
    return [2, 3, 4, 5, 6, 7, 8].filter((count) => count <= maximum);
  }, [teamNames.length]);

  useEffect(() => {
    setSelectedFormat(tournamentFormat || "league");
  }, [tournamentFormat]);

  useEffect(() => {
    if (!groupOptions.length) return;
    if (!groupOptions.includes(groupCount)) {
      setGroupCount(groupOptions.includes(4) ? 4 : groupOptions[0]);
    }
  }, [groupCount, groupOptions]);

  function saveFormat() {
    setTournamentFormat(selectedFormat);

    const selectedTitle = FORMAT_OPTIONS.find(
      (option) => option.id === selectedFormat
    )?.title;

    alert(`${selectedTitle} turnuva formatı olarak kaydedildi.`);
  }

  function createGroups() {
    if (teamNames.length < 4) {
      alert("Grup oluşturmak için en az 4 takım eklemelisin.");
      return;
    }

    if (groupCount > teamNames.length) {
      alert("Grup sayısı takım sayısından fazla olamaz.");
      return;
    }

    const shuffledTeams = shuffle(teamNames);
    const nextGroups = Array.from({ length: groupCount }, (_, index) => ({
      id: `group-${groupLetter(index)}`,
      name: `${groupLetter(index)} Grubu`,
      teams: [],
    }));

    shuffledTeams.forEach((teamName, index) => {
      nextGroups[index % groupCount].teams.push(teamName);
    });

    setGroups(nextGroups);
    localStorage.setItem("sscup-groups", JSON.stringify(nextGroups));
    localStorage.setItem("sscup-group-count", JSON.stringify(groupCount));
    alert(`${groupCount} grup başarıyla oluşturuldu.`);
  }

  function clearGroups() {
    if (!window.confirm("Oluşturulan gruplar silinsin mi?")) return;
    setGroups([]);
    localStorage.removeItem("sscup-groups");
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">TURNUVA AYARLARI</span>
          <h2>🏆 Turnuva Formatı</h2>
          <p>
            Lig usulü ile grup aşaması arasında seçim yap. Mevcut lig sistemi
            korunur; grup sistemi ayrı olarak kaydedilir.
          </p>
        </div>
      </section>

      <section className="panel-card" style={{ display: "grid", gap: "18px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {FORMAT_OPTIONS.map((option) => {
            const isSelected = selectedFormat === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedFormat(option.id)}
                aria-pressed={isSelected}
                style={{
                  width: "100%",
                  minHeight: "220px",
                  padding: "22px",
                  borderRadius: "18px",
                  border: isSelected
                    ? "2px solid #f4c430"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                  background: isSelected
                    ? "rgba(244, 196, 48, 0.12)"
                    : "rgba(255, 255, 255, 0.04)",
                  color: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                  boxShadow: isSelected
                    ? "0 0 0 3px rgba(244, 196, 48, 0.08)"
                    : "none",
                  transition: "0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <span style={{ fontSize: "42px" }}>{option.icon}</span>
                  <span
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      border: isSelected
                        ? "7px solid #f4c430"
                        : "2px solid rgba(255, 255, 255, 0.35)",
                      flexShrink: 0,
                    }}
                  />
                </div>

                <h3 style={{ margin: "18px 0 8px" }}>{option.title}</h3>
                <p style={{ margin: 0, lineHeight: 1.6, opacity: 0.78 }}>
                  {option.description}
                </p>

                <small
                  style={{
                    display: "inline-block",
                    marginTop: "18px",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: "rgba(255, 255, 255, 0.08)",
                    opacity: 0.82,
                  }}
                >
                  {option.status}
                </small>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <p style={{ margin: 0, opacity: 0.78 }}>
            Aktif seçim: {" "}
            <strong>
              {selectedFormat === "groups" ? "Grup Aşaması" : "Lig Usulü"}
            </strong>
          </p>

          <button type="button" className="primary-button" onClick={saveFormat}>
            💾 Formatı Kaydet
          </button>
        </div>
      </section>

      {selectedFormat === "groups" && (
        <>
          <section className="panel-card" style={{ display: "grid", gap: "18px" }}>
            <div className="section-title">
              <div>
                <h3>🎲 Grup Oluşturma</h3>
                <p style={{ margin: "6px 0 0", opacity: 0.72 }}>
                  Sistemde kayıtlı {teamNames.length} takım bulunuyor.
                </p>
              </div>
            </div>

            {teamNames.length < 4 ? (
              <p className="empty-message">
                Önce Takımlar sayfasından en az 4 takım eklemelisin.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  {groupOptions.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setGroupCount(count)}
                      style={{
                        padding: "12px 18px",
                        borderRadius: "12px",
                        border:
                          groupCount === count
                            ? "2px solid #f4c430"
                            : "1px solid rgba(255,255,255,0.16)",
                        background:
                          groupCount === count
                            ? "rgba(244,196,48,0.14)"
                            : "rgba(255,255,255,0.04)",
                        color: "inherit",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      {count} Grup
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={createGroups}
                  >
                    🎲 Grupları Oluştur
                  </button>

                  {groups.length > 0 && (
                    <button type="button" onClick={clearGroups}>
                      🗑️ Grupları Temizle
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          {groups.length > 0 && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: "16px",
              }}
            >
              {groups.map((group) => (
                <article key={group.id} className="panel-card">
                  <div className="section-title">
                    <h3>🏆 {group.name}</h3>
                  </div>

                  <div style={{ display: "grid", gap: "10px" }}>
                    {group.teams.map((teamName, index) => (
                      <div
                        key={teamName}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "12px",
                          borderRadius: "12px",
                          background: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <strong style={{ opacity: 0.65 }}>{index + 1}</strong>
                        <span>{teamName}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
