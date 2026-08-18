import React, { useState, useMemo } from "react";

export default function DailySchedule({ fixtures = [], settings = {} }) {
  const availableDates = useMemo(() => {
    const dates = fixtures
      .map((m) => m.date)
      .filter((date) => date && date.trim() !== "");
    return [...new Set(dates)];
  }, [fixtures]);

  const [selectedDate, setSelectedDate] = useState(
    availableDates[0] || new Date().toISOString().split("T")[0]
  );

  const dayMatches = useMemo(() => {
    return fixtures.filter((m) => m.date === selectedDate);
  }, [fixtures, selectedDate]);

  const buildWhatsAppText = () => {
    let text = `🏆 *${settings.tournamentName || "S&S CUP"} - GÜNLÜK MAÇ PROGRAMI*\n`;
    text += `🗓 *Tarih:* ${selectedDate}\n`;
    text += `📍 *Tesis:* ${settings.venue || "Halı Saha"}\n`;
    text += `-----------------------------------\n\n`;

    if (dayMatches.length === 0) {
      text += `Bu tarihte planlanmış maç bulunmuyor.\n`;
    } else {
      dayMatches.forEach((m) => {
        text += `⏰ *${m.time || "--:--"}* | ${m.home} vs ${m.away} (${m.field || "Saha 1"})\n`;
      });
    }

    text += `\n📌 *Saha sorumlularının maç saatinden 15 dk önce sahada hazır bulunması rica olunur.*`;
    return text;
  };

  const shareDirectToWhatsApp = () => {
    const text = buildWhatsAppText();
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.controls}>
        <div style={styles.dateSelector}>
          <label style={styles.label}>🗓️ Tarih Seçin:</label>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={styles.select}
          >
            {availableDates.length === 0 && (
              <option value={selectedDate}>{selectedDate}</option>
            )}
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </div>

        <button onClick={shareDirectToWhatsApp} style={styles.whatsappBtn}>
          📲 WhatsApp'ta Doğrudan Paylaş
        </button>
      </div>

      <div style={styles.cardContainer}>
        <div style={styles.header}>
          <div style={styles.badge}>S&S CUP SAHA GÖREVLİ LİSTESİ</div>
          <h2 style={styles.title}>📅 GÜNLÜK MAÇ PROGRAMI</h2>
          <div style={styles.metaRow}>
            <span>🗓️ <strong>Tarih:</strong> {selectedDate}</span>
            <span>📍 <strong>Tesis:</strong> {settings.venue || "Halı Saha Tesisleri"}</span>
          </div>
        </div>

        {dayMatches.length === 0 ? (
          <div style={styles.empty}>Bu tarihe ait tanımlanmış maç bulunamadı.</div>
        ) : (
          <div style={styles.matchList}>
            {dayMatches.map((match, idx) => (
              <div key={match.id || idx} style={styles.matchItem}>
                <div style={styles.timeCol}>
                  <span style={styles.time}>{match.time || "--:--"}</span>
                  <span style={styles.field}>{match.field || "Halı Saha"}</span>
                </div>

                <div style={styles.teamsCol}>
                  <span style={styles.teamHome}>{match.home}</span>
                  <span style={styles.vs}>VS</span>
                  <span style={styles.teamAway}>{match.away}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={styles.footer}>
          <span>⚠️ Saha sorumlularının maçlardan 15 dk önce sahada olması zorunludur.</span>
          <small>S&S CUP Turnuva Yönetimi</small>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    maxWidth: "600px",
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  controls: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    backgroundColor: "#0f172a",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid #1e293b",
    flexWrap: "wrap",
  },
  dateSelector: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  label: {
    fontSize: "13px",
    color: "#94a3b8",
    fontWeight: "bold",
  },
  select: {
    backgroundColor: "#020617",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: "bold",
  },
  whatsappBtn: {
    backgroundColor: "#25D366",
    color: "#000000",
    border: "none",
    padding: "10px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "900",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  cardContainer: {
    backgroundColor: "#020617",
    border: "2px solid #10b981",
    borderRadius: "20px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
    background: "linear-gradient(180deg, #020617 0%, #0f172a 100%)",
  },
  header: {
    borderBottom: "1px dashed #334155",
    paddingBottom: "16px",
    marginBottom: "16px",
    textAlign: "center",
  },
  badge: {
    display: "inline-block",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    color: "#34d399",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    fontSize: "10px",
    fontWeight: "900",
    padding: "4px 12px",
    borderRadius: "20px",
    letterSpacing: "1px",
    marginBottom: "8px",
  },
  title: {
    margin: "0 0 10px 0",
    fontSize: "22px",
    fontWeight: "900",
    color: "#ffffff",
  },
  metaRow: {
    display: "flex",
    justifyContent: "center",
    gap: "16px",
    fontSize: "12px",
    color: "#94a3b8",
  },
  matchList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  matchItem: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "12px",
    padding: "12px 16px",
  },
  timeCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderRight: "1px solid #334155",
    paddingRight: "14px",
    minWidth: "65px",
  },
  time: {
    fontSize: "15px",
    fontWeight: "900",
    color: "#34d399",
  },
  field: {
    fontSize: "10px",
    color: "#64748b",
  },
  teamsCol: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
    paddingLeft: "14px",
  },
  teamHome: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#f8fafc",
    width: "40%",
    textAlign: "right",
  },
  teamAway: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#f8fafc",
    width: "40%",
    textAlign: "left",
  },
  vs: {
    fontSize: "10px",
    fontWeight: "900",
    backgroundColor: "#1e293b",
    color: "#94a3b8",
    padding: "3px 6px",
    borderRadius: "4px",
  },
  empty: {
    textAlign: "center",
    color: "#64748b",
    padding: "20px",
    fontSize: "13px",
  },
  footer: {
    marginTop: "20px",
    paddingTop: "12px",
    borderTop: "1px dashed #334155",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    color: "#f59e0b",
    textAlign: "center",
  },
};