import { useMemo, useState } from "react";
import { supabase } from "../supabase";

const EVENT_LABELS = {
  scorer_record: "⚽ Golcü Kaydı",
  goal: "⚽ Gol",
  penalty_goal: "🥅 Penaltı Golü",
  assist: "🅰️ Asist",
  yellow_card: "🟨 Sarı Kart",
  red_card: "🟥 Kırmızı Kart",
  man_of_match: "⭐ Maçın Adamı",
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

    const hasGoalEvents = events.some(isGoalEvent);
    if (hasGoalEvents) return events;

    const legacy = readJson("sscup-match-goals", {})?.[matchIndex];
    const legacyGoals = [
      ...(legacy?.home || []).map((goal, index) => ({
        ...goal,
        id: `legacy-${matchIndex}-home-${index}`,
        type: "scorer_record",
        playerName: goal.name,
      })),
      ...(legacy?.away || []).map((goal, index) => ({
        ...goal,
        id: `legacy-${matchIndex}-away-${index}`,
        type: "scorer_record",
        playerName: goal.name,
      })),
    ].map(normalizeEvent);

    return [...events, ...legacyGoals];
  }

  function persist(updatedFixtures) {
    setFixtures(updatedFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));
    window.dispatchEvent(
      new CustomEvent("sscup-fixtures-updated", { detail: updatedFixtures })
    );
  }

  function rebuildScorers(updatedFixtures) {
    const totals = {};
    const legacy = readJson("sscup-match-goals", {});

    updatedFixtures.forEach((match, matchIndex) => {
      let goals = (Array.isArray(match.events) ? match.events : [])
        .map(normalizeEvent)
        .filter(isGoalEvent);

      if (goals.length === 0) {
        goals = [
          ...(legacy?.[matchIndex]?.home || []),
          ...(legacy?.[matchIndex]?.away || []),
        ].map((goal, index) =>
          normalizeEvent(
            { ...goal, id: `legacy-${matchIndex}-${index}`, type: "scorer_record" },
            index
          )
        );
      }

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

  function saveEvent() {
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

    persist(updatedFixtures);
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

  function deleteEvent(eventId) {
    if (!window.confirm("Bu maç olayı silinsin mi?")) return;
    const match = fixtures[openedIndex];
    const updatedEvents = getEvents(match, openedIndex).filter(
      (event) => event.id !== eventId
    );
    const updatedFixtures = fixtures.map((fixture, index) =>
      index === openedIndex ? { ...fixture, events: updatedEvents } : fixture
    );
    persist(updatedFixtures);
    rebuildScorers(updatedFixtures);
  }

  async function reopenMatch() {
    const match = fixtures[openedIndex];
    if (!match) return;
    if (!window.confirm(`${match.home} - ${match.away} maçı yeniden açılsın mı?`)) return;

    const reopened = {
      ...match,
      // "Maçı yeniden aç" eski maçın devamı değil, temiz bir yeniden oynatma başlatır.
      // Eski skor/olay kalırsa Maç Merkezi aynı maça devam ediyormuş gibi görünür.
      homeScore: 0,
      awayScore: 0,
      homePen: "",
      awayPen: "",
      events: [],
      goals: [],
      played: false,
      live: false,
      timerRunning: false,
      timerStartedAt: null,
      elapsedSeconds: 0,
      matchPhase: "waiting",
    };
    const sameFixture = (fixture, index) => {
      if (index === openedIndex) return true;
      if (String(fixture?.id ?? "") && String(fixture?.id ?? "") === String(match?.id ?? "")) return true;
      return (
        String(fixture?.home || "") === String(match?.home || "") &&
        String(fixture?.away || "") === String(match?.away || "") &&
        String(fixture?.date || "") === String(match?.date || "") &&
        String(fixture?.time || "") === String(match?.time || "")
      );
    };

    // Aynı maçın eski/çift fixture kopyası kaldıysa onu da birlikte sıfırla.
    // Tek bir stale kopyanın live=true kalması Maç Merkezi'nin maçı tekrar açmasına yetiyordu.
    const updatedFixtures = fixtures.map((fixture, index) =>
      sameFixture(fixture, index)
        ? { ...fixture, ...reopened, id: fixture?.id ?? reopened.id }
        : fixture
    );

    // Bilinçli geri alma işareti: gecikmiş eski runtime/completed/live yazıları bu maçı
    // yeniden Maç Merkezi'ne sokamasın. Yeniden Maç Merkezi'ne alınırken kaldırılır.
    const reopenedResetId = String(match?.id ?? "");
    if (reopenedResetId) localStorage.setItem("sscup-match-center-reopened-reset", reopenedResetId);

    // Bu maç Maç Merkezi'nde aktif/seçili kaldıysa geri alma sırasında mutlaka temizle.
    // Aksi halde played=false/waiting olsa bile MatchCenter localStorage anahtarından maçı
    // yeniden aktifmiş gibi açabiliyor.
    // Yeniden açma, Maç Merkezi seçimini koşulsuz kapatır. Eski sürümlerde anahtar
    // id / index / takım çifti biçimlerinde kalabildiği için eşleştirmeye güvenmiyoruz.
    localStorage.removeItem("sscup-match-center-active");
    localStorage.removeItem("sscup-match-center-selected");
    localStorage.removeItem("sscup-live-match");

    persist(updatedFixtures);

    try {
      // Reset işaretini ÖNCE yaz. Böylece diğer cihazlar eski completed/runtime kaydını
      // bir an görse bile geri alınmış maçı aktif/canlı kabul etmez.
      await supabase.from("app_state").upsert({
        id: "fixture_reopen_reset",
        value: { matchId: String(match.id), home: match.home || "", away: match.away || "", updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      });

      const resetPayload = {
        home_score: 0,
        away_score: 0,
        events: [],
        played: false,
        live: false,
        timer_running: false,
        timer_started_at: null,
        elapsed_seconds: 0,
        match_phase: "waiting",
      };

      await supabase.from("fixtures").update(resetPayload).eq("id", match.id);

      // Eski bir duplicate fixture satırı aynı maçı live tutuyorsa onu da söndür.
      // Tarih/saat mevcutsa eşleşmeyi daralt; yoksa takım çifti yeterlidir.
      let duplicateReset = supabase
        .from("fixtures")
        .update(resetPayload)
        .eq("home", match.home)
        .eq("away", match.away);
      if (match.date) duplicateReset = duplicateReset.eq("date", match.date);
      if (match.time) duplicateReset = duplicateReset.eq("time", match.time);
      await duplicateReset;

      for (const stateId of ["fixture_runtime", "completed_fixture_results"]) {
        const { data } = await supabase.from("app_state").select("value").eq("id", stateId).maybeSingle();
        const value = data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? { ...data.value } : {};
        delete value[String(match.id)];
        await supabase.from("app_state").upsert({ id: stateId, value, updated_at: new Date().toISOString() });
      }

      await supabase.from("app_state").upsert({
        id: "public_match_center",
        value: { matchId: "", home: "", away: "", updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      });

      await supabase.from("app_state").upsert({
        id: "fixtures_snapshot",
        value: { fixtures: updatedFixtures.filter((m) => m?.isKnockout !== true), updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Maç yeniden açma bulut eşitleme hatası:", error);
    }

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
                      {event.playerName || event.name} • {event.team}
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
