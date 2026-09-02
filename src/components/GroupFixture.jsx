import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { syncAppStateWithRetry } from "../utils/pendingAppStateSync";

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function createRoundRobin(group, startingMatchNumber) {
  const participants = [...group.teams];
  if (participants.length % 2 !== 0) participants.push(null);

  const rounds = participants.length - 1;
  const matchesPerRound = participants.length / 2;
  const rotation = [...participants];
  const matches = [];
  let matchNumber = startingMatchNumber;

  for (let round = 0; round < rounds; round += 1) {
    for (let pair = 0; pair < matchesPerRound; pair += 1) {
      const first = rotation[pair];
      const second = rotation[rotation.length - 1 - pair];

      if (first && second) {
        const reverse = round % 2 === 1;
        matches.push({
          id: `GF-${group.id}-${round + 1}-${pair + 1}-${Date.now()}`,
          matchNo: `GM${String(matchNumber).padStart(3, "0")}`,
          groupId: group.id,
          groupName: group.name,
          week: round + 1,
          home: reverse ? second : first,
          away: reverse ? first : second,
          date: "",
          time: "",
          pitch: "Saha 1",
          duration: "25 + 25 dk",
          status: "waiting",
          played: false,
          homeScore: "",
          awayScore: "",
        });
        matchNumber += 1;
      }
    }

    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop());
    rotation.splice(0, rotation.length, fixed, ...rest);
  }

  return { matches, nextMatchNumber: matchNumber };
}

const STATUS_OPTIONS = [
  { value: "waiting", label: "🟢 Oynanmadı" },
  { value: "live", label: "🟡 Canlı" },
  { value: "completed", label: "✅ Tamamlandı" },
];

