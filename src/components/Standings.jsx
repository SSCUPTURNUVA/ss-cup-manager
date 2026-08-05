import { useMemo, useState } from "react";

function safeNumber(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 6 KADEMELİ EŞİTLİK BOZMA TÜZÜĞÜ (TIE-BREAKING LOGIC)
 * 1. Puan
 * 2. Averaj (Atılan Gol - Yenilen Gol)
 * 3. Atılan Gol Sayısı
 * 4. İkili Averaj (Aralarındaki Maç)
 * 5. Toplam Galibiyet Sayısı
 * 6. Fair-Play Puanı (Sarı: -1, Kırmızı: -3)
 * 7. Alfabetik Sıralama (Kura Mantığı)
 */
function computeAndSortStandings(teams = [], fixtures = []) {
  const table = {};

  // Tüm takımları sıfır verilerle başlat
  teams.forEach((t) => {
    const teamName = typeof t === "string" ? t : t?.name || t?.teamName;
    if (!teamName) return;

    table[teamName] = {
      team: teamName,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      yellowCards: 0,
      redCards: 0,
      fairPlayScore: 0,
      h2h: {}, // İkili averaj takibi
    };
  });

  // Tamamlanan lig maçlarını işle
  (fixtures || []).forEach((match) => {
    // Sadece lig ve oynanmış maçları hesaba kat (Knockout/Eleme maçları puan durumunu etkilemez)
    if (match?.played !== true || match?.isKnockout === true) return;

    const home = match.home;
    const away = match.away;

    if (!home || !away) return;

    if (!table[home]) {
      table[home] = {
        team: home,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        yellowCards: 0,
        redCards: 0,
        fairPlayScore: 0,
        h2h: {},
      };
    }

    if (!table[away]) {
      table[away] = {
        team: away,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        yellowCards: 0,
        redCards: 0,
        fairPlayScore: 0,
        h2h: {},
      };
    }

    const hScore = safeNumber(match.homeScore);
    const aScore = safeNumber(match.awayScore);

    table[home].played += 1;
    table[away].played += 1;
    table[home].goalsFor += hScore;
    table[home].goalsAgainst += aScore;
    table[away].goalsFor += aScore;
    table[away].goalsAgainst += hScore;

    if (!table[home].h2h[away]) table[home].h2h[away] = { points: 0, gd: 0, gf: 0 };
    if (!table[away].h2h[home]) table[away].h2h[home] = { points: 0, gd: 0, gf: 0 };

    if (hScore > aScore) {
      table[home].wins += 1;
      table[home].points += 3;
      table[away].losses += 1;

      table[home].h2h[away].points += 3;
      table[home].h2h[away].gd += hScore - aScore;
      table[home].h2h[away].gf += hScore;

      table[away].h2h[home].gd += aScore - hScore;
      table[away].h2h[home].gf += aScore;
    } else if (aScore > hScore) {
      table[away].wins += 1;
      table[away].points += 3;
      table[home].losses += 1;

      table[away].h2h[home].points += 3;
      table[away].h2h[home].gd += aScore - hScore;
      table[away].h2h[home].gf += aScore;

      table[home].h2h[away].gd += hScore - aScore;
      table[home].h2h[away].gf += hScore;
    } else {
      table[home].draws += 1;
      table[home].points += 1;
      table[away].draws += 1;
      table[away].points += 1;

      table[home].h2h[away].points += 1;
      table[away].h2h[home].points += 1;
    }

    // Kart İstatistiklerini İşle (Fair-Play Sıralaması İçin)
    const events = Array.isArray(match.events) ? match.events : [];
    events.forEach((ev) => {
      const evTeam = ev.team || ev.teamName;
      if (evTeam && table[evTeam]) {
        if (ev.type === "yellow_card" || ev.eventType === "yellow_card") {
          table[evTeam].yellowCards += 1;
        } else if (ev.type === "red_card" || ev.eventType === "red_card") {
          table[evTeam].redCards += 1;
        }
      }
    });
  });

  // Averaj ve Fair-Play Skorlarını Hesapla
  const result = Object.values(table).map((t) => {
    const gd = t.goalsFor - t.goalsAgainst;
    const fpScore = t.yellowCards * -1 + t.redCards * -3;
    return { ...t, goalDifference: gd, fairPlayScore: fpScore };
  });

  // Gelişmiş Tüzük Sıralaması
  result.sort((a, b) => {
    // 1. Puan
    if (b.points !== a.points) return b.points - a.points;

    // 2. Averaj (Genel Averaj)
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;

    // 3. Atılan Gol Sayısı
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    // 4. İkili Averaj (Kendi Aralarındaki Maç)
    const h2hA = a.h2h[b.team];
    const h2hB = b.h2h[a.team];
    if (h2hA && h2hB && h2hA.points !== h2hB.points) {
      return h2hB.points - h2hA.points;
    }

    // 5. Galibiyet Sayısı
    if (b.wins !== a.wins) return b.wins - a.wins;

    // 6. Fair-Play Puanı (Az kart gören üstte yer alır)
    if (b.fairPlayScore !== a.fairPlayScore) return b.fairPlayScore - a.fairPlayScore;

    // 7. Alfabetik (Kura Mantığı)
    return a.team.localeCompare(b.team, "tr");
  });

  return result;
}

export default function Standings({ teams = [], fixtures = [] }) {
  const [showRulesInfo, setShowRulesInfo] = useState(false);

  const standingsList = useMemo(() => {
    return computeAndSortStandings(teams, fixtures);
  }, [teams, fixtures]);

  return (
    <div className="page-stack standings-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">S&S CUP MANAGER PRO</span>
          <h2>📊 Puan Durumu</h2>
          <p>
            İlk 8 takım doğrudan <strong>Çeyrek Finale (Play-Off)</strong> kalır.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowRulesInfo(!showRulesInfo)}
        >
          {showRulesInfo ? "✖ Kuralları Gizle" : "ℹ️ Eşitlik Bozma Tüzüğü"}
        </button>
      </section>

      {/* TÜZÜK BİLGİLENDİRME KUTUSU */}
      {showRulesInfo && (
        <section
          className="panel-card"
          style={{
            background: "rgba(30, 41, 59, 0.9)",
            border: "1px solid #3b82f6",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "200px",
          }}
        >
          <h4 style={{ color: "#60a5fa", margin: "0 0 10px 0" }}>
            🏆 S&S Cup Eşitlik Bozma Kuralları
          </h4>
          <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", lineHeight: "1.6", color: "#cbd5e1" }}>
            <li><strong>Puan Eşitliği:</strong> En çok puana sahip takım üstte yer alır.</li>
            <li><strong>Genel Averaj:</strong> Atılan gol - Yenilen gol farkı yüksek olan avantaj sağlar.</li>
            <li><strong>Atılan Gol Sayısı:</strong> Daha fazla gol atan takım öncelik kazanır.</li>
            <li><strong>İkili Averaj:</strong> Eşit takımlar birbiriyle oynadıysa galip gelen öne geçer.</li>
            <li><strong>Galibiyet Sayısı:</strong> Toplamda daha çok galibiyeti olan üstte yer alır.</li>
            <li><strong>Fair-Play Puanı:</strong> En az kart gören takım üstte yer alır (🟨 -1, 🟥 -3).</li>
          </ol>
        </section>
      )}

      <section className="panel-card" style={{ overflowX: "auto" }}>
        {standingsList.length > 0 ? (
          <table className="standings-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #334155", textAlign: "left", opacity: 0.8, fontSize: "13px" }}>
                <th style={{ padding: "12px 8px", width: "50px" }}>Sıra</th>
                <th style={{ padding: "12px 8px" }}>Takım</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>OM</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>G</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>B</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>M</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>AG</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>YG</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>AV</th>
                <th style={{ padding: "12px 8px", textAlign: "center" }}>Disiplin</th>
                <th style={{ padding: "12px 8px", textAlign: "center", fontWeight: "bold", color: "#60a5fa" }}>Puan</th>
              </tr>
            </thead>
            <tbody>
              {standingsList.map((row, index) => {
                const isTopEight = index < 8; // İlk 8 takım Çeyrek Finale çıkar
                const isEighth = index === 7; // 8. takım çizgisi

                return (
                  <tr
                    key={row.team}
                    style={{
                      borderBottom: isEighth ? "3px solid #22c55e" : "1px solid #1e293b",
                      backgroundColor: isTopEight ? "rgba(34, 197, 94, 0.05)" : "transparent",
                      transition: "background-color 0.2s",
                    }}
                  >
                    <td style={{ padding: "12px 8px", fontWeight: "bold" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: "26px",
                          height: "26px",
                          borderRadius: "50%",
                          textAlign: "center",
                          lineHeight: "26px",
                          fontSize: "12px",
                          backgroundColor: isTopEight ? "#22c55e" : "#334155",
                          color: "white",
                        }}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: "600" }}>
                      {row.team}
                      {isTopEight && (
                        <span style={{ marginLeft: "8px", fontSize: "11px", color: "#4ade80", fontWeight: "normal" }}>
                          (Çeyrek Final)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>{row.played}</td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>{row.wins}</td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>{row.draws}</td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>{row.losses}</td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>{row.goalsFor}</td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>{row.goalsAgainst}</td>
                    <td
                      style={{
                        padding: "12px 8px",
                        textAlign: "center",
                        fontWeight: "500",
                        color: row.goalDifference > 0 ? "#4ade80" : row.goalDifference < 0 ? "#f87171" : "inherit",
                      }}
                    >
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center", fontSize: "12px" }}>
                      🟨 {row.yellowCards} | 🟥 {row.redCards}
                    </td>
                    <td
                      style={{
                        padding: "12px 8px",
                        textAlign: "center",
                        fontWeight: "bold",
                        fontSize: "16px",
                        color: "#60a5fa",
                      }}
                    >
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="empty-message">Puan durumu için henüz kayıtlı takım veya maç bulunmuyor.</p>
        )}
      </section>
    </div>
  );
}