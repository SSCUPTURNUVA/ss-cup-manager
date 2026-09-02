import { useMemo, useState } from "react";
import { syncLeagueFixtureWithRetry } from "../utils/pendingFixtureSync";
import { supabase } from "../supabase";

const EVENT_LABELS = {
  scorer_record: "⚽ Golcü Kaydı",
  goal: "⚽ Gol",
  penalty_goal: "🥅 Penaltı Golü",
  assist: "🅰️ Asist",
  yellow_card: "🟨 Sarı Kart",
  red_card: "🟥 Kırmızı Kart",
  man_of_match: "⭐ Maçın Adamı",
  substitution: "🔄 Oyuncu Değişikliği",
};

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeEvent(event, index) {
  return {
    ...event,
    id: event?.id || `event-${index}`,
    type: event?.type || "scorer_record",
    playerId: event?.playerId || "",
    playerName: event?.playerName || event?.name || "Oyuncu",
    name: event?.playerName || event?.name || "Oyuncu",
    shirtNumber: event?.shirtNumber || "",
    team: event?.team || event?.teamName || "",
    minute: event?.minute ?? "",
    playerOutName: event?.playerOutName || event?.playerName || event?.name || "",
    playerInName: event?.playerInName || event?.secondPlayerName || "",
  };
}

function isGoalEvent(event) {
  return ["goal", "penalty_goal", "scorer_record"].includes(event?.type);
}

