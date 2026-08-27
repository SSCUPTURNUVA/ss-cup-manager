import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";

function normalizePhone(phone) {
  const clean = String(phone || "").replace(/\D/g, "");
  if (!clean) return "";
  if (clean.startsWith("90")) return clean;
  return `90${clean.replace(/^0/, "")}`;
}

function formatStandingLine(team, index) {
  const gd = team.goalDifference ?? team.gd ?? team.av ?? 0;
  return `${index + 1}. ${team.team} | O:${team.played ?? team.om ?? 0} | AV:${gd > 0 ? "+" : ""}${gd} | P:${team.points ?? 0}`;
}

export default function TeamContacts({
  teams = [],
  fixtures = [],
  standings = [],
  goalScorers = [],
  settings = {},
}) {
  const [contacts, setContacts] = useState({});
  const cloudReadyRef = useRef(false);
  const applyingCloudRef = useRef(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [recipientType, setRecipientType] = useState("manager1");
  const [customName, setCustomName] = useState("");
  const [customPhone, setCustomPhone] = useState("");
  const [messageType, setMessageType] = useState("nextmatch");
  const [customMessage, setCustomMessage] = useState("");

  useEffect(() => {
    let localContacts = {};
    try {
      const saved = localStorage.getItem("sscup-team-contacts");
      if (saved) {
        localContacts = JSON.parse(saved);
        setContacts(localContacts);
      }
    } catch {
      localContacts = {};
      setContacts({});
    }

    let cancelled = false;
    async function loadCloudContacts() {
      const { data, error } = await supabase
        .from("app_state")
        .select("value,updated_at")
        .eq("id", "team_contacts")
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Takım sorumluları bulut yükleme hatası:", error);
        cloudReadyRef.current = true;
        return;
      }

      const cloudValue = data?.value;
      const hasCloud = cloudValue && typeof cloudValue === "object" && !Array.isArray(cloudValue);
      const hasLocal = Object.keys(localContacts || {}).length > 0;

      if (hasCloud) {
        applyingCloudRef.current = true;
        setContacts(cloudValue);
        localStorage.setItem("sscup-team-contacts", JSON.stringify(cloudValue));
        window.setTimeout(() => { applyingCloudRef.current = false; cloudReadyRef.current = true; }, 0);
      } else {
        cloudReadyRef.current = true;
        if (hasLocal) {
          await supabase.from("app_state").upsert({
            id: "team_contacts",
            value: localContacts,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    loadCloudContacts();

    const channel = supabase
      .channel(`sscup-team-contacts-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.team_contacts" }, (payload) => {
        const value = payload?.new?.value;
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        applyingCloudRef.current = true;
        setContacts(value);
        localStorage.setItem("sscup-team-contacts", JSON.stringify(value));
        window.setTimeout(() => { applyingCloudRef.current = false; cloudReadyRef.current = true; }, 0);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (teams.length > 0 && !teams.includes(selectedTeam)) {
      setSelectedTeam(teams[0]);
    }
  }, [teams, selectedTeam]);

  const team = contacts[selectedTeam] || {};

  const nextTeamMatch = useMemo(() => {
    return fixtures
      .filter(
        (m) =>
          m?.played !== true &&
          (m?.home === selectedTeam || m?.away === selectedTeam)
      )
      .sort((a, b) =>
        `${a?.date || "9999-12-31"} ${a?.time || "23:59"}`.localeCompare(
          `${b?.date || "9999-12-31"} ${b?.time || "23:59"}`
        )
      )[0];
  }, [fixtures, selectedTeam]);

  const sortedScorers = useMemo(
    () =>
      [...goalScorers].sort(
        (a, b) => Number(b?.goals || 0) - Number(a?.goals || 0)
      ),
    [goalScorers]
  );

  function update(field, value) {
    setContacts((current) => ({
      ...current,
      [selectedTeam]: {
        ...current[selectedTeam],
        [field]: value,
      },
    }));
  }

  async function save() {
    localStorage.setItem("sscup-team-contacts", JSON.stringify(contacts));
    const { error } = await supabase.from("app_state").upsert({
      id: "team_contacts",
      value: contacts,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Takım sorumluları bulut kaydetme hatası:", error);
      alert("Bilgiler bu cihaza kaydedildi fakat buluta gönderilemedi.");
      return;
    }
    alert("Takım bilgileri kaydedildi.");
  }

  function publicLink() {
    try {
      if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        const url = new URL(window.location.href);
        url.searchParams.set("page", "takip");
        return url.toString();
      }
    } catch {}
    return "";
  }

  function buildMessage() {
    const title = settings.tournamentName || "S&S CUP";
    const link = publicLink();
    const greetingName =
      recipientType === "custom"
        ? customName
        : recipientType === "manager2"
          ? team.manager2
          : team.manager1;

    let text = `🏆 *${title}*\n`;
    if (greetingName) text += `Merhaba ${greetingName},\n\n`;

    if (messageType === "nextmatch") {
      text += `⚽ *${selectedTeam} - SIRADAKİ MAÇ*\n`;
      if (!nextTeamMatch) {
        text += `Takım için planlanmış yeni maç bulunmuyor.\n`;
      } else {
        text += `🆚 ${nextTeamMatch.home} - ${nextTeamMatch.away}\n`;
        text += `🗓 ${nextTeamMatch.date || "Tarih bekleniyor"}\n`;
        text += `⏰ ${nextTeamMatch.time || "--:--"}\n`;
        text += `📍 ${nextTeamMatch.field || settings.venue || "Halı Saha"}\n`;
      }
    }

    if (messageType === "standings") {
      text += `📊 *GÜNCEL PUAN DURUMU*\n`;
      if (!standings.length) text += `Puan durumu henüz oluşmadı.\n`;
      standings.slice(0, 10).forEach((row, i) => {
        text += `${formatStandingLine(row, i)}\n`;
      });
    }

    if (messageType === "scorers") {
      text += `⚽ *GOL KRALLIĞI*\n`;
      if (!sortedScorers.length) text += `Gol krallığı henüz oluşmadı.\n`;
      sortedScorers.slice(0, 10).forEach((player, i) => {
        text += `${i + 1}. ${player.name || player.playerName || "Oyuncu"} (${player.team || "-"}) - ${Number(player.goals || 0)} Gol\n`;
      });
    }

    if (messageType === "teamfixture") {
      text += `📅 *${selectedTeam} - MAÇ PROGRAMI*\n`;
      const matches = fixtures
        .filter((m) => m?.home === selectedTeam || m?.away === selectedTeam)
        .sort((a, b) => `${a?.date || ""} ${a?.time || ""}`.localeCompare(`${b?.date || ""} ${b?.time || ""}`));
      if (!matches.length) text += `Takım için fikstür bulunmuyor.\n`;
      matches.forEach((m) => {
        const score = m.played === true ? ` | ${m.homeScore ?? 0}-${m.awayScore ?? 0}` : "";
        text += `• ${m.date || "-"} ${m.time || "--:--"} | ${m.home} - ${m.away}${score}\n`;
      });
    }

    if (messageType === "custom") {
      text += customMessage.trim() || "Turnuva bilgilendirmesi.";
      text += "\n";
    }

    if (link) text += `\n🔗 *Canlı Takip:* ${link}\n`;
    text += `\n_S&S CUP Organizasyonu_`;
    return text;
  }

  function selectedRecipient() {
    if (recipientType === "custom") {
      return { name: customName, phone: customPhone };
    }
    if (recipientType === "manager2") {
      return { name: team.manager2, phone: team.phone2 };
    }
    return { name: team.manager1, phone: team.phone1 };
  }

  function sendWhatsapp() {
    const recipient = selectedRecipient();
    const phone = normalizePhone(recipient.phone);
    if (!phone) {
      alert("WhatsApp gönderimi için telefon numarası girin.");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildMessage())}`, "_blank");
  }

  function copyMessage() {
    const text = buildMessage();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => alert("Mesaj panoya kopyalandı."));
      return;
    }
    alert(text);
  }

  return (
    <div className="ss-contact-page">
      <style>{contactCss}</style>

      <section className="ss-contact-card">
        <div className="ss-contact-title">
          <div><span>TAKIM İLETİŞİMİ</span><h2>👥 Takım Sorumluları</h2></div>
          <p>Takım yetkililerini kaydet, sonra tek tıkla bilgilendir.</p>
        </div>

        <label>Takım</label>
        <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
          {teams.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>

        <div className="ss-contact-grid">
          <div><label>Sorumlu 1</label><input placeholder="Ad Soyad" value={team.manager1 || ""} onChange={(e) => update("manager1", e.target.value)} /></div>
          <div><label>Telefon 1</label><input placeholder="05xx xxx xx xx" value={team.phone1 || ""} onChange={(e) => update("phone1", e.target.value)} /></div>
          <div><label>Sorumlu 2</label><input placeholder="Ad Soyad" value={team.manager2 || ""} onChange={(e) => update("manager2", e.target.value)} /></div>
          <div><label>Telefon 2</label><input placeholder="05xx xxx xx xx" value={team.phone2 || ""} onChange={(e) => update("phone2", e.target.value)} /></div>
        </div>

        <button className="ss-save-btn" type="button" onClick={save}>💾 Takım Bilgilerini Kaydet</button>
      </section>

      <section className="ss-wa-card">
        <div className="ss-wa-header">
          <div className="ss-wa-icon">📲</div>
          <div><span>WHATSAPP BİLGİLENDİRME</span><h2>İstediğine Turnuva Bilgisi Gönder</h2><p>Maç, puan durumu, gol krallığı veya özel mesajı otomatik hazırlar.</p></div>
        </div>

        <div className="ss-wa-grid">
          <div>
            <label>Alıcı</label>
            <select value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
              <option value="manager1">Sorumlu 1 {team.manager1 ? `- ${team.manager1}` : ""}</option>
              <option value="manager2">Sorumlu 2 {team.manager2 ? `- ${team.manager2}` : ""}</option>
              <option value="custom">Başka Bir Kişi / Sporcu</option>
            </select>
          </div>
          <div>
            <label>Bilgi Türü</label>
            <select value={messageType} onChange={(e) => setMessageType(e.target.value)}>
              <option value="nextmatch">Sıradaki Maç</option>
              <option value="teamfixture">Takımın Tüm Fikstürü</option>
              <option value="standings">Güncel Puan Durumu</option>
              <option value="scorers">Gol Krallığı</option>
              <option value="custom">Özel Mesaj</option>
            </select>
          </div>
        </div>

        {recipientType === "custom" && (
          <div className="ss-contact-grid ss-custom-recipient">
            <div><label>Ad Soyad (isteğe bağlı)</label><input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Sporcu / Yetkili adı" /></div>
            <div><label>WhatsApp Telefonu</label><input value={customPhone} onChange={(e) => setCustomPhone(e.target.value)} placeholder="05xx xxx xx xx" /></div>
          </div>
        )}

        {messageType === "custom" && (
          <div className="ss-custom-message"><label>Mesaj</label><textarea rows="4" value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Göndermek istediğiniz duyuruyu yazın..." /></div>
        )}

        <div className="ss-preview">
          <span>MESAJ ÖNİZLEME</span>
          <pre>{buildMessage()}</pre>
        </div>

        <div className="ss-wa-actions">
          <button className="ss-copy-btn" type="button" onClick={copyMessage}>📋 Mesajı Kopyala</button>
          <button className="ss-whatsapp-btn" type="button" onClick={sendWhatsapp}>📲 WhatsApp'ta Aç</button>
        </div>
      </section>
    </div>
  );
}

const contactCss = `
.ss-contact-page{display:grid;gap:18px}.ss-contact-card,.ss-wa-card{background:linear-gradient(180deg,#111722,#0b1018);border:1px solid #263143;border-radius:20px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.16)}.ss-contact-title,.ss-wa-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.ss-contact-title span,.ss-wa-header span,.ss-preview>span{font-size:9px;letter-spacing:.14em;color:#e6b936;font-weight:900}.ss-contact-title h2,.ss-wa-header h2{margin:3px 0 0;color:#f8fafc}.ss-contact-title p,.ss-wa-header p{margin:4px 0 0;color:#8491a5;font-size:11px}.ss-contact-page label{display:block;color:#aab4c3;font-size:10px;font-weight:800;margin:0 0 6px}.ss-contact-page input,.ss-contact-page select,.ss-contact-page textarea{width:100%;background:#080c13;border:1px solid #2a3445;color:#f8fafc;border-radius:11px;padding:11px 12px;outline:none}.ss-contact-page input:focus,.ss-contact-page select:focus,.ss-contact-page textarea:focus{border-color:#d6a828;box-shadow:0 0 0 3px rgba(214,168,40,.1)}.ss-contact-grid,.ss-wa-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}.ss-save-btn,.ss-copy-btn,.ss-whatsapp-btn{border:0;border-radius:11px;padding:11px 15px;font-weight:900;cursor:pointer}.ss-save-btn{margin-top:14px;background:linear-gradient(135deg,#e6ba38,#bd8610);color:#171207}.ss-wa-card{border-color:rgba(37,211,102,.3)}.ss-wa-header{justify-content:flex-start;align-items:center}.ss-wa-icon{width:52px;height:52px;display:grid;place-items:center;border-radius:15px;background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.3);font-size:24px}.ss-wa-header span{color:#52df87}.ss-custom-recipient,.ss-custom-message{margin-top:12px}.ss-preview{margin-top:14px;border:1px solid #253043;background:#070b11;border-radius:14px;padding:14px}.ss-preview>span{color:#6f7e93}.ss-preview pre{margin:10px 0 0;white-space:pre-wrap;word-break:break-word;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#d6dde8;max-height:260px;overflow:auto}.ss-wa-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:12px}.ss-copy-btn{background:#202a38;color:#e5e7eb}.ss-whatsapp-btn{background:#25D366;color:#06140b}@media(max-width:680px){.ss-contact-title{display:block}.ss-contact-title p{margin-top:8px}.ss-contact-grid,.ss-wa-grid{grid-template-columns:1fr}.ss-wa-header{align-items:flex-start}.ss-wa-actions{flex-direction:column}.ss-wa-actions button{width:100%}}
`;
