import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    localStorage.setItem(
      "sscup-squads",
      JSON.stringify(squads)
    );
  }, [squads]);

  useEffect(() => {
    if (
      selectedTeam &&
      !teams.some((team) => getTeamName(team) === selectedTeam)
    ) {
      setSelectedTeam("");
    }
  }, [teams, selectedTeam]);

  function getTeamName(team) {
    if (typeof team === "string") {
      return team;
    }

    return team?.name || team?.teamName || "";
  }

  const teamNames = useMemo(() => {
    return teams
      .map((team) => getTeamName(team))
      .filter(Boolean);
  }, [teams]);

  const selectedSquad = useMemo(() => {
    if (!selectedTeam) {
      return [];
    }

    return squads[selectedTeam] || [];
  }, [squads, selectedTeam]);

  function addPlayer(event) {
    event.preventDefault();

    const cleanName = playerName.trim();
    const cleanNumber = String(shirtNumber).trim();

    if (!selectedTeam) {
      setMessage("Önce bir takım seçmelisiniz.");
      return;
    }

    if (!cleanName) {
      setMessage("Oyuncu adını yazmalısınız.");
      return;
    }

    if (cleanNumber === "") {
      setMessage("Forma numarasını yazmalısınız.");
      return;
    }

    const numericNumber = Number(cleanNumber);

    if (
      !Number.isInteger(numericNumber) ||
      numericNumber < 0 ||
      numericNumber > 99
    ) {
      setMessage(
        "Forma numarası 0 ile 99 arasında olmalıdır."
      );
      return;
    }

    const currentSquad = squads[selectedTeam] || [];

    const sameNumberExists = currentSquad.some(
      (player) =>
        Number(player.shirtNumber) === numericNumber
    );

    if (sameNumberExists) {
      setMessage(
        `${selectedTeam} takımında ${numericNumber} numaralı forma zaten kayıtlı.`
      );
      return;
    }

    const sameNameExists = currentSquad.some(
      (player) =>
        player.name.toLocaleLowerCase("tr-TR") ===
        cleanName.toLocaleLowerCase("tr-TR")
    );

    if (sameNameExists) {
      setMessage(
        "Bu oyuncu aynı takımda zaten kayıtlı."
      );
      return;
    }

    const newPlayer = {
      id:
        typeof crypto !== "undefined" &&
        crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      name: cleanName,
      shirtNumber: numericNumber,
    };

    setSquads((current) => ({
      ...current,
      [selectedTeam]: [
        ...(current[selectedTeam] || []),
        newPlayer,
      ].sort(
        (a, b) =>
          Number(a.shirtNumber) -
          Number(b.shirtNumber)
      ),
    }));

    setPlayerName("");
    setShirtNumber("");
    setMessage("Oyuncu kadroya eklendi.");
  }

  function deletePlayer(playerId) {
    const player = selectedSquad.find(
      (item) => item.id === playerId
    );

    if (!player) {
      return;
    }

    const confirmed = window.confirm(
      `${player.name} kadrodan silinsin mi?`
    );

    if (!confirmed) {
      return;
    }

    setSquads((current) => ({
      ...current,
      [selectedTeam]: (
        current[selectedTeam] || []
      ).filter((item) => item.id !== playerId),
    }));

    setMessage("Oyuncu kadrodan silindi.");
  }

  function clearTeamSquad() {
    if (!selectedTeam || selectedSquad.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `${selectedTeam} takımının bütün kadrosu silinecek. Emin misiniz?`
    );

    if (!confirmed) {
      return;
    }

    setSquads((current) => ({
      ...current,
      [selectedTeam]: [],
    }));

    setMessage("Takım kadrosu temizlendi.");
  }

  function getTotalPlayers() {
    return Object.values(squads).reduce(
      (total, squad) =>
        total + (Array.isArray(squad) ? squad.length : 0),
      0
    );
  }

  return (
    <div className="card">
      <h2>👥 Kadro Yönetimi</h2>

      <p>
        Takımlara forma numarasıyla oyuncu ekleyin.
        Aynı takımda aynı forma numarası iki kez
        kullanılamaz.
      </p>

      {teamNames.length === 0 ? (
        <p>
          Önce Takım Yönetimi bölümünden takım
          eklemelisiniz.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: "20px" }}>
            <label>
              <b>Takım seç:</b>
            </label>

            <br />
            <br />

            <select
              value={selectedTeam}
              onChange={(event) => {
                setSelectedTeam(event.target.value);
                setMessage("");
              }}
            >
              <option value="">Takım seçiniz</option>

              {teamNames.map((teamName) => (
                <option
                  key={teamName}
                  value={teamName}
                >
                  {teamName}
                </option>
              ))}
            </select>
          </div>

          {selectedTeam && (
            <>
              <form
                onSubmit={addPlayer}
                style={{
                  padding: "15px",
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  marginBottom: "25px",
                }}
              >
                <h3>{selectedTeam} – Oyuncu Ekle</h3>

                <input
                  type="number"
                  min="0"
                  max="99"
                  placeholder="Forma No"
                  value={shirtNumber}
                  onChange={(event) =>
                    setShirtNumber(event.target.value)
                  }
                />

                {" "}

                <input
                  type="text"
                  placeholder="Oyuncu adı soyadı"
                  value={playerName}
                  onChange={(event) =>
                    setPlayerName(event.target.value)
                  }
                />

                {" "}

                <button type="submit">
                  Oyuncu Ekle
                </button>
              </form>

              {message && (
                <p>
                  <b>{message}</b>
                </p>
              )}

              <h3>
                {selectedTeam} Kadrosu (
                {selectedSquad.length})
              </h3>

              {selectedSquad.length === 0 ? (
                <p>Bu takımın kadrosu henüz boş.</p>
              ) : (
                <div
                  style={{
                    overflowX: "auto",
                    marginBottom: "20px",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            borderBottom:
                              "1px solid #ddd",
                            padding: "10px",
                          }}
                        >
                          Forma No
                        </th>

                        <th
                          style={{
                            borderBottom:
                              "1px solid #ddd",
                            padding: "10px",
                          }}
                        >
                          Oyuncu
                        </th>

                        <th
                          style={{
                            borderBottom:
                              "1px solid #ddd",
                            padding: "10px",
                          }}
                        >
                          İşlem
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedSquad.map((player) => (
                        <tr key={player.id}>
                          <td
                            style={{
                              textAlign: "center",
                              padding: "10px",
                              borderBottom:
                                "1px solid #eee",
                            }}
                          >
                            <b>
                              #{player.shirtNumber}
                            </b>
                          </td>

                          <td
                            style={{
                              padding: "10px",
                              borderBottom:
                                "1px solid #eee",
                            }}
                          >
                            {player.name}
                          </td>

                          <td
                            style={{
                              textAlign: "center",
                              padding: "10px",
                              borderBottom:
                                "1px solid #eee",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                deletePlayer(player.id)
                              }
                            >
                              🗑️ Sil
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedSquad.length > 0 && (
                <button
                  type="button"
                  onClick={clearTeamSquad}
                >
                  🗑️ Bu Takımın Kadrosunu Temizle
                </button>
              )}
            </>
          )}
        </>
      )}

      <hr />

      <p>
        <b>Toplam takım:</b> {teamNames.length}
      </p>

      <p>
        <b>Toplam kayıtlı oyuncu:</b>{" "}
        {getTotalPlayers()}
      </p>
    </div>
  );
}