import React, { useEffect, useMemo, useState } from "react";
import "./DailySchedule.css";
import { normalizeFixtureDate, sortFixturesBySchedule } from "../utils/fixtureOrder";
import { supabase } from "../supabase";

function formatLongDate(date) {
  if (!date) return "TARİH BELİRLENECEK";
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" })
      .format(new Date(`${date}T12:00:00`))
      .toLocaleUpperCase("tr-TR");
  } catch {
    return date;
  }
}


function normalizePhone(phone) {
  const clean = String(phone || "").replace(/\D/g, "");
  if (!clean) return "";
  return clean.startsWith("90") ? clean : `90${clean.replace(/^0/, "")}`;
}

function formatShortDate(date) {
  if (!date) return "Tarih açıklanacak";
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  } catch {
    return date;
  }
}
function escapeXml(value = "") {
  return String(value).replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char]));
}

function splitTeamName(name = "") {
  const text = String(name || "TAKIM").trim();
  if (text.length <= 14) return [text];

  const words = text.split(/\s+/);
  let first = "";
  let second = "";
  for (const word of words) {
    const candidate = `${first} ${word}`.trim();
    if (!second && candidate.length <= 14) first = candidate;
    else second = `${second} ${word}`.trim();
  }

  if (!first) first = words[0] || text;
  if (!second && text.length > 14) {
    const cut = Math.ceil(text.length / 2);
    return [text.slice(0, cut).trim(), text.slice(cut).trim()];
  }
  return second ? [first, second] : [first];
}

function teamNameSvg(name, x, centerY) {
  const text = String(name || "TAKIM").trim();
  const lines = splitTeamName(text);
  const fontSize = lines.length > 1 ? 27 : (text.length > 12 ? 29 : 33);

  if (lines.length === 1) {
    return `<text x="${x}" y="${centerY + 11}" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900">${escapeXml(lines[0])}</text>`;
  }

  return `<text x="${x}" y="${centerY - 10}" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900"><tspan x="${x}">${escapeXml(lines[0])}</tspan><tspan x="${x}" dy="35">${escapeXml(lines[1])}</tspan></text>`;
}

function buildPosterSvg({ title, dateText, venuePrimary, venueSecondary, matches }) {
  const width = 1080;
  const height = 1920;
  const rows = matches.slice(0, 4);
  const count = Math.max(1, rows.length);
  const rowHeight = 170;
  const gap = 22;
  const blockHeight = count * rowHeight + (count - 1) * gap;
  // 4 maç tüm orta alanı doldurur; 3 maç aynı orta alanda otomatik dikey ortalanır.
  const matchesCenterY = 1065;
  const startY = Math.round(matchesCenterY - blockHeight / 2);
  const venueY = Math.min(startY + blockHeight + 42, 1490);

  const rowSvg = rows.map((match, index) => {
    const y = startY + index * (rowHeight + gap);
    const middleY = y + rowHeight / 2;
    const time = match?.time || "--:--";
    const field = match?.field || match?.pitch || "SAHA 1";
    return `<g>
      <rect x="60" y="${y}" width="960" height="${rowHeight}" rx="28" fill="#11151b" stroke="#f4c400" stroke-width="4"/>
      <path d="M88 ${y} H275 V${y + rowHeight} H88 Q60 ${y + rowHeight} 60 ${y + rowHeight - 28} V${y + 28} Q60 ${y} 88 ${y}Z" fill="url(#gold)"/>
      <text x="168" y="${y + 72}" text-anchor="middle" fill="#080808" font-family="Arial, sans-serif" font-size="43" font-weight="900">${escapeXml(time)}</text>
      <text x="168" y="${y + 112}" text-anchor="middle" fill="#2c2600" font-family="Arial, sans-serif" font-size="20" font-weight="900">${escapeXml(field)}</text>
      ${teamNameSvg(match?.home || "TAKIM", 420, middleY)}
      <text x="620" y="${middleY + 13}" text-anchor="middle" fill="#ffd21f" font-family="Arial, sans-serif" font-size="40" font-weight="1000">VS</text>
      ${teamNameSvg(match?.away || "TAKIM", 835, middleY)}
    </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#050505"/><stop offset=".55" stop-color="#11151c"/><stop offset="1" stop-color="#050505"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe044"/><stop offset="1" stop-color="#f2b900"/></linearGradient>
      <radialGradient id="light"><stop stop-color="#ffffff" stop-opacity=".72"/><stop offset=".18" stop-color="#ffe889" stop-opacity=".25"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient>
      <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#ffffff" opacity=".05"/></pattern>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <rect width="1080" height="1920" fill="url(#dots)"/>
    <circle cx="105" cy="125" r="270" fill="url(#light)"/><circle cx="975" cy="125" r="270" fill="url(#light)"/>
    <path d="M0 470 L245 405 L225 505 L0 575 Z" fill="#f4c400" opacity=".95"/>
    <path d="M1080 470 L835 405 L855 505 L1080 575 Z" fill="#f4c400" opacity=".95"/>

    <rect x="440" y="64" width="200" height="142" rx="36" fill="url(#gold)"/>
    <text x="540" y="155" text-anchor="middle" fill="#080808" font-family="Arial, sans-serif" font-size="58" font-weight="1000">S&amp;S</text>
    <text x="540" y="286" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="62" font-weight="1000">${escapeXml(title)}</text>
    <text x="540" y="337" text-anchor="middle" fill="#ffd21f" font-family="Arial, sans-serif" font-size="25" font-weight="900" letter-spacing="4">KAZANAN SAHADA BELLİ OLUR</text>
    <text x="540" y="485" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="60" font-weight="1000" letter-spacing="-1">GECENİN <tspan fill="#ffd21f">MAÇLARI</tspan></text>
    <rect x="250" y="525" width="580" height="72" rx="22" fill="url(#gold)"/>
    <text x="540" y="572" text-anchor="middle" fill="#090909" font-family="Arial, sans-serif" font-size="28" font-weight="1000">${escapeXml(dateText)}</text>

    ${rowSvg}

    <rect x="60" y="${venueY}" width="960" height="132" rx="25" fill="#12171e" stroke="#f4c400" stroke-width="3"/>
    <circle cx="105" cy="${venueY + 40}" r="12" fill="#ffd21f"/><path d="M105 ${venueY + 49} l-12 26 h24z" fill="#ffd21f"/>
    <text x="140" y="${venueY + 37}" fill="#ffd21f" font-family="Arial, sans-serif" font-size="19" font-weight="1000">YER / TESİS</text>
    <text x="140" y="${venueY + 73}" fill="#ffffff" font-family="Arial, sans-serif" font-size="25" font-weight="900">${escapeXml(venuePrimary)}</text>
    <text x="140" y="${venueY + 108}" fill="#ffd21f" font-family="Arial, sans-serif" font-size="28" font-weight="1000">${escapeXml(venueSecondary)}</text>

    <text x="540" y="1668" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="42" font-weight="1000">SAHADA MÜCADELE, <tspan fill="#ffd21f">KUPA BİZİMLE!</tspan></text>
    <line x1="100" y1="1715" x2="980" y2="1715" stroke="#f4c400" stroke-opacity=".55"/>
    <text x="100" y="1772" fill="#ffd21f" font-family="Arial, sans-serif" font-size="22" font-weight="1000">CANLI TAKİP</text>
    <text x="100" y="1807" fill="#ffffff" font-family="Arial, sans-serif" font-size="21" font-weight="800">ss-cup-manager.vercel.app</text>
    <text x="540" y="1772" text-anchor="middle" fill="#ffd21f" font-family="Arial, sans-serif" font-size="22" font-weight="1000">INSTAGRAM</text>
    <text x="540" y="1807" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="21" font-weight="800">sscup</text>
    <text x="980" y="1772" text-anchor="end" fill="#ffd21f" font-family="Arial, sans-serif" font-size="22" font-weight="1000">WHATSAPP</text>
    <text x="980" y="1807" text-anchor="end" fill="#ffffff" font-family="Arial, sans-serif" font-size="21" font-weight="800">0532 664 46 48</text>
    <text x="540" y="1870" text-anchor="middle" fill="#737d8a" font-family="Arial, sans-serif" font-size="17" font-weight="800">S&amp;S CUP • RESMİ MAÇ GÜNÜ PROGRAMI</text>
  </svg>`;
}

export default function DailySchedule({ fixtures = [], settings = {} }) {
  // Bazı eski/test kayıtlarında aynı takvim günü farklı ham tarih değerleriyle
  // kalmış olabiliyor. Açılır listede görünen gün etiketini tek anahtar kabul
  // ederek aynı günü kesin olarak tek seçenekte birleştiriyoruz.
  const dateGroups = useMemo(() => {
    const groups = new Map();

    fixtures.forEach((match) => {
      const normalized = normalizeFixtureDate(match?.date);
      if (!normalized || normalized === "9999-12-31") return;
      const visibleKey = formatLongDate(normalized);
      const existing = groups.get(visibleKey);
      if (!existing || normalized < existing.date) {
        groups.set(visibleKey, { key: visibleKey, date: normalized });
      }
    });

    return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date, "tr"));
  }, [fixtures]);

  const availableDates = useMemo(() => dateGroups.map((item) => item.date), [dateGroups]);
  const [selectedDate, setSelectedDate] = useState(availableDates[0] || new Date().toISOString().split("T")[0]);
  const [contacts, setContacts] = useState({});
  const [selectedMatch, setSelectedMatch] = useState(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = localStorage.getItem("sscup-team-contacts");
      if (saved) setContacts(JSON.parse(saved));
    } catch {}

    supabase.from("app_state").select("value").eq("id", "team_contacts").maybeSingle().then(({ data, error }) => {
      if (cancelled || error) return;
      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        setContacts(data.value);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const selectedManagers = useMemo(() => {
    if (!selectedMatch) return [];
    return [selectedMatch.home, selectedMatch.away].flatMap((teamName) => {
      const info = contacts?.[teamName] || {};
      return [
        { team: teamName, name: info.manager1, phone: info.phone1 },
        { team: teamName, name: info.manager2, phone: info.phone2 },
      ].filter((row) => row.name || row.phone);
    });
  }, [selectedMatch, contacts]);

  const sendMatchWhatsapp = (row) => {
    if (!selectedMatch) return;
    const phone = normalizePhone(row.phone);
    if (!phone) {
      alert("Bu sorumlu için telefon numarası kayıtlı değil.");
      return;
    }
    const text = `S&S CUP MAÇ HATIRLATMASI\n\nSelam,\nBugün maçınız var, hatırlatmak istedik.\n\n${selectedMatch.home} - ${selectedMatch.away}\nTarih: ${formatShortDate(selectedMatch.date)}\nSaat: ${selectedMatch.time || "Saat açıklanacak"}\nYer: ${selectedMatch.field || settings.venue || "GolPark Halı Saha - Saha 1"}\n\nMaç saatinden en az 15 dakika önce sahada olmanızı rica ederiz.\n\nHerkese başarılar, güzel bir maç olsun!\n\nS&S CUP`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const selectedVisibleKey = formatLongDate(selectedDate);
  const dayMatches = useMemo(() => {
    const seen = new Set();
    return sortFixturesBySchedule(
      fixtures.filter((match) => formatLongDate(normalizeFixtureDate(match?.date)) === selectedVisibleKey)
    ).filter((match) => {
      // Aynı maç eski test kaydı nedeniyle iki kez kaldıysa görselde tek kez göster.
      const identity = `${String(match?.home || "").trim().toLocaleUpperCase("tr-TR")}|${String(match?.away || "").trim().toLocaleUpperCase("tr-TR")}|${String(match?.time || "").trim()}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }).slice(0, 4);
  }, [fixtures, selectedVisibleKey]);

  const tournamentName = settings.tournamentName || settings.title || "S&S CUP";
  const venuePrimary = "KARACABEY BELEDİYE SPOR TESİSLERİ";
  const enteredVenue = String(settings.venue || "").trim();
  const venueSecondary = enteredVenue || "GOLPARK";
  const venue = `${venuePrimary} • ${venueSecondary}`;
  const dateText = formatLongDate(selectedDate);
  const posterHeight = 1920;
  const posterSvg = useMemo(() => buildPosterSvg({ title: tournamentName, dateText, venuePrimary, venueSecondary, matches: dayMatches }), [tournamentName, dateText, venuePrimary, venueSecondary, dayMatches]);
  const posterSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(posterSvg)}`;

  const createPosterPng = () => new Promise((resolve, reject) => {
    const blob = new Blob([posterSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) return reject(new Error("PNG oluşturulamadı"));
          resolve(pngBlob);
        }, "image/png", 1);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel hazırlanamadı"));
    };
    image.src = url;
  });

  const downloadPoster = async () => {
    try {
      const pngBlob = await createPosterPng();
      const pngUrl = URL.createObjectURL(pngBlob);
      const anchor = document.createElement("a");
      anchor.href = pngUrl;
      anchor.download = `SS-CUP-Gecenin-Maclari-${selectedDate}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    } catch (error) {
      alert(error?.message || "Görsel oluşturulamadı.");
    }
  };

  const sharePosterWhatsApp = async () => {
    if (dayMatches.length === 0) return;

    try {
      const pngBlob = await createPosterPng();
      const file = new File([pngBlob], `SS-CUP-Gecenin-Maclari-${selectedDate}.png`, { type: "image/png" });
      const message = `🏆 ${tournamentName}\n⚽ GECENİN MAÇLARI\n📅 ${dateText}\n📍 ${venue}\n\nCanlı takip: https://ss-cup-manager.vercel.app/?page=takip`;

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: `${tournamentName} - Gecenin Maçları`,
          text: message,
          files: [file],
        });
        return;
      }

      // Windows/Electron fallback: put the poster on clipboard when possible, then open WhatsApp.
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
        } catch {
          // Clipboard image support is not available in every Chromium/Electron build.
        }
      }

      const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      if (error?.name !== "AbortError") {
        alert(error?.message || "WhatsApp paylaşımı başlatılamadı.");
      }
    }
  };

  return (
    <div className="night-admin-page">
      <div className="night-admin-toolbar">
        <div><span>GÖRSEL MERKEZİ</span><h2>Gecenin Maçları</h2><p>Seçilen tarihteki {dayMatches.length || 0} maçı görsele otomatik sığdırır.</p></div>
        <div className="night-admin-actions">
          <label>Tarih<select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>{availableDates.length === 0 && <option value={selectedDate}>{selectedDate}</option>}{availableDates.map((date) => <option key={date} value={date}>{formatLongDate(date)}</option>)}</select></label>
          <button className="night-png-btn" onClick={downloadPoster} disabled={dayMatches.length === 0}>🖼️ PNG Görsel Oluştur</button>
          <button className="night-wa-btn" onClick={sharePosterWhatsApp} disabled={dayMatches.length === 0}>📲 WhatsApp’tan Gönder</button>
        </div>
      </div>

      <div className="night-poster-preview night-poster-preview-exact">
        <img className="night-poster-exact-image" src={posterSrc} alt={`${tournamentName} gecenin maçları Instagram Story önizlemesi`} />
      </div>

      <section className="night-private-matches">
        <div className="night-private-head"><span>🔒 SADECE YÖNETİM</span><h3>Maç Sorumluları & WhatsApp</h3><p>Bu bölüm canlı takipte görünmez. Maça tıkla, iki takımın kayıtlı sorumlularını aç.</p></div>
        <div className="night-private-list">
          {dayMatches.map((match, index) => (
            <button type="button" className="night-private-match" key={`private-${match?.id || index}`} onClick={() => setSelectedMatch(match)}>
              <b>{match?.time || "--:--"}</b><span>{match?.home || "TAKIM"} <i>VS</i> {match?.away || "TAKIM"}</span><em>Detay ›</em>
            </button>
          ))}
        </div>
      </section>

      {selectedMatch && (
        <div className="night-admin-modal-backdrop" onMouseDown={() => setSelectedMatch(null)}>
          <div className="night-admin-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="night-admin-modal-close" type="button" onClick={() => setSelectedMatch(null)}>×</button>
            <span className="night-admin-modal-kicker">🔒 YÖNETİM • MAÇ DETAYI</span>
            <h3>{selectedMatch.home} <i>VS</i> {selectedMatch.away}</h3>
            <p>{formatShortDate(selectedMatch.date)} • {selectedMatch.time || "--:--"} • {selectedMatch.field || settings.venue || "Saha 1"}</p>
            <div className="night-admin-manager-list">
              {selectedManagers.length === 0 ? <div className="night-admin-manager-empty">Bu iki takım için kayıtlı sorumlu bulunamadı.</div> : selectedManagers.map((row, index) => (
                <button type="button" key={`${row.team}-${index}`} onClick={() => sendMatchWhatsapp(row)} disabled={!normalizePhone(row.phone)}>
                  <span><strong>{row.team}</strong><small>{row.name || "Takım sorumlusu"}</small></span>
                  <em>{row.phone ? `📲 ${row.phone}` : "Telefon yok"}</em>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
