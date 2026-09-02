import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

function getMatchEvents(match) {
  return Array.isArray(match?.events) ? match.events : [];
}

export default function DisciplineBoard({ fixtures = [], teams = [] }) {
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [cloudEventFixtures, setCloudEventFixtures] = useState([]);

  // Disiplin Kurulu yalnız bu cihazdaki React state'ine bağlı kalmasın.
  // Kart başka bir yönetim cihazından girilse bile fixtures_snapshot/knockout
  // üzerinden anında gelir; F5 ya da sayfa değiştirip geri dönmek gerekmez.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function refreshCloudEvents() {
      if (inFlight) return;
      inFlight = true;
      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("id,value,updated_at")
          .in("id", ["fixtures_snapshot", "knockout"]);
        if (error) throw error;
        if (cancelled) return;

        const rows = Array.isArray(data) ? data : [];
        const snapshot = rows.find((row) => row?.id === "fixtures_snapshot")?.value;
        const knockout = rows.find((row) => row?.id === "knockout")?.value;
        const knockoutMatches = knockout && typeof knockout === "object"
          ? [
              ...(Array.isArray(knockout.quarter) ? knockout.quarter : []),
              ...(Array.isArray(knockout.semi) ? knockout.semi : []),
              ...(knockout.finalMatch ? [knockout.finalMatch] : []),
              ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
            ]
          : [];

        setCloudEventFixtures([
          ...(Array.isArray(snapshot) ? snapshot : []),
          ...knockoutMatches,
        ]);
      } catch (error) {
        console.error("Disiplin kart senkron hatası:", error);
      } finally {
        inFlight = false;
      }
    }

    refreshCloudEvents();
    const poll = window.setInterval(refreshCloudEvents, 1200);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshCloudEvents();
    };
    window.addEventListener("focus", refreshCloudEvents);
    document.addEventListener("visibilitychange", onVisible);

    const channel = supabase
      .channel(`sscup-discipline-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state" },
        (payload) => {
          const id = payload?.new?.id || payload?.old?.id;
          if (id === "fixtures_snapshot" || id === "knockout") refreshCloudEvents();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshCloudEvents);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  const eventFixtures = useMemo(() => {
    const byKey = new Map();
    const mergeMatch = (match, sourceIndex = 0) => {
      if (!match) return;
      const key = String(match.id || match.knockoutKey || `${match.home || ""}-${match.away || ""}-${match.date || ""}-${match.time || ""}-${sourceIndex}`);
      const existing = byKey.get(key) || { ...match, events: [], deletedEventIds: [] };
      const deletedEventIds = [...new Set([
        ...(Array.isArray(existing.deletedEventIds) ? existing.deletedEventIds.map(String) : []),
        ...(Array.isArray(match.deletedEventIds) ? match.deletedEventIds.map(String) : []),
      ])];
      const deletedSet = new Set(deletedEventIds);
      const eventMap = new Map();
      [...(Array.isArray(existing.events) ? existing.events : []), ...(Array.isArray(match.events) ? match.events : [])]
        .forEach((event, index) => {
          const eventKey = String(event?.id || event?.actionId || `${event?.type || event?.eventType || "event"}-${event?.team || event?.teamName || ""}-${event?.playerId || event?.playerName || event?.player || ""}-${event?.minute ?? ""}-${index}`);
          if (deletedSet.has(String(event?.id ?? ""))) return;
          eventMap.set(eventKey, event);
        });
      byKey.set(key, { ...existing, ...match, deletedEventIds, events: Array.from(eventMap.values()) });
    };

    (fixtures || []).forEach((match, index) => mergeMatch(match, index));
    (cloudEventFixtures || []).forEach((match, index) => mergeMatch(match, index));
    return Array.from(byKey.values());
  }, [fixtures, cloudEventFixtures]);

  // Bütün maçlardaki kartları oyuncu bazında topla
  const disciplinaryData = useMemo(() => {
    const playerStats = {};

    (eventFixtures || []).forEach((match) => {
      const events = getMatchEvents(match);

      events.forEach((ev) => {
        const isYellow =
          ev.type === "yellow_card" || ev.eventType === "yellow_card";
        const isRed =
          ev.type === "red_card" || ev.eventType === "red_card";

        if (!isYellow && !isRed) return;

        const team = ev.team || ev.teamName || "Bilinmeyen Takım";
        const playerName = ev.playerName || ev.player || ev.name || "Oyuncu";
        const shirtNumber = ev.shirtNumber || "";
        const playerId =
          ev.playerId || `${team}-${playerName}`;

        const key = `${team}___${playerId}`;

        if (!playerStats[key]) {
          playerStats[key] = {
            id: key,
            playerId,
            playerName,
            team,
            shirtNumber,
            yellowCards: 0,
            redCards: 0,
          };
        }

        if (isYellow) {
          playerStats[key].yellowCards += 1;
        }

        if (isRed) {
          playerStats[key].redCards += 1;
        }
      });
    });

    return Object.values(playerStats);
  }, [eventFixtures]);

  // Takım listesini ayıkla
  const teamList = useMemo(() => {
    const set = new Set();
    disciplinaryData.forEach((item) => set.add(item.team));
    (teams || []).forEach((t) => {
      const name = typeof t === "string" ? t : t?.name || t?.teamName;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [disciplinaryData, teams]);

  // Filtrelenmiş veri
  const filteredData = useMemo(() => {
    return disciplinaryData.filter((item) => {
      const matchesTeam =
        selectedTeam === "all" || item.team === selectedTeam;
      const matchesSearch =
        item.playerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.team.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesTeam && matchesSearch;
    });
  }, [disciplinaryData, selectedTeam, searchTerm]);

  // Özet İstatistikler
  const totalYellows = disciplinaryData.reduce((acc, i) => acc + i.yellowCards, 0);
  const totalReds = disciplinaryData.reduce((acc, i) => acc + i.redCards, 0);
  const suspendedCount = disciplinaryData.filter((i) => i.redCards > 0).length;

  return (
    <div className="page-stack discipline-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">S&S CUP MANAGER PRO</span>
          <h2>🛡️ Disiplin & Kart Takip Paneli</h2>
          <p>
            Takım sorumlularına gösterilebilecek canlı oyuncu kart ve ceza raporu.
          </p>
        </div>
      </section>

      {/* İSTATİSTİK ÖZETİ */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "15px",
          marginBottom: "20px",
        }}
      >
        <div className="panel-card" style={{ textAlign: "center", borderLeft: "4px solid #facc15" }}>
          <small style={{ color: "#94a3b8", fontWeight: "bold" }}>TOPLAM SARI KART</small>
          <h2 style={{ color: "#facc15", margin: "5px 0 0 0", fontSize: "28px" }}>🟨 {totalYellows}</h2>
        </div>

        <div className="panel-card" style={{ textAlign: "center", borderLeft: "4px solid #ef4444" }}>
          <small style={{ color: "#94a3b8", fontWeight: "bold" }}>TOPLAM KIRMIZI KART</small>
          <h2 style={{ color: "#ef4444", margin: "5px 0 0 0", fontSize: "28px" }}>🟥 {totalReds}</h2>
        </div>

        <div className="panel-card" style={{ textAlign: "center", borderLeft: "4px solid #dc2626" }}>
          <small style={{ color: "#94a3b8", fontWeight: "bold" }}>CEZALI OYUNCU SAYISI</small>
          <h2 style={{ color: "#f87171", margin: "5px 0 0 0", fontSize: "28px" }}>🔴 {suspendedCount}</h2>
        </div>
      </section>

      {/* FİLTRELEME VE ARAMA SÜTUNU */}
      <section className="panel-card" style={{ marginBottom: "20px", padding: "16px" }}>
        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px", fontWeight: "bold" }}>
              TAKIM FİLTRESİ
            </label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                background: "#1e293b",
                color: "white",
                border: "1px solid #334155",
              }}
            >
              <option value="all">Tüm Takımlar ({teamList.length})</option>
              {teamList.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "2 1 250px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px", fontWeight: "bold" }}>
              OYUNCU VEYA TAKIM ARA
            </label>
            <input
              type="text"
              placeholder="Oyuncu adı yazarak hızlıca sorgulayın..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                background: "#1e293b",
                color: "white",
                border: "1px solid #334155",
              }}
            />
          </div>
        </div>
      </section>

      {/* KART TABLOSU */}
      <section className="panel-card" style={{ overflowX: "auto" }}>
        {filteredData.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #334155", color: "#94a3b8", fontSize: "13px" }}>
                <th style={{ padding: "12px 8px" }}>Takım</th>
                <th style={{ padding: "12px 8px" }}>Oyuncu</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>Sarı Kart</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>Kırmızı Kart</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>Durum / Ceza</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row) => {
                const isSuspended = row.redCards > 0;

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid #1e293b",
                      backgroundColor: isSuspended ? "rgba(220, 38, 38, 0.1)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 8px", fontWeight: "bold", color: "#60a5fa" }}>
                      {row.team}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: "600" }}>
                      {row.shirtNumber ? `#${row.shirtNumber} ` : ""}
                      {row.playerName}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {row.yellowCards > 0 ? (
                        <span style={{ background: "#854d0e", color: "#fef08a", padding: "4px 10px", borderRadius: "6px", fontWeight: "bold" }}>
                          🟨 {row.yellowCards}
                        </span>
                      ) : (
                        <span style={{ opacity: 0.3 }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {row.redCards > 0 ? (
                        <span style={{ background: "#991b1b", color: "#fecaca", padding: "4px 10px", borderRadius: "6px", fontWeight: "bold" }}>
                          🟥 {row.redCards}
                        </span>
                      ) : (
                        <span style={{ opacity: 0.3 }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {isSuspended ? (
                        <span
                          style={{
                            background: "#dc2626",
                            color: "white",
                            padding: "6px 12px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            display: "inline-block",
                          }}
                        >
                          🔴 1 MAÇ CEZALI
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "#16a34a",
                            color: "white",
                            padding: "6px 12px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            display: "inline-block",
                          }}
                        >
                          🟢 OYNAYABİLİR
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="empty-message">Aramanıza veya seçilen takıma uygun kart kaydı bulunamadı.</p>
        )}
      </section>
    </div>
  );
}