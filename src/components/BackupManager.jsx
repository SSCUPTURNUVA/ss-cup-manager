import { useRef, useState } from "react";
import { supabase } from "../supabase";

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

  async function saveBackup() {
    const storage = getTournamentStorage();

    if (Object.keys(storage).length === 0) {
      alert("Yedeklenecek turnuva verisi bulunamadı.");
      return;
    }

    // Yerel verinin yanında buluttaki güncel turnuva durumunu da salt-okunur
    // olarak yedeğe koy. Böylece cihaz değişse bile kurtarma için tek dosya kalır.
    let cloud = null;
    try {
      const [fixturesResult, teamsResult, stateResult, scorersResult] = await Promise.all([
        supabase.from("fixtures").select("*").order("id"),
        supabase.from("teams").select("*").order("id"),
        supabase.from("app_state").select("*").in("id", ["squads", "knockout", "active_fixture_ids"]),
        supabase.from("goal_scorers").select("*"),
      ]);

      cloud = {
        fixtures: fixturesResult.error ? null : fixturesResult.data,
        teams: teamsResult.error ? null : teamsResult.data,
        appState: stateResult.error ? null : stateResult.data,
        goalScorers: scorersResult.error ? null : scorersResult.data,
        complete: !fixturesResult.error && !teamsResult.error && !stateResult.error && !scorersResult.error,
      };
    } catch (error) {
      console.warn("Bulut yedeği alınamadı; yerel yedek yine oluşturulacak:", error);
    }

    const backup = {
      app: "S&S CUP MANAGER PRO",
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      storage,
      cloud,
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
      "sscup-last-backup",
      new Date().toISOString()
    );

    alert(cloud?.complete
      ? "S&S CUP tam yedeği (yerel + bulut) bilgisayarına indirildi."
      : "S&S CUP yerel yedeği indirildi. Bulut bağlantısı eksik olduğu için bulut kopyası tamamlanamadı.");
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
        throw new Error("Geçerli S&S CUP turnuva yedeği değil.");
      }

      alert("Yedek başarıyla yüklendi. Uygulama yeniden açılıyor.");
      window.location.reload();
    } catch (error) {
      console.error("Yedek yükleme hatası:", error);
      alert(
        "Yedek yüklenemedi. Dosyanın S&S CUP turnuva yedeği olduğundan emin ol."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="card backup-manager-card">
      <h2>💾 Turnuvayı Yedekle / Geri Yükle</h2>
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