export default function GroupFixture() {
  const [groups, setGroups] = useState(() => readStorage("sscup-groups", []));
  const [fixtures, setFixtures] = useState(() =>
    readStorage("sscup-group-fixtures", [])
  );
  const cloudReadyRef = useRef(false);
  const applyingCloudRef = useRef(false);

  useEffect(() => {
    const refresh = () => setGroups(readStorage("sscup-groups", []));
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCloud() {
      const { data, error } = await supabase.from("app_state").select("value").eq("id", "group_fixtures").maybeSingle();
      if (cancelled) return;
      if (!error && Array.isArray(data?.value)) {
        applyingCloudRef.current = true;
        setFixtures(data.value);
        localStorage.setItem("sscup-group-fixtures", JSON.stringify(data.value));
        window.dispatchEvent(new Event("sscup-group-fixtures-updated"));
        window.setTimeout(() => { applyingCloudRef.current = false; cloudReadyRef.current = true; }, 0);
      } else {
        cloudReadyRef.current = true;
        if (fixtures.length) await syncAppStateWithRetry("group_fixtures", fixtures);
      }
    }
    loadCloud();
    const channel = supabase.channel(`group-fixtures-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.group_fixtures" }, (payload) => {
        const value = payload?.new?.value;
        if (!Array.isArray(value)) return;
        applyingCloudRef.current = true;
        setFixtures(value);
        localStorage.setItem("sscup-group-fixtures", JSON.stringify(value));
        window.dispatchEvent(new Event("sscup-group-fixtures-updated"));
        window.setTimeout(() => { applyingCloudRef.current = false; cloudReadyRef.current = true; }, 0);
      }).subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("sscup-group-fixtures", JSON.stringify(fixtures));
    window.dispatchEvent(new Event("sscup-group-fixtures-updated"));
    if (cloudReadyRef.current && !applyingCloudRef.current) syncAppStateWithRetry("group_fixtures", fixtures);
  }, [fixtures]);

  const groupedFixtures = useMemo(() => {
    return groups.map((group) => ({
      ...group,
      matches: fixtures.filter((match) => match.groupId === group.id),
    }));
  }, [groups, fixtures]);

  function generateFixtures() {
    if (!groups.length) {
      alert("Önce Turnuva Formatı sayfasından grupları oluşturmalısın.");
      return;
    }

    if (
      fixtures.length > 0 &&
      !window.confirm("Mevcut grup fikstürü silinip yeniden oluşturulsun mu?")
    ) {
      return;
    }

    let nextMatchNumber = 1;
    const nextFixtures = [];

    groups.forEach((group) => {
      const result = createRoundRobin(group, nextMatchNumber);
      nextFixtures.push(...result.matches);
      nextMatchNumber = result.nextMatchNumber;
    });

    setFixtures(nextFixtures);
    alert(`${nextFixtures.length} grup maçı oluşturuldu.`);
  }

  function updateMatch(matchId, field, value) {
    setFixtures((current) =>
      current.map((match) => {
        if (match.id !== matchId) return match;
        const next = { ...match, [field]: value };

        if (field === "status") {
          next.played = value === "completed";
        }

        if (field === "homeScore" || field === "awayScore") {
          const otherField = field === "homeScore" ? "awayScore" : "homeScore";
          if (value !== "" && next[otherField] !== "") {
            next.status = "completed";
            next.played = true;
          }
        }

        return next;
      })
    );
  }

  function clearFixtures() {
    if (!fixtures.length) return;
    if (!window.confirm("Grup fikstürünün tamamı silinsin mi?")) return;
    setFixtures([]);
    localStorage.removeItem("sscup-group-fixtures");
    syncAppStateWithRetry("group_fixtures", []);
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">GRUP AŞAMASI</span>
          <h2>🗓️ Grup Fikstürü</h2>
          <p>
            Grupların maçlarını otomatik oluştur; tarih, saat, saha ve maç
            durumunu istediğin zaman değiştir.
          </p>
        </div>
      </section>

      <section className="panel-card" style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="primary-button" onClick={generateFixtures}>
            🎲 Grup Fikstürünü Oluştur
          </button>
          {fixtures.length > 0 && (
            <button type="button" onClick={clearFixtures}>
              🗑️ Fikstürü Temizle
            </button>
          )}
        </div>
        <p style={{ margin: 0, opacity: 0.72 }}>
          {groups.length} grup • {fixtures.length} maç
        </p>
      </section>

      {!groups.length ? (
        <section className="panel-card">
          <p className="empty-message">
            Henüz grup oluşturulmadı. Önce Turnuva Formatı sayfasına git.
          </p>
        </section>
      ) : fixtures.length === 0 ? (
        <section className="panel-card">
          <p className="empty-message">
            Gruplar hazır. Yukarıdaki butonla grup fikstürünü oluştur.
          </p>
        </section>
      ) : (
        groupedFixtures.map((group) => {
          const weeks = [...new Set(group.matches.map((match) => match.week))].sort(
            (a, b) => a - b
          );

          return (
            <section key={group.id} className="panel-card" style={{ display: "grid", gap: "18px" }}>
              <div className="section-title">
                <h3>🏆 {group.name}</h3>
              </div>

              {weeks.map((week) => (
                <div key={week} style={{ display: "grid", gap: "12px" }}>
                  <h4 style={{ margin: 0, opacity: 0.82 }}>{week}. HAFTA</h4>

                  {group.matches
                    .filter((match) => match.week === week)
                    .map((match) => (
                      <article
                        key={match.id}
                        style={{
                          padding: "16px",
                          borderRadius: "16px",
                          background: "rgba(255,255,255,0.05)",
                          display: "grid",
                          gap: "14px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          <strong>{match.matchNo}</strong>
                          <span style={{ fontWeight: 700 }}>
                            {match.home} — {match.away}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: "10px",
                          }}
                        >
                          <label style={{ display: "grid", gap: "6px" }}>
                            <small>📅 Tarih</small>
                            <input
                              type="date"
                              value={match.date}
                              onChange={(event) =>
                                updateMatch(match.id, "date", event.target.value)
                              }
                            />
                          </label>

                          <label style={{ display: "grid", gap: "6px" }}>
                            <small>⏰ Saat</small>
                            <input
                              type="time"
                              value={match.time}
                              onChange={(event) =>
                                updateMatch(match.id, "time", event.target.value)
                              }
                            />
                          </label>

                          <label style={{ display: "grid", gap: "6px" }}>
                            <small>📍 Saha</small>
                            <input
                              type="text"
                              value={match.pitch}
                              onChange={(event) =>
                                updateMatch(match.id, "pitch", event.target.value)
                              }
                            />
                          </label>

                          <label style={{ display: "grid", gap: "6px" }}>
                            <small>⏱️ Maç Süresi</small>
                            <input
                              type="text"
                              value={match.duration || "25 + 25 dk"}
                              onChange={(event) =>
                                updateMatch(match.id, "duration", event.target.value)
                              }
                            />
                          </label>

                          <label style={{ display: "grid", gap: "6px" }}>
                            <small>Durum</small>
                            <select
                              value={match.status}
                              onChange={(event) =>
                                updateMatch(match.id, "status", event.target.value)
                              }
                            >
                              {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto 1fr",
                            alignItems: "center",
                            gap: "12px",
                            padding: "14px",
                            borderRadius: "14px",
                            background: "rgba(0,0,0,.18)",
                          }}
                        >
                          <div style={{ textAlign: "center" }}>
                            <strong style={{ display: "block", marginBottom: "8px" }}>
                              {match.home}
                            </strong>
                            <input
                              aria-label={`${match.home} skoru`}
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={match.homeScore}
                              onChange={(event) =>
                                updateMatch(match.id, "homeScore", event.target.value)
                              }
                              style={{ width: "76px", textAlign: "center", fontSize: "24px", fontWeight: 900 }}
                            />
                          </div>

                          <strong style={{ opacity: 0.48 }}>—</strong>

                          <div style={{ textAlign: "center" }}>
                            <strong style={{ display: "block", marginBottom: "8px" }}>
                              {match.away}
                            </strong>
                            <input
                              aria-label={`${match.away} skoru`}
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={match.awayScore}
                              onChange={(event) =>
                                updateMatch(match.id, "awayScore", event.target.value)
                              }
                              style={{ width: "76px", textAlign: "center", fontSize: "24px", fontWeight: 900 }}
                            />
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
