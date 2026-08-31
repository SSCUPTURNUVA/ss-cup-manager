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

function fitTeamName(name = "") {
  const text = String(name).trim();
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

function getPosterHeight(matchCount) {
  const safeCount = Math.max(1, Math.min(4, Number(matchCount) || 1));
  return 780 + safeCount * 145;
}

function buildPosterSvg({ title, dateText, venue, matches }) {
  const width = 1080;
  const rows = matches.slice(0, 4);
  const rowCount = Math.max(1, rows.length);
  const height = getPosterHeight(rowCount);
  const footerY = 555 + rowCount * 145 + 25;
  const rowSvg = rows.map((match, index) => {
    const y = 555 + index * 145;
    const time = match?.time || "--:--";
    const home = fitTeamName(match?.home || "TAKIM");
    const away = fitTeamName(match?.away || "TAKIM");
    const field = match?.field || match?.pitch || "SAHA 1";
    return `
      <g>
        <rect x="72" y="${y}" width="936" height="118" rx="22" fill="#11151b" stroke="#f4c400" stroke-width="2"/>
        <rect x="72" y="${y}" width="190" height="118" rx="22" fill="url(#gold)"/>
        <rect x="240" y="${y}" width="22" height="118" fill="url(#gold)"/>
        <text x="167" y="${y + 57}" text-anchor="middle" fill="#080808" font-size="34" font-weight="900">${escapeXml(time)}</text>
        <text x="167" y="${y + 84}" text-anchor="middle" fill="#2c2600" font-size="17" font-weight="800">${escapeXml(field)}</text>
        <text x="470" y="${y + 70}" text-anchor="end" fill="#ffffff" font-size="31" font-weight="900">${escapeXml(home)}</text>
        <polygon points="520,${y + 18} 605,${y + 18} 635,${y + 59} 605,${y + 100} 520,${y + 100} 490,${y + 59}" fill="#171b22" stroke="#f4c400" stroke-width="2"/>
        <text x="562" y="${y + 72}" text-anchor="middle" fill="#ffd21f" font-size="34" font-weight="900">VS</text>
        <text x="655" y="${y + 70}" fill="#ffffff" font-size="31" font-weight="900">${escapeXml(away)}</text>
      </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#050505"/><stop offset=".55" stop-color="#11151c"/><stop offset="1" stop-color="#050505"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe044"/><stop offset="1" stop-color="#f2b900"/></linearGradient>
      <radialGradient id="light"><stop stop-color="#ffffff" stop-opacity=".72"/><stop offset=".18" stop-color="#ffe889" stop-opacity=".28"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient>
      <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#ffffff" opacity=".055"/></pattern>
    </defs>
    <rect width="1080" height="${height}" fill="url(#bg)"/>
    <rect width="1080" height="${height}" fill="url(#dots)"/>
    <circle cx="110" cy="65" r="230" fill="url(#light)"/><circle cx="970" cy="65" r="230" fill="url(#light)"/>
    <path d="M0 405 L280 325 L245 420 L0 505 Z" fill="#f4c400" opacity=".9"/><path d="M1080 365 L850 315 L885 430 L1080 490 Z" fill="#f4c400" opacity=".92"/>
    <g transform="translate(540 145)">
      <rect x="-82" y="-58" width="164" height="116" rx="26" fill="url(#gold)"/>
      <text x="0" y="14" text-anchor="middle" fill="#080808" font-size="46" font-weight="1000">S&amp;S</text>
    </g>
    <text x="540" y="245" text-anchor="middle" fill="#ffffff" font-size="66" font-weight="1000">${escapeXml(title)}</text>
    <text x="540" y="292" text-anchor="middle" fill="#ffd21f" font-size="25" font-weight="900" letter-spacing="3">KAZANAN SAHADA BELLİ OLUR</text>
    <text x="540" y="420" text-anchor="middle" fill="#ffffff" font-size="82" font-weight="1000">GECENİN <tspan fill="#ffd21f">MAÇLARI</tspan></text>
    <rect x="258" y="450" width="564" height="58" rx="18" fill="url(#gold)"/>
    <text x="540" y="488" text-anchor="middle" fill="#090909" font-size="24" font-weight="1000">${escapeXml(dateText)}</text>
    ${rowSvg}
    <rect x="72" y="${footerY}" width="936" height="108" rx="24" fill="#12171e" stroke="#f4c400" stroke-width="2"/>
    <text x="120" y="${footerY + 45}" fill="#ffd21f" font-size="22" font-weight="1000">📍 MAÇLARIN ADRESİ</text>
    <text x="120" y="${footerY + 83}" fill="#ffffff" font-size="31" font-weight="900">${escapeXml(venue)}</text>
    <text x="955" y="${footerY + 45}" text-anchor="end" fill="#ffd21f" font-size="25" font-weight="1000">S&amp;S CUP</text>
    <text x="955" y="${footerY + 83}" text-anchor="end" fill="#ffffff" font-size="20" font-style="italic" font-weight="800">HEYECAN SAHADA!</text>
    <text x="540" y="${height - 25}" text-anchor="middle" fill="#7f8997" font-size="16" font-weight="800">S&amp;S CUP • RESMİ MAÇ GÜNÜ PROGRAMI</text>
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
  const venue = settings.venue || "GOL PARK HALI SAHA TESİSLERİ • SAHA 1";
  const dateText = formatLongDate(selectedDate);
  const posterHeight = getPosterHeight(dayMatches.length);

  const createPosterPng = () => new Promise((resolve, reject) => {
    const svg = buildPosterSvg({ title: tournamentName, dateText, venue, matches: dayMatches });
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = posterHeight;
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

      <div className={`night-poster-preview match-count-${Math.max(1, dayMatches.length)}`} style={{ aspectRatio: `1080 / ${posterHeight}` }}>
        <div className="night-lights left"/><div className="night-lights right"/>
        <div className="night-logo">S&S</div>
        <div className="night-title-small">{tournamentName}</div>
        <div className="night-slogan">KAZANAN SAHADA BELLİ OLUR</div>
        <h1>GECENİN <b>MAÇLARI</b></h1>
        <div className="night-date">📅 {dateText}</div>
        <div className="night-poster-list">
          {dayMatches.map((match, index) => (
            <div className="night-poster-match" key={match?.id || index}><div className="night-poster-time"><strong>{match?.time || "--:--"}</strong><small>{match?.field || "SAHA 1"}</small></div><div className="night-poster-teams"><strong>{match?.home || "TAKIM"}</strong><span>VS</span><strong>{match?.away || "TAKIM"}</strong></div></div>
          ))}
        </div>
        <div className="night-poster-footer"><div><span>📍</span><p><small>MAÇLARIN ADRESİ</small><strong>{venue}</strong></p></div><b>HEYECAN<br/><i>SAHADA!</i></b></div>
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