function formatDate(value) {
  if (!value) return "Tarih belirtilmedi";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function CompletedMatches({
  fixtures = [],
  setFixtures,
  matchFilter = () => true,
  groupMode = "week",
  emptyTitle = "Henüz tamamlanan maç yok",
  emptyText = "Biten maçlar burada ayrı olarak listelenecek.",
}) {
  const [openedIndex, setOpenedIndex] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({
    type: "scorer_record",
    side: "home",
    playerId: "",
    minute: "",
  });

  const completedGroups = useMemo(() => {
    const groups = {};

    const stageOrder = [
      "Çeyrek Final",
      "Yarı Final",
      "3.'lük Maçı",
      "Final",
    ];

    fixtures.forEach((match, index) => {
      if (match.played !== true || !matchFilter(match)) return;

      const groupKey = groupMode === "stage"
        ? (() => {
            const label = String(match.stageLabel || "Eleme Maçı");
            if (label.startsWith("Çeyrek Final")) return "Çeyrek Final";
            if (label.startsWith("Yarı Final")) return "Yarı Final";
            if (label.includes("3.'lük") || label.includes("3.lük")) return "3.'lük Maçı";
            if (label.startsWith("Final")) return "Final";
            return "Diğer Maçlar";
          })()
        : String(Number(match.week) || 1);

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push({ match, index });
    });

    const keys = Object.keys(groups).sort((a, b) => {
      if (groupMode === "stage") {
        const aIndex = stageOrder.indexOf(a);
        const bIndex = stageOrder.indexOf(b);
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      }
      return Number(a) - Number(b);
    });

    return keys.map((key) => ({
      key,
      title: groupMode === "stage" ? key : `${key}. Hafta`,
      matches: groups[key].sort((a, b) => {
        const aLabel = String(a.match.stageLabel || a.match.knockoutKey || "");
        const bLabel = String(b.match.stageLabel || b.match.knockoutKey || "");
        return aLabel.localeCompare(bLabel, "tr", { numeric: true });
      }),
    }));
  }, [fixtures, groupMode, matchFilter]);

  function getSquad(teamName) {
    const squads = readJson("sscup-squads", {});
    return Array.isArray(squads?.[teamName]) ? squads[teamName] : [];
  }

  function getEvents(match, matchIndex) {
    const events = Array.isArray(match?.events)
      ? match.events.map(normalizeEvent)
      : [];

    return events;
  }

  async function persist(updatedFixtures) {
    setFixtures(updatedFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));

    const changed = updatedFixtures.filter((match, index) =>
      JSON.stringify(match) !== JSON.stringify(fixtures[index])
    );

    await Promise.all(changed.map(async (match) => {
      if (match?.isKnockout === true) {
        try {
          const { data: row, error } = await supabase
            .from("app_state")
            .select("value")
            .eq("id", "knockout")
            .maybeSingle();
          if (error) throw error;
          const value = row?.value && typeof row.value === "object" ? { ...row.value } : {};
          const cloudMatch = {
            ...match,
            homePenalties: match.homePenalties ?? match.homePen ?? "",
            awayPenalties: match.awayPenalties ?? match.awayPen ?? "",
            updated_at: new Date().toISOString(),
          };
          const key = String(match.knockoutKey || "");
          if (key.startsWith("quarter-")) {
            const i = Number(key.split("-")[1]);
            const list = Array.isArray(value.quarter) ? [...value.quarter] : [];
            list[i] = { ...(list[i] || {}), ...cloudMatch };
            value.quarter = list;
          } else if (key.startsWith("semi-")) {
            const i = Number(key.split("-")[1]);
            const list = Array.isArray(value.semi) ? [...value.semi] : [];
            list[i] = { ...(list[i] || {}), ...cloudMatch };
            value.semi = list;
          } else if (key === "final-0") value.finalMatch = { ...(value.finalMatch || {}), ...cloudMatch };
          else if (key === "third-place-0") value.thirdPlace = { ...(value.thirdPlace || {}), ...cloudMatch };
          await supabase.from("app_state").upsert({ id: "knockout", value, updated_at: new Date().toISOString() });
        } catch (error) {
          console.error("Tamamlanan eleme maçı buluta kaydedilemedi:", error);
        }
      } else {
        await syncLeagueFixtureWithRetry(match);
      }
    }));

    window.dispatchEvent(
      new CustomEvent("sscup-fixtures-updated", { detail: updatedFixtures })
    );
  }

  function rebuildScorers(updatedFixtures) {
    const totals = {};

    updatedFixtures.forEach((match) => {
      const goals = (Array.isArray(match.events) ? match.events : [])
        .map(normalizeEvent)
        .filter(isGoalEvent);

      goals.forEach((goal) => {
        if (!goal.playerId || !goal.team) return;
        const key = `${goal.team}-${goal.playerId}`;
        if (!totals[key]) {
          totals[key] = {
            id: key,
            playerId: goal.playerId,
            name: goal.playerName || goal.name,
            playerName: goal.playerName || goal.name,
            team: goal.team,
            teamName: goal.team,
            shirtNumber: goal.shirtNumber || "",
            goals: 0,
          };
        }
        totals[key].goals += 1;
      });
    });

    const result = Object.values(totals).sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return String(a.name).localeCompare(String(b.name), "tr-TR");
    });

    localStorage.setItem("sscup-goals", JSON.stringify(result));
    localStorage.setItem("sscup-goal-scorers", JSON.stringify(result));
    window.dispatchEvent(
      new CustomEvent("sscup-goals-updated", { detail: result })
    );
  }

  function resetDraft() {
    setEditingId(null);
    setDraft({ type: "scorer_record", side: "home", playerId: "", minute: "" });
  }

  async function saveEvent() {
    const match = fixtures[openedIndex];
    if (!match) return;
    const teamName = draft.side === "home" ? match.home : match.away;
    const squad = getSquad(teamName);
    const player = squad.find((item, index) =>
      String(item.id || item.playerId || index) === String(draft.playerId)
    );

    if (!player) {
      alert("Oyuncuyu seçiniz.");
      return;
    }

    const currentEvents = getEvents(match, openedIndex);
    const eventData = {
      id: editingId || `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: draft.type,
      playerId: player.id || player.playerId || draft.playerId,
      playerName: player.name || player.playerName || "Oyuncu",
      name: player.name || player.playerName || "Oyuncu",
      shirtNumber: player.shirtNumber || "",
      team: teamName,
      minute: draft.minute === "" ? "" : Number(draft.minute),
    };

    const updatedEvents = editingId
      ? currentEvents.map((event) => (event.id === editingId ? eventData : event))
      : [...currentEvents, eventData];

    const updatedFixtures = fixtures.map((fixture, index) =>
      index === openedIndex ? { ...fixture, events: updatedEvents } : fixture
    );

    await persist(updatedFixtures);
    rebuildScorers(updatedFixtures);
    resetDraft();
  }

  function editEvent(match, event) {
    setEditingId(event.id);
    setDraft({
      type: event.type || "scorer_record",
      side: event.team === match.away ? "away" : "home",
      playerId: String(event.playerId || ""),
      minute: event.minute ?? "",
    });
  }

  async function deleteEvent(eventId) {
    if (!window.confirm("Bu maç olayı silinsin mi?")) return;
    const match = fixtures[openedIndex];
    const updatedEvents = getEvents(match, openedIndex).filter(
      (event) => event.id !== eventId
    );
    const updatedFixtures = fixtures.map((fixture, index) =>
      index === openedIndex ? { ...fixture, events: updatedEvents } : fixture
    );
    await persist(updatedFixtures);
    rebuildScorers(updatedFixtures);
  }

  async function reopenMatch() {
    const match = fixtures[openedIndex];
    if (!match) return;
    if (!window.confirm(`${match.home} - ${match.away} maçı yeniden açılsın mı?`)) {
      return;
    }
    const updatedFixtures = fixtures.map((fixture, index) =>
      index === openedIndex
        ? {
            ...fixture,
            played: false,
            live: false,
            timerRunning: false,
            timerStartedAt: null,
          }
        : fixture
    );
    await persist(updatedFixtures);
    setOpenedIndex(null);
    resetDraft();
  }

  if (openedIndex !== null && fixtures[openedIndex]) {
    const match = fixtures[openedIndex];
    const events = getEvents(match, openedIndex);
    const selectedTeam = draft.side === "home" ? match.home : match.away;
    const squad = getSquad(selectedTeam);

    return (
      <div className="match-report-page">
        <button type="button" onClick={() => { setOpenedIndex(null); resetDraft(); }}>
          ← Tamamlanan Maçlara Dön
        </button>

        <section className="match-report-header">
          <span className="dashboard-kicker">MAÇ RAPORU</span>
          <h2>
            🏆 {match.home} {match.homeScore} - {match.awayScore} {match.away}
          </h2>
          <p>
            📅 {formatDate(match.date)} • 🕒 {match.time || "Saat belirtilmedi"} • 📍 {match.field || match.venue || "Saha 1"}
          </p>
          <p>
            <b>{Number(match.week) || 1}. Hafta • Maç No: {match.matchNo || openedIndex + 1}</b>
          </p>
        </section>

        <section className="match-report-events">
          <h3>📋 Maç Olayları</h3>
          {events.length === 0 ? (
            <div className="dashboard-empty-state">
              <span>📝</span>
              <h3>Henüz maç olayı girilmedi</h3>
              <p>Golcü, kart veya maçın adamı bilgisini aşağıdan ekleyin.</p>
            </div>
          ) : (
            <div className="match-event-list">
              {events.map((event) => (
                <article key={event.id} className="match-event-row">
                  <div>
                    <strong>{EVENT_LABELS[event.type] || "• Maç Olayı"}</strong>
                    <p>
                      {event.type === "substitution"
                        ? `Çıktı: ${event.playerOutName || event.playerName || event.name} • Girdi: ${event.playerInName || "Oyuncu"} • ${event.team}`
                        : `${event.playerName || event.name} • ${event.team}`}
                      {event.minute !== "" ? ` • ${event.minute}'` : ""}
                    </p>
                  </div>
                  <div className="match-event-actions">
                    <button type="button" onClick={() => editEvent(match, event)}>
                      ✏️ Düzenle
                    </button>
                    <button type="button" onClick={() => deleteEvent(event.id)}>
                      🗑 Sil
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="match-event-editor">
          <h3>{editingId ? "✏️ Olayı Düzenle" : "➕ Maç Olayı Ekle"}</h3>
          <div className="match-event-form">
            <label>
              Olay Türü
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, type: event.target.value }))
                }
              >
                <option value="scorer_record">⚽ Golcü Kaydı</option>
                <option value="assist">🅰️ Asist</option>
                <option value="yellow_card">🟨 Sarı Kart</option>
                <option value="red_card">🟥 Kırmızı Kart</option>
                <option value="man_of_match">⭐ Maçın Adamı</option>
              </select>
            </label>

            <label>
              Takım
              <select
                value={draft.side}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    side: event.target.value,
                    playerId: "",
                  }))
                }
              >
                <option value="home">{match.home}</option>
                <option value="away">{match.away}</option>
              </select>
            </label>

            <label>
              Oyuncu
              <select
                value={draft.playerId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    playerId: event.target.value,
                  }))
                }
              >
                <option value="">Oyuncu seçiniz</option>
                {squad.map((player, index) => (
                  <option
                    key={player.id || player.playerId || index}
                    value={player.id || player.playerId || index}
                  >
                    #{player.shirtNumber || "-"} {player.name || player.playerName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Dakika (isteğe bağlı)
              <input
                type="number"
                min="0"
                value={draft.minute}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, minute: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="match-event-editor-actions">
            <button type="button" onClick={saveEvent}>
              {editingId ? "💾 Değişikliği Kaydet" : "➕ Olayı Ekle"}
            </button>
            {editingId && (
              <button type="button" onClick={resetDraft}>
                Vazgeç
              </button>
            )}
            <button type="button" className="danger-button" onClick={reopenMatch}>
              🔓 Maçı Yeniden Aç
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (completedGroups.length === 0) {
    return (
      <div className="dashboard-empty-state">
        <span>🏁</span>
        <h3>{emptyTitle}</h3>
        <p>{emptyText}</p>
      </div>
    );
  }

  return completedGroups.map((group) => (
    <section key={group.key} style={{ marginBottom: "30px" }}>
      <h3 className="fixture-week-title">
        {groupMode === "stage" ? "🏆" : "📅"} {group.title}
      </h3>
      <div className="completed-fixture-list">
        {group.matches.map(({ match, index }) => (
          <article key={match.id || index} className="completed-fixture-card">
            <div>
              <small>Maç {match.matchNo || index + 1}</small>
              <h3>
                {match.home} <strong>{match.homeScore} - {match.awayScore}</strong> {match.away}
              </h3>
              <p>
                📅 {formatDate(match.date)} • 🕒 {match.time || "Saat belirtilmedi"} • 📍 {match.field || match.venue || "Saha 1"}
              </p>
            </div>
            <button type="button" onClick={() => setOpenedIndex(index)}>
              👁 Maçı Aç
            </button>
          </article>
        ))}
      </div>
    </section>
  ));
}
