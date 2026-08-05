import { useEffect, useState } from "react";

export default function TeamContacts({ teams }) {
  const [contacts, setContacts] = useState({});
  const [selectedTeam, setSelectedTeam] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(
      "sscup-team-contacts"
    );

    if (saved) {
      setContacts(JSON.parse(saved));
    }

    if (teams.length > 0) {
      setSelectedTeam(teams[0]);
    }
  }, [teams]);

  function update(field, value) {
    setContacts((current) => ({
      ...current,
      [selectedTeam]: {
        ...current[selectedTeam],
        [field]: value,
      },
    }));
  }

  function save() {
    localStorage.setItem(
      "sscup-team-contacts",
      JSON.stringify(contacts)
    );

    alert("Takım bilgileri kaydedildi.");
  }
  function sendWhatsapp(manager, phone) {
  if (!phone) {
    alert("Telefon numarası girilmemiş.");
    return;
  }

  const cleanPhone = phone.replace(/\D/g, "");

  const finalPhone = cleanPhone.startsWith("90")
    ? cleanPhone
    : `90${cleanPhone.replace(/^0/, "")}`;

  const message = `🏆 S&S CUP

Merhaba ${manager || ""},

${selectedTeam} takım sorumlusu olarak iletişim bilgileriniz sisteme kaydedilmiştir.

Turnuvaya ait fikstür, puan durumu ve duyurular sizinle bu numara üzerinden paylaşılacaktır.

İyi turnuvalar dileriz.

S&S CUP Organizasyonu`;

  window.open(
    `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`,
    "_blank"
  );
}

  const team =
    contacts[selectedTeam] || {};

  return (
    <div className="card">

      <h2>👥 Takım Bilgileri</h2>

      <select
        value={selectedTeam}
        onChange={(e) =>
          setSelectedTeam(e.target.value)
        }
      >
        {teams.map((team) => (
          <option key={team}>
            {team}
          </option>
        ))}
      </select>

      <hr />

      <input
        placeholder="Sorumlu 1"
        value={team.manager1 || ""}
        onChange={(e) =>
          update(
            "manager1",
            e.target.value
          )
        }
      />

      <input
        placeholder="Telefon 1"
        value={team.phone1 || ""}
        onChange={(e) =>
          update(
            "phone1",
            e.target.value
          )
        }
      />

      <input
        placeholder="Sorumlu 2"
        value={team.manager2 || ""}
        onChange={(e) =>
          update(
            "manager2",
            e.target.value
          )
        }
      />

      <input
        placeholder="Telefon 2"
        value={team.phone2 || ""}
        onChange={(e) =>
          update(
            "phone2",
            e.target.value
          )
        }
      />

      <button onClick={save}>
  💾 Kaydet
</button>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "15px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() =>
            sendWhatsapp(team.manager1, team.phone1)
          }
        >
          📲 Sorumlu 1
        </button>

        <button
          type="button"
          onClick={() =>
            sendWhatsapp(team.manager2, team.phone2)
          }
        >
          📲 Sorumlu 2
        </button>
      </div>
    </div>
  );
}