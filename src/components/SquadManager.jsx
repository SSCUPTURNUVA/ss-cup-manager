import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";

const CLOUD_KEY = "squads";

export default function SquadManager({ teams = [] }) {
  const [squads, setSquads] = useState(() => {
    try {
      const saved = localStorage.getItem("sscup-squads");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [selectedTeam, setSelectedTeam] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [message, setMessage] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingNumber, setEditingNumber] = useState("");
  const [bulkRows, setBulkRows] = useState(() => Array.from({ length: 24 }, () => ({ shirtNumber: "", name: "" })));
  const localEditUntilRef = useRef(0);
  const cloudReadyRef = useRef(false);
  const applyingCloudRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("sscup-squads", JSON.stringify(squads));
  }, [squads]);

  useEffect(() => {
    let cancelled = false;

    async function loadCloudSquads() {
      const { data, error } = await supabase
        .from("app_state")
        .select("value,updated_at")
        .eq("id", CLOUD_KEY)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Kadro bulut yükleme hatası:", error);
        cloudReadyRef.current = true;
        return;
      }

      const cloudValue = data?.value;
      const hasCloudValue = cloudValue && typeof cloudValue === "object" && !Array.isArray(cloudValue);
      const localHasPlayers = Object.values(squads).some((list) => Array.isArray(list) && list.length > 0);

      if (hasCloudValue) {
        applyingCloudRef.current = true;
        setSquads(cloudValue);
        localStorage.setItem("sscup-squads", JSON.stringify(cloudValue));
        window.setTimeout(() => {
          applyingCloudRef.current = false;
          cloudReadyRef.current = true;
        }, 0);
      } else {
        cloudReadyRef.current = true;
        // İlk geçişte telefonda mevcut kadro varsa buluta güvenli şekilde tohumla.
        if (localHasPlayers) {
          await supabase.from("app_state").upsert({
            id: CLOUD_KEY,
            value: squads,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    loadCloudSquads();

    const channel = supabase
      .channel(`sscup-squads-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state", filter: `id=eq.${CLOUD_KEY}` },
        (payload) => {
          const value = payload?.new?.value;
          if (!value || typeof value !== "object" || Array.isArray(value)) return;
          if (Date.now() < localEditUntilRef.current) return;
          applyingCloudRef.current = true;
          setSquads(value);
          localStorage.setItem("sscup-squads", JSON.stringify(value));
          window.setTimeout(() => {
            applyingCloudRef.current = false;
            cloudReadyRef.current = true;
          }, 0);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // İlk açılış eşitlemesi yalnızca bir kez yapılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cloudReadyRef.current || applyingCloudRef.current) return;

    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from("app_state").upsert({
        id: CLOUD_KEY,
        value: squads,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("Kadro bulut kaydetme hatası:", error);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [squads]);

  useEffect(() => {
    if (selectedTeam && !teams.some((team) => getTeamName(team) === selectedTeam)) {
      setSelectedTeam("");
    }
  }, [teams, selectedTeam]);

  function getTeamName(team) {
    if (typeof team === "string") return team;
    return team?.name || team?.teamName || "";
  }

  const teamNames = useMemo(() => teams.map(getTeamName).filter(Boolean), [teams]);

  const selectedSquad = useMemo(() => {
    if (!selectedTeam) return [];
    return squads[selectedTeam] || [];
  }, [squads, selectedTeam]);

  function addPlayer(event) {
    event.preventDefault();
    const cleanName = playerName.trim();
    const cleanNumber = String(shirtNumber).trim();

    if (!selectedTeam) return setMessage("Önce bir takım seçmelisiniz.");
    if (!cleanName) return setMessage("Oyuncu adını yazmalısınız.");
    if (cleanNumber === "") return setMessage("Forma numarasını yazmalısınız.");

    const numericNumber = Number(cleanNumber);
    if (!Number.isInteger(numericNumber) || numericNumber < 0 || numericNumber > 99) {
      return setMessage("Forma numarası 0 ile 99 arasında olmalıdır.");
    }

    const currentSquad = squads[selectedTeam] || [];
    if (currentSquad.some((player) => Number(player.shirtNumber) === numericNumber)) {
      return setMessage(`${selectedTeam} takımında ${numericNumber} numaralı forma zaten kayıtlı.`);
    }
    if (currentSquad.some((player) => player.name.toLocaleLowerCase("tr-TR") === cleanName.toLocaleLowerCase("tr-TR"))) {
      return setMessage("Bu oyuncu aynı takımda zaten kayıtlı.");
    }

    const newPlayer = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name: cleanName,
      shirtNumber: numericNumber,
    };

    localEditUntilRef.current = Date.now() + 5000;
    setSquads((current) => ({
      ...current,
      [selectedTeam]: [...(current[selectedTeam] || []), newPlayer].sort((a, b) => Number(a.shirtNumber) - Number(b.shirtNumber)),
    }));
    setPlayerName("");
    setShirtNumber("");
    setMessage("Oyuncu kadroya eklendi ve cihazlar arasında eşitlenecek.");
  }

  function startEditPlayer(player) {
    setEditingPlayerId(player.id);
    setEditingName(player.name || "");
    setEditingNumber(String(player.shirtNumber ?? ""));
    setMessage("");
  }

  function cancelEditPlayer() {
    setEditingPlayerId(null);
    setEditingName("");
    setEditingNumber("");
  }

  function saveEditPlayer(playerId) {
    const cleanName = editingName.trim();
    const numericNumber = Number(String(editingNumber).trim());
    if (!cleanName) return setMessage("Oyuncu adı boş bırakılamaz.");
    if (!Number.isInteger(numericNumber) || numericNumber < 0 || numericNumber > 99) {
      return setMessage("Forma numarası 0 ile 99 arasında olmalıdır.");
    }

    const duplicateNumber = selectedSquad.some((p) => p.id !== playerId && Number(p.shirtNumber) === numericNumber);
    if (duplicateNumber) return setMessage(`${numericNumber} numaralı forma bu takımda zaten kayıtlı.`);

    const duplicateName = selectedSquad.some(
      (p) => p.id !== playerId && (p.name || "").toLocaleLowerCase("tr-TR") === cleanName.toLocaleLowerCase("tr-TR")
    );
    if (duplicateName) return setMessage("Bu oyuncu aynı takımda zaten kayıtlı.");

    localEditUntilRef.current = Date.now() + 5000;
    setSquads((current) => ({
      ...current,
      [selectedTeam]: (current[selectedTeam] || [])
        .map((p) => (p.id === playerId ? { ...p, name: cleanName, shirtNumber: numericNumber } : p))
        .sort((a, b) => Number(a.shirtNumber) - Number(b.shirtNumber)),
    }));
    cancelEditPlayer();
    setMessage("Oyuncu bilgileri güncellendi.");
  }

  function deletePlayer(playerId) {
    const player = selectedSquad.find((item) => item.id === playerId);
    if (!player) return;
    if (!window.confirm(`${player.name} kadrodan silinsin mi?`)) return;
    localEditUntilRef.current = Date.now() + 5000;
    setSquads((current) => ({
      ...current,
      [selectedTeam]: (current[selectedTeam] || []).filter((item) => item.id !== playerId),
    }));
    setMessage("Oyuncu kadrodan silindi.");
  }

  function clearTeamSquad() {
    if (!selectedTeam || selectedSquad.length === 0) return;
    if (!window.confirm(`${selectedTeam} takımının bütün kadrosu silinecek. Emin misiniz?`)) return;
    setSquads((current) => ({ ...current, [selectedTeam]: [] }));
    setMessage("Takım kadrosu temizlendi.");
  }

  useEffect(() => {
    const list = selectedTeam ? (squads[selectedTeam] || []) : [];
    setBulkRows(Array.from({ length: 24 }, (_, index) => ({
      shirtNumber: list[index]?.shirtNumber ?? "",
      name: list[index]?.name ?? "",
    })));
  }, [selectedTeam]);

  function updateBulkRow(index, field, value) {
    setBulkRows((rows) => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  async function saveBulkSquad() {
    if (!selectedTeam) return;
    const filled = bulkRows.filter((row) => String(row.name).trim() || String(row.shirtNumber).trim() !== "");
    for (const row of filled) {
      const name = String(row.name).trim();
      const num = Number(String(row.shirtNumber).trim());
      if (!name || !Number.isInteger(num) || num < 0 || num > 99) {
        setMessage("Dolu satırlarda oyuncu adı ve 0-99 arası forma numarası olmalıdır.");
        return;
      }
    }
    const nums = filled.map((r) => Number(r.shirtNumber));
    if (new Set(nums).size !== nums.length) return setMessage("Aynı forma numarası iki kez kullanılamaz.");
    const names = filled.map((r) => String(r.name).trim().toLocaleLowerCase("tr-TR"));
    if (new Set(names).size !== names.length) return setMessage("Aynı oyuncu iki kez yazılamaz.");

    const players = filled.map((row, index) => ({
      id: (squads[selectedTeam] || [])[index]?.id || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${index}`),
      name: String(row.name).trim(),
      shirtNumber: Number(row.shirtNumber),
    })).sort((a,b) => a.shirtNumber - b.shirtNumber);
    const next = { ...squads, [selectedTeam]: players };
    localEditUntilRef.current = Date.now() + 10000;
    setSquads(next);
    localStorage.setItem("sscup-squads", JSON.stringify(next));
    const { error } = await supabase.from("app_state").upsert({ id: CLOUD_KEY, value: next, updated_at: new Date().toISOString() });
    setMessage(error ? `Kadro kaydedilemedi: ${error.message}` : `✅ ${players.length} oyuncu tek seferde kaydedildi.`);
  }

  function getTotalPlayers() {
    return Object.values(squads).reduce((total, squad) => total + (Array.isArray(squad) ? squad.length : 0), 0);
  }

  function escapeExcelCell(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exportAllPlayersToExcel() {
    const rows = [];

    teamNames.forEach((teamName) => {
      const teamSquad = Array.isArray(squads[teamName]) ? squads[teamName] : [];
      [...teamSquad]
        .sort((a, b) => Number(a.shirtNumber ?? a.number ?? 999) - Number(b.shirtNumber ?? b.number ?? 999))
        .forEach((player) => {
          rows.push({
            team: teamName,
            shirtNumber: player.shirtNumber ?? player.number ?? "",
            name: player.name || player.playerName || "",
            tc: player.tc || player.tcNo || player.identityNumber || "",
            phone: player.phone || player.telephone || player.mobile || "",
          });
        });
    });

    if (rows.length === 0) {
      alert("Excel'e aktarılacak kayıtlı oyuncu bulunamadı.");
      return;
    }

    const body = rows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeExcelCell(row.team)}</td>
        <td>${escapeExcelCell(row.shirtNumber)}</td>
        <td>${escapeExcelCell(row.name)}</td>
        <td>${escapeExcelCell(row.tc)}</td>
        <td>${escapeExcelCell(row.phone)}</td>
      </tr>`).join("");

    const html = `<!doctype html>
      <html><head><meta charset="UTF-8"></head><body>
      <table border="1">
        <thead><tr><th>Sıra</th><th>Takım</th><th>Forma No</th><th>Ad Soyad</th><th>TC</th><th>Telefon</th></tr></thead>
        <tbody>${body}</tbody>
      </table></body></html>`;

    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toLocaleDateString("en-CA");
    link.href = url;
    link.download = `SS-CUP-TUM-OYUNCULAR-${date}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <h2>👥 Kadro Yönetimi</h2>
      <p>Takımlara forma numarasıyla oyuncu ekleyin. Kadrolar artık PC ve telefon arasında bulut üzerinden eşitlenir.</p>

      <button
        type="button"
        onClick={exportAllPlayersToExcel}
        style={{ marginBottom: "18px", padding: "12px 16px", fontWeight: 900 }}
      >
        📊 TÜM TAKIM OYUNCULARINI EXCEL'E AKTAR
      </button>

      {teamNames.length === 0 ? (
        <p>Önce Takım Yönetimi bölümünden takım eklemelisiniz.</p>
      ) : (
        <>
          <div style={{ marginBottom: "20px" }}>
            <label><b>Takım seç:</b></label><br /><br />
            <select value={selectedTeam} onChange={(event) => { setSelectedTeam(event.target.value); setMessage(""); cancelEditPlayer(); }}>
              <option value="">Takım seçiniz</option>
              {teamNames.map((teamName) => <option key={teamName} value={teamName}>{teamName}</option>)}
            </select>
          </div>

          {selectedTeam && (
            <>
              <div style={{ padding: "15px", border: "1px solid #ddd", borderRadius: "10px", marginBottom: "25px" }}>
                <h3>{selectedTeam} – 24 Kişilik Kadro Girişi</h3>
                <p>Oyuncuları doldurun, en alttaki <b>24 KİŞİLİK KADROYU KAYDET</b> butonuna bir kez basın.</p>
                <div style={{ display: "grid", gap: "8px" }}>
                  {bulkRows.map((row, index) => (
                    <div key={index} style={{ display: "grid", gridTemplateColumns: "50px 110px 1fr", gap: "8px", alignItems: "center" }}>
                      <b>{index + 1}.</b>
                      <input type="number" min="0" max="99" placeholder="Forma No" value={row.shirtNumber} onChange={(e) => updateBulkRow(index, "shirtNumber", e.target.value)} />
                      <input type="text" placeholder="Oyuncu adı soyadı" value={row.name} onChange={(e) => updateBulkRow(index, "name", e.target.value)} />
                    </div>
                  ))}
                </div>
                <button type="button" onClick={saveBulkSquad} style={{ marginTop: "16px", width: "100%", padding: "14px", fontWeight: 900 }}>💾 24 KİŞİLİK KADROYU KAYDET</button>
              </div>

              {message && <p><b>{message}</b></p>}
              <h3>{selectedTeam} Kadrosu ({selectedSquad.length})</h3>

              {selectedSquad.length === 0 ? <p>Bu takımın kadrosu henüz boş.</p> : (
                <div style={{ overflowX: "auto", marginBottom: "20px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th style={{ borderBottom: "1px solid #ddd", padding: "10px" }}>Forma No</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: "10px" }}>Oyuncu</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: "10px" }}>İşlem</th>
                    </tr></thead>
                    <tbody>
                      {selectedSquad.map((player) => (
                        <tr key={player.id}>
                          <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #eee" }}>
                            {editingPlayerId === player.id ? (
                              <input style={{ width: 90 }} type="number" min="0" max="99" value={editingNumber} onChange={(e) => setEditingNumber(e.target.value)} />
                            ) : <b>#{player.shirtNumber}</b>}
                          </td>
                          <td style={{ padding: "10px", borderBottom: "1px solid #eee" }}>
                            {editingPlayerId === player.id ? (
                              <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                            ) : player.name}
                          </td>
                          <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                            {editingPlayerId === player.id ? (
                              <><button type="button" onClick={() => saveEditPlayer(player.id)}>💾 Kaydet</button>{" "}<button type="button" onClick={cancelEditPlayer}>✖ İptal</button></>
                            ) : (
                              <><button type="button" onClick={() => startEditPlayer(player)}>✏️ Düzenle</button>{" "}<button type="button" onClick={() => deletePlayer(player.id)}>🗑️ Sil</button></>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedSquad.length > 0 && <button type="button" onClick={clearTeamSquad}>🗑️ Bu Takımın Kadrosunu Temizle</button>}
            </>
          )}
        </>
      )}

      <hr />
      <p><b>Toplam takım:</b> {teamNames.length}</p>
      <p><b>Toplam kayıtlı oyuncu:</b> {getTotalPlayers()}</p>
    </div>
  );
}
