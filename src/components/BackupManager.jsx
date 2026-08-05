import { useRef, useState } from "react";

const BACKUP_VERSION = 2;
const STORAGE_PREFIX = "sscup-";

function getTournamentStorage() {
  const data = {};

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);

    if (key?.startsWith(STORAGE_PREFIX)) {
      data[key] = localStorage.getItem(key);
    }
  }

  return data;
}

function createFileName() {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  return `SS-CUP-MANAGER-PRO-YEDEK-${stamp}.json`;
}

export default function BackupManager() {
  const fileRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);

  function saveBackup() {
    const storage = getTournamentStorage();

    if (Object.keys(storage).length === 0) {
      alert("Yedeklenecek turnuva verisi bulunamadı.");
      return;
    }

    const backup = {
      app: "ArenaCup Pro",
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      storage,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = createFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    localStorage.setItem(
      "arenacup-last-backup",
      new Date().toISOString()
    );

    alert("ArenaCup Pro yedeği bilgisayarına indirildi.");
  }

  function restoreLegacyBackup(data) {
    if (Array.isArray(data.teams)) {
      localStorage.setItem("sscup-teams", JSON.stringify(data.teams));
    }

    if (Array.isArray(data.fixtures)) {
      localStorage.setItem(
        "sscup-fixtures",
        JSON.stringify(data.fixtures)
      );
    }

    if (Array.isArray(data.goals)) {
      localStorage.setItem("sscup-goals", JSON.stringify(data.goals));
    }
  }

  async function loadBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const shouldRestore = window.confirm(
      "Yedek yüklenince mevcut turnuva verileri değiştirilecek. Devam edilsin mi?"
    );

    if (!shouldRestore) return;

    setIsLoading(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data?.storage && typeof data.storage === "object") {
        Object.entries(data.storage).forEach(([key, value]) => {
          if (
            key.startsWith(STORAGE_PREFIX) &&
            typeof value === "string"
          ) {
            localStorage.setItem(key, value);
          }
        });
      } else if (data?.teams || data?.fixtures || data?.goals) {
        restoreLegacyBackup(data);
      } else {
        throw new Error("Geçerli ArenaCup Pro yedeği değil.");
      }

      alert("Yedek başarıyla yüklendi. Uygulama yeniden açılıyor.");
      window.location.reload();
    } catch (error) {
      console.error("Yedek yükleme hatası:", error);
      alert(
        "Yedek yüklenemedi. Dosyanın ArenaCup Pro yedeği olduğundan emin ol."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="card backup-manager-card">
      <h2>💾 Turnuva Yedekleme</h2>
      <p>
        Takımlar, fikstür, skorlar, kadrolar, kura ve ayarlar tek dosyada
        saklanır.
      </p>

      <div className="backup-actions">
        <button type="button" onClick={saveBackup}>
          📥 Tam Yedek İndir
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isLoading}
        >
          {isLoading ? "⏳ Yükleniyor..." : "📤 Yedekten Geri Yükle"}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={loadBackup}
      />
    </div>
  );
}
