import { useEffect, useState } from "react";

function createEmptySemi() {
  return Array.from({ length: 2 }, () => ({
    home: "",
    away: "",
    homeScore: "",
    awayScore: "",
    homePen: "",
    awayPen: "",
    date: "",
    time: "",
    field: "Saha 1",
  }));
}

function createEmptyFinal() {
  return {
    home: "",
    away: "",
    homeScore: "",
    awayScore: "",
    homePen: "",
    awayPen: "",
    date: "",
    time: "",
    field: "Saha 1",
  };
}

function safeReadStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export default function SemiFinals({
  fixtures = [],
  setFixtures,
  onOpenMatchCenter,
}) {
  const [quarterMatches] = useState(() =>
    safeReadStorage("sscup-quarter", [])
  );

  const [semi, setSemi] = useState(() =>
    safeReadStorage("sscup-semi", createEmptySemi())
  );

  const [finalMatch, setFinalMatch] = useState(() =>
    safeReadStorage("sscup-final", createEmptyFinal())
  );

  const [thirdPlace, setThirdPlace] = useState(() =>
    safeReadStorage("sscup-third-place", createEmptyFinal())
  );

  useEffect(() => {
    localStorage.setItem("sscup-semi", JSON.stringify(semi));
  }, [semi]);

  useEffect(() => {
    localStorage.setItem("sscup-final", JSON.stringify(finalMatch));
  }, [finalMatch]);

  useEffect(() => {
    localStorage.setItem("sscup-third-place", JSON.stringify(thirdPlace));
  }, [thirdPlace]);

  // Supabase'den veya ana fikstürden gelen canlı maç skorlarını senkronize etme
  useEffect(() => {
    const knockoutMatches = fixtures.filter(
      (match) => match?.isKnockout === true
    );

    if (knockoutMatches.length === 0) return;

    function syncMatch(currentMatch, storedMatch) {
      if (!storedMatch) return currentMatch;

      const nextMatch = {
        ...currentMatch,
        homeScore: storedMatch.homeScore ?? currentMatch.homeScore,
        awayScore: storedMatch.awayScore ?? currentMatch.awayScore,
        homePen: storedMatch.homePen ?? currentMatch.homePen,
        awayPen: storedMatch.awayPen ?? currentMatch.awayPen,
        date: storedMatch.date ?? currentMatch.date,
        time: storedMatch.time ?? currentMatch.time,
        field: storedMatch.field ?? storedMatch.pitch ?? currentMatch.field,
      };

      return JSON.stringify(nextMatch) === JSON.stringify(currentMatch)
        ? currentMatch
        : nextMatch;
    }

    setSemi((current) =>
      current.map((match, index) =>
        syncMatch(
          match,
          knockoutMatches.find(
            (item) => item.knockoutKey === `semi-${index}`
          )
        )
      )
    );

    setFinalMatch((current) =>
      syncMatch(
        current,
        knockoutMatches.find(
          (item) => item.knockoutKey === "final-0"
        )
      )
    );

    setThirdPlace((current) =>
      syncMatch(
        current,
        knockoutMatches.find(
          (item) => item.knockoutKey === "third-place-0"
        )
      )
    );
  }, [fixtures]);

  // Çeyrek final kazananlarını yarı finale yerleştirme
  function getQuarterWinner(index) {
    const match = quarterMatches[index];
    if (!match || !match.home || !match.away) return "";

    const home = Number(match.homeScore);
    const away = Number(match.awayScore);

    if (match.homeScore === "" || match.awayScore === "" || Number.isNaN(home) || Number.isNaN(away)) {
      return "";
    }

    if (home > away) return match.home;
    if (away > home) return match.away;

    // Beraberlik durumunda penaltılar
    const homePen = Number(match.homePen);
    const awayPen = Number(match.awayPen);

    if (match.homePen === "" || match.awayPen === "" || Number.isNaN(homePen) || Number.isNaN(awayPen)) {
      return "";
    }

    if (homePen > awayPen) return match.home;
    if (awayPen > homePen) return match.away;

    return "";
  }

  // Yarı final kaybedenlerini bulma (3. lük maçı için)
  function getSemiLoser(index) {
    const match = semi[index];
    if (!match || !match.home || !match.away) return "";

    const home = Number(match.homeScore);
    const away = Number(match.awayScore);

    if (match.homeScore === "" || match.awayScore === "" || Number.isNaN(home) || Number.isNaN(away)) {
      return "";
    }

    if (home < away) return match.home;
    if (away < home) return match.away;

    const homePen = Number(match.homePen);
    const awayPen = Number(match.awayPen);

    if (match.homePen === "" || match.awayPen === "" || Number.isNaN(homePen) || Number.isNaN(awayPen)) {
      return "";
    }

    if (homePen < awayPen) return match.home;
    if (awayPen < homePen) return match.away;

    return "";
  }

  // Yarı final kazananlarını bulma (Final maçı için)
  function getSemiWinner(index) {
    const match = semi[index];
    if (!match || !match.home || !match.away) return "";

    const home = Number(match.homeScore);
    const away = Number(match.awayScore);

    if (match.homeScore === "" || match.awayScore === "" || Number.isNaN(home) || Number.isNaN(away)) {
      return "";
    }

    if (home > away) return match.home;
    if (away > home) return match.away;

    const homePen = Number(match.homePen);
    const awayPen = Number(match.awayPen);

    if (match.homePen === "" || match.awayPen === "" || Number.isNaN(homePen) || Number.isNaN(awayPen)) {
      return "";
    }

    if (homePen > awayPen) return match.home;
    if (awayPen > homePen) return match.away;

    return "";
  }

  function updateSemi(index, field, value) {
    setSemi((current) =>
      current.map((match, matchIndex) =>
        matchIndex === index ? { ...match, [field]: value } : match
      )
    );
  }

  function updateFinal(field, value) {
    setFinalMatch((current) => ({ ...current, [field]: value }));
  }

  function updateThirdPlace(field, value) {
    setThirdPlace((current) => ({ ...current, [field]: value }));
  }

  // Otomatik takımları yerleştir
  function autoFillSemiTeams() {
    const q0Winner = getQuarterWinner(0);
    const q1Winner = getQuarterWinner(1);
    const q2Winner = getQuarterWinner(2);
    const q3Winner = getQuarterWinner(3);

    if (!q0Winner || !q1Winner || !q2Winner || !q3Winner) {
      alert("Yarı final takımlarının belli olması için tüm çeyrek final maçlarının sonuçları girilmelidir.");
      return;
    }

    setSemi([
      { ...semi[0], home: q0Winner, away: q1Winner },
      { ...semi[1], home: q2Winner, away: q3Winner },
    ]);

    alert("Yarı final eşleşmeleri otomatik olarak yerleştirildi.");
  }

  function autoFillFinalTeams() {
    const s0Winner = getSemiWinner(0);
    const s1Winner = getSemiWinner(1);
    const s0Loser = getSemiLoser(0);
    const s1Loser = getSemiLoser(1);

    if (!s0Winner || !s1Winner) {
      alert("Final maçları için önce yarı final sonuçları girilmelidir.");
      return;
    }

    setFinalMatch((current) => ({
      ...current,
      home: s0Winner,
      away: s1Winner,
    }));

    if (s0Loser && s1Loser) {
      setThirdPlace((current) => ({
        ...current,
        home: s0Loser,
        away: s1Loser,
      }));
    }

    alert("Final ve 3. lük maçı eşleşmeleri güncellendi.");
  }

  function isDraw(match) {
    const home = Number(match.homeScore);
    const away = Number(match.awayScore);

    return (
      match.homeScore !== "" &&
      match.awayScore !== "" &&
      !Number.isNaN(home) &&
      !Number.isNaN(away) &&
      home === away
    );
  }

  // Maç merkezine gönderme (Bigint uyumlu güvenli sayısal ID yapısıyla)
  function startKnockoutMatch({ key, stageLabel, home, away, match }) {
    if (!home || !away) {
      alert("Bu maçın takımları henüz belli değil.");
      return;
    }

    if (typeof setFixtures !== "function") {
      alert("App.jsx bağlantısı bulunamadı.");
      return;
    }

    const anotherLiveMatch = fixtures.find(
      (item) => item.live === true && item.knockoutKey !== key
    );

    if (anotherLiveMatch) {
      alert(`${anotherLiveMatch.home} - ${anotherLiveMatch.away} maçı hâlâ canlı. Önce o maçı bitirin.`);
      return;
    }

    const existingIndex = fixtures.findIndex((item) => item.knockoutKey === key);

    const numericId = existingIndex >= 0 && typeof Number(fixtures[existingIndex].id) === "number" && !Number.isNaN(Number(fixtures[existingIndex].id))
      ? Number(fixtures[existingIndex].id) 
      : Date.now() + Math.floor(Math.random() * 1000);

    const baseMatch = {
      id: numericId,
      knockoutKey: key,
      isKnockout: true,
      stageLabel,
      home,
      away,
      homeScore: Number(match.homeScore || 0),
      awayScore: Number(match.awayScore || 0),
      homePen: match.homePen || "",
      awayPen: match.awayPen || "",
      date: match.date || "",
      time: match.time || "",
      field: match.field || "Saha 1",
      pitch: match.field || "Saha 1",
      played: false,
      live: true,
      timerRunning: false,
      timerStartedAt: null,
      elapsedSeconds: 0,
      events: [],
    };

    let updatedFixtures;

    if (existingIndex >= 0) {
      const existing = fixtures[existingIndex];
      const restart = existing.played === true
        ? window.confirm("Bu maç daha önce tamamlanmış. Maç Merkezi'nde yeniden açmak istiyor musunuz?")
        : true;

      if (!restart) return;

      updatedFixtures = fixtures.map((item, index) =>
        index === existingIndex
          ? {
              ...existing,
              ...baseMatch,
              events: existing.played === true ? [] : existing.events || [],
              homeScore: existing.played === true ? 0 : Number(existing.homeScore || 0),
              awayScore: existing.played === true ? 0 : Number(existing.awayScore || 0),
            }
          : item
      );
    } else {
      updatedFixtures = [...fixtures, baseMatch];
    }

    setFixtures(updatedFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));

    window.dispatchEvent(
      new CustomEvent("sscup-fixtures-updated", {
        detail: updatedFixtures,
      })
    );

    if (typeof onOpenMatchCenter === "function") {
      onOpenMatchCenter();
    }
  }

  return (
    <div className="card" style={{ marginTop: "25px" }}>
      <h2>⚡ Yarı Final ve Finaller</h2>

      {/* YARI FİNAL BÖLÜMÜ */}
      <div style={{ marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>🔥 Yarı Final Maçları</h3>
          <button type="button" onClick={autoFillSemiTeams}>
            📥 Çeyrek Finalden Takımları Al
          </button>
        </div>

        {semi.map((match, index) => {
          const qWinnerA = getQuarterWinner(index * 2);
          const qWinnerB = getQuarterWinner(index * 2 + 1);
          const defaultHome = match.home || qWinnerA || "";
          const defaultAway = match.away || qWinnerB || "";

          return (
            <div
              key={index}
              style={{
                padding: "16px",
                marginBottom: "15px",
                borderRadius: "12px",
                background: "#f8f9fa",
                border: "1px solid #ddd",
              }}
            >
              <h4>Yarı Final {index + 1}</h4>
              <p>
                <b>{defaultHome || "Belli Değil"}</b> vs <b>{defaultAway || "Belli Değil"}</b>
              </p>

              {defaultHome && defaultAway && (
                <>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", margin: "10px 0" }}>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ev Sahibi"
                      value={match.homeScore}
                      onChange={(e) => updateSemi(index, "homeScore", e.target.value)}
                    />
                    <span>-</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Deplasman"
                      value={match.awayScore}
                      onChange={(e) => updateSemi(index, "awayScore", e.target.value)}
                    />
                  </div>

                  {isDraw(match) && (
                    <div style={{ background: "#fff3cd", padding: "10px", borderRadius: "8px", margin: "10px 0" }}>
                      <b>Penaltılar:</b>
                      <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                        <input
                          type="number"
                          min="0"
                          placeholder="Pen 1"
                          value={match.homePen}
                          onChange={(e) => updateSemi(index, "homePen", e.target.value)}
                        />
                        <span>-</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Pen 2"
                          value={match.awayPen}
                          onChange={(e) => updateSemi(index, "awayPen", e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      startKnockoutMatch({
                        key: `semi-${index}`,
                        stageLabel: `Yarı Final ${index + 1}`,
                        home: defaultHome,
                        away: defaultAway,
                        match: { ...match, home: defaultHome, away: defaultAway },
                      })
                    }
                  >
                    🚀 Maç Merkezinde Başlat / Yönet
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <hr style={{ margin: "30px 0" }} />

      {/* FİNAL VE 3.LÜK MAÇI BÖLÜMÜ */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>👑 Büyük Final ve 3. lük Maçı</h3>
          <button type="button" onClick={autoFillFinalTeams}>
            📥 Yarı Finalden Takımları Al
          </button>
        </div>

        {/* 3.LÜK MAÇI */}
        <div
          style={{
            padding: "16px",
            marginBottom: "20px",
            borderRadius: "12px",
            background: "#fff8dc",
            border: "1px solid #e6dbb9",
          }}
        >
          <h4>🥉 3. lük Maçı</h4>
          <p>
            <b>{thirdPlace.home || "Belli Değil"}</b> vs <b>{thirdPlace.away || "Belli Değil"}</b>
          </p>

          {thirdPlace.home && thirdPlace.away && (
            <>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", margin: "10px 0" }}>
                <input
                  type="number"
                  min="0"
                  placeholder="Ev Sahibi"
                  value={thirdPlace.homeScore}
                  onChange={(e) => updateThirdPlace("homeScore", e.target.value)}
                />
                <span>-</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Deplasman"
                  value={thirdPlace.awayScore}
                  onChange={(e) => updateThirdPlace("awayScore", e.target.value)}
                />
              </div>

              {isDraw(thirdPlace) && (
                <div style={{ background: "#fff3cd", padding: "10px", borderRadius: "8px", margin: "10px 0" }}>
                  <b>Penaltılar:</b>
                  <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                    <input
                      type="number"
                      min="0"
                      placeholder="Pen 1"
                      value={thirdPlace.homePen}
                      onChange={(e) => updateThirdPlace("homePen", e.target.value)}
                    />
                    <span>-</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Pen 2"
                      value={thirdPlace.awayPen}
                      onChange={(e) => updateThirdPlace("awayPen", e.target.value)}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  startKnockoutMatch({
                    key: "third-place-0",
                    stageLabel: "3. lük Maçı",
                    home: thirdPlace.home,
                    away: thirdPlace.away,
                    match: thirdPlace,
                  })
                }
              >
                🚀 Maç Merkezinde Başlat / Yönet
              </button>
            </>
          )}
        </div>

        {/* FİNAL */}
        <div
          style={{
            padding: "20px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #1b1b1b, #333)",
            color: "white",
            border: "2px solid #d4af37",
          }}
        >
          <h4 style={{ color: "#d4af37", marginTop: 0 }}>🏆 ŞAMPİYONLUK FİNALİ</h4>
          <p style={{ fontSize: "18px" }}>
            <b>{finalMatch.home || "Belli Değil"}</b> vs <b>{finalMatch.away || "Belli Değil"}</b>
          </p>

          {finalMatch.home && finalMatch.away && (
            <>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", margin: "15px 0" }}>
                <input
                  type="number"
                  min="0"
                  placeholder="Ev Sahibi"
                  value={finalMatch.homeScore}
                  onChange={(e) => updateFinal("homeScore", e.target.value)}
                  style={{ padding: "8px", borderRadius: "6px" }}
                />
                <span style={{ fontSize: "20px" }}>-</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Deplasman"
                  value={finalMatch.awayScore}
                  onChange={(e) => updateFinal("awayScore", e.target.value)}
                  style={{ padding: "8px", borderRadius: "6px" }}
                />
              </div>

              {isDraw(finalMatch) && (
                <div style={{ background: "rgba(255,243,205,0.15)", padding: "12px", borderRadius: "8px", margin: "10px 0" }}>
                  <b>Penaltılar:</b>
                  <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                    <input
                      type="number"
                      min="0"
                      placeholder="Pen 1"
                      value={finalMatch.homePen}
                      onChange={(e) => updateFinal("homePen", e.target.value)}
                    />
                    <span>-</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Pen 2"
                      value={finalMatch.awayPen}
                      onChange={(e) => updateFinal("awayPen", e.target.value)}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                style={{ background: "#d4af37", color: "black", fontWeight: "bold" }}
                onClick={() =>
                  startKnockoutMatch({
                    key: "final-0",
                    stageLabel: "Şampiyonluk Finali",
                    home: finalMatch.home,
                    away: finalMatch.away,
                    match: finalMatch,
                  })
                }
              >
                🚀 Maç Merkezinde Başlat / Yönet
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}