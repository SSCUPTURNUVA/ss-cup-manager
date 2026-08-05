import { useEffect, useMemo, useState } from "react";

export default function DrawCeremony({
  teams,
  drawOrder,
  setDrawOrder,
}) {
  const [selectedTeam, setSelectedTeam] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [revealedTeam, setRevealedTeam] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setDrawOrder((currentOrder) =>
      currentOrder.filter((team) => teams.includes(team))
    );
  }, [teams, setDrawOrder]);

  const remainingTeams = useMemo(
    () => teams.filter((team) => !drawOrder.includes(team)),
    [teams, drawOrder]
  );

  const drawCompleted =
    teams.length > 0 && drawOrder.length === teams.length;

  const progress =
    teams.length > 0
      ? Math.round((drawOrder.length / teams.length) * 100)
      : 0;

  function saveOrder(updatedOrder) {
    setDrawOrder(updatedOrder);
    localStorage.setItem(
      "sscup-draw-order",
      JSON.stringify(updatedOrder)
    );
  }

  function commitTeam(team) {
    if (!team || drawOrder.includes(team)) return;

    const updatedOrder = [...drawOrder, team];
    saveOrder(updatedOrder);
    setSelectedTeam("");
    setRevealedTeam(team);

    if (updatedOrder.length === teams.length) {
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 5000);
    }
  }

  function addDrawnTeam() {
    if (!selectedTeam) {
      alert("Fanustan çıkan takımı seçiniz.");
      return;
    }

    commitTeam(selectedTeam);
  }

  function drawRandomTeam() {
    if (isDrawing || remainingTeams.length === 0) return;

    setIsDrawing(true);
    setRevealedTeam("");

    const interval = window.setInterval(() => {
      const preview =
        remainingTeams[
          Math.floor(Math.random() * remainingTeams.length)
        ];
      setRevealedTeam(preview);
    }, 90);

    window.setTimeout(() => {
      window.clearInterval(interval);

      const finalTeam =
        remainingTeams[
          Math.floor(Math.random() * remainingTeams.length)
        ];

      setRevealedTeam(finalTeam);
      setIsDrawing(false);

      window.setTimeout(() => {
        commitTeam(finalTeam);
      }, 650);
    }, 2200);
  }

  function undoLastDraw() {
    if (drawOrder.length === 0 || isDrawing) return;

    const lastTeam = drawOrder[drawOrder.length - 1];
    const confirmed = window.confirm(
      `${lastTeam} takımının kura seçimi geri alınsın mı?`
    );

    if (!confirmed) return;

    saveOrder(drawOrder.slice(0, -1));
    setSelectedTeam("");
    setRevealedTeam("");
    setShowConfetti(false);
  }

  function resetDraw() {
    if (drawOrder.length === 0 || isDrawing) return;

    const confirmed = window.confirm(
      "Fanus kura sırası tamamen sıfırlansın mı?"
    );

    if (!confirmed) return;

    saveOrder([]);
    setSelectedTeam("");
    setRevealedTeam("");
    setShowConfetti(false);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      alert("Tam ekran modu bu tarayıcıda açılamadı.");
    }
  }

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  return (
    <section className="draw-ceremony card">
      {showConfetti && (
        <div className="draw-confetti" aria-hidden="true">
          {Array.from({ length: 36 }).map((_, index) => (
            <span
              key={index}
              style={{
                "--i": index,
                "--x": `${(index * 37) % 100}%`,
                "--delay": `${(index % 12) * 0.08}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="draw-header">
        <div>
          <span className="eyebrow">S&S CUP MANAGER PRO DRAW</span>
          <h2>🎱 Premium Kura Töreni</h2>
          <p>
            Takımları otomatik çekebilir veya gerçek fanustan
            çıkan takımı manuel seçebilirsiniz.
          </p>
        </div>

        <button
          type="button"
          className="draw-fullscreen-button"
          onClick={toggleFullscreen}
        >
          {isFullscreen ? "🗗 Tam Ekrandan Çık" : "⛶ Tam Ekran"}
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="draw-empty">
          <span>👥</span>
          <h3>Takım bulunamadı</h3>
          <p>
            Önce Takımlar bölümünden turnuvaya katılacak
            takımları ekleyin.
          </p>
        </div>
      ) : (
        <>
          <div className="draw-progress-panel">
            <div className="draw-progress-text">
              <strong>
                {drawCompleted
                  ? "Kura tamamlandı"
                  : `${drawOrder.length + 1}. takım çekiliyor`}
              </strong>

              <span>
                {drawOrder.length} / {teams.length} takım • %{progress}
              </span>
            </div>

            <div className="draw-progress-track">
              <div
                className="draw-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="draw-stage">
            <div className={`draw-machine ${isDrawing ? "drawing" : ""}`}>
              <div className="draw-machine-glow" />

              <div className="draw-balls" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} className={`ball ball-${index + 1}`}>
                    ⚽
                  </span>
                ))}
              </div>

              <div className="draw-reveal">
                <small>
                  {isDrawing
                    ? "KURA ÇEKİLİYOR..."
                    : revealedTeam
                    ? "ÇEKİLEN TAKIM"
                    : "KURA HAZIR"}
                </small>

                <strong>
                  {revealedTeam ||
                    (drawCompleted
                      ? "TÜM TAKIMLAR ÇEKİLDİ"
                      : "BAŞLAT'A BAS")}
                </strong>
              </div>
            </div>

            <div className="draw-controls-panel">
              {!drawCompleted && (
                <>
                  <button
                    type="button"
                    className="draw-random-button"
                    onClick={drawRandomTeam}
                    disabled={isDrawing || remainingTeams.length === 0}
                  >
                    {isDrawing
                      ? "🎱 Kura Çekiliyor..."
                      : "🎲 Otomatik Takım Çek"}
                  </button>

                  <div className="draw-divider">
                    <span>VEYA MANUEL FANUS</span>
                  </div>

                  <div className="draw-manual-row">
                    <select
                      value={selectedTeam}
                      disabled={isDrawing}
                      onChange={(event) =>
                        setSelectedTeam(event.target.value)
                      }
                    >
                      <option value="">
                        Fanustan çıkan takımı seçiniz
                      </option>

                      {remainingTeams.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={addDrawnTeam}
                      disabled={isDrawing || !selectedTeam}
                    >
                      ✅ Sıraya Ekle
                    </button>
                  </div>
                </>
              )}

              <div className="draw-summary-cards">
                <div>
                  <span>✅</span>
                  <strong>{drawOrder.length}</strong>
                  <small>Çekilen</small>
                </div>

                <div>
                  <span>⌛</span>
                  <strong>{remainingTeams.length}</strong>
                  <small>Kalan</small>
                </div>
              </div>
            </div>
          </div>

          <div className="draw-list-panel">
            <div className="section-title">
              <h3>📋 Fanus Kura Sırası</h3>

              <div className="draw-list-actions">
                <button
                  type="button"
                  onClick={undoLastDraw}
                  disabled={drawOrder.length === 0 || isDrawing}
                >
                  ↩️ Geri Al
                </button>

                <button
                  type="button"
                  onClick={resetDraw}
                  disabled={drawOrder.length === 0 || isDrawing}
                >
                  🗑️ Sıfırla
                </button>
              </div>
            </div>

            {drawOrder.length === 0 ? (
              <p className="empty-message">
                Henüz fanustan takım çekilmedi.
              </p>
            ) : (
              <div className="draw-order-grid">
                {drawOrder.map((team, index) => (
                  <article
                    key={`${team}-${index}`}
                    className={
                      index === drawOrder.length - 1
                        ? "draw-order-card latest"
                        : "draw-order-card"
                    }
                  >
                    <span>{index + 1}</span>
                    <strong>{team}</strong>
                    {index === drawOrder.length - 1 && (
                      <small>SON ÇEKİLEN</small>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          {drawCompleted && (
            <div className="draw-completed-panel">
              <span>🏆</span>
              <div>
                <h3>Kura Tamamlandı!</h3>
                <p>
                  {teams.length} takımın tamamı kura sırasına
                  yerleştirildi. Artık lig fikstürünü
                  oluşturabilirsiniz.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}