import React, { useMemo, useState } from "react";
import "./DailySchedule.css";

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

function escapeXml(value = "") {
  return String(value).replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char]));
}

function fitTeamName(name = "") {
  const text = String(name).trim();
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

function buildPosterSvg({ title, dateText, venue, matches }) {
  const width = 1080;
  const height = 1350;
  const rows = matches.slice(0, 4);
  const rowSvg = Array.from({ length: 4 }, (_, index) => {
    const match = rows[index];
    const y = 555 + index * 145;
    const time = match?.time || "--:--";
    const home = fitTeamName(match?.home || "TAKIM");
    const away = fitTeamName(match?.away || "TAKIM");
    const field = match?.field || match?.pitch || "SAHA 1";
    return `
      <g opacity="${match ? 1 : 0.28}">
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
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <rect width="1080" height="1350" fill="url(#dots)"/>
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
    <rect x="72" y="1165" width="936" height="108" rx="24" fill="#12171e" stroke="#f4c400" stroke-width="2"/>
    <text x="120" y="1210" fill="#ffd21f" font-size="22" font-weight="1000">📍 MAÇLARIN ADRESİ</text>
    <text x="120" y="1248" fill="#ffffff" font-size="31" font-weight="900">${escapeXml(venue)}</text>
    <text x="955" y="1210" text-anchor="end" fill="#ffd21f" font-size="25" font-weight="1000">S&amp;S CUP</text>
    <text x="955" y="1248" text-anchor="end" fill="#ffffff" font-size="20" font-style="italic" font-weight="800">HEYECAN SAHADA!</text>
    <text x="540" y="1320" text-anchor="middle" fill="#7f8997" font-size="16" font-weight="800">S&amp;S CUP • RESMİ MAÇ GÜNÜ PROGRAMI</text>
  </svg>`;
}

export default function DailySchedule({ fixtures = [], settings = {} }) {
  const availableDates = useMemo(() => [...new Set(fixtures.map((m) => m.date).filter(Boolean))].sort(), [fixtures]);
  const [selectedDate, setSelectedDate] = useState(availableDates[0] || new Date().toISOString().split("T")[0]);

  const dayMatches = useMemo(() => fixtures
    .filter((m) => m.date === selectedDate)
    .slice()
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
    .slice(0, 4), [fixtures, selectedDate]);

  const tournamentName = settings.tournamentName || settings.title || "S&S CUP";
  const venue = settings.venue || "GOL PARK HALI SAHA TESİSLERİ • SAHA 1";
  const dateText = formatLongDate(selectedDate);

  const createPosterPng = () => new Promise((resolve, reject) => {
    const svg = buildPosterSvg({ title: tournamentName, dateText, venue, matches: dayMatches });
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1350;
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
        <div><span>GÖRSEL MERKEZİ</span><h2>Gecenin Maçları</h2><p>O gecenin 4 maçını tek profesyonel görsel olarak hazırlar.</p></div>
        <div className="night-admin-actions">
          <label>Tarih<select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>{availableDates.length === 0 && <option value={selectedDate}>{selectedDate}</option>}{availableDates.map((date) => <option key={date} value={date}>{formatLongDate(date)}</option>)}</select></label>
          <button className="night-png-btn" onClick={downloadPoster} disabled={dayMatches.length === 0}>🖼️ PNG Görsel Oluştur</button>
          <button className="night-wa-btn" onClick={sharePosterWhatsApp} disabled={dayMatches.length === 0}>📲 WhatsApp’tan Gönder</button>
        </div>
      </div>

      <div className="night-poster-preview">
        <div className="night-lights left"/><div className="night-lights right"/>
        <div className="night-logo">S&S</div>
        <div className="night-title-small">{tournamentName}</div>
        <div className="night-slogan">KAZANAN SAHADA BELLİ OLUR</div>
        <h1>GECENİN <b>MAÇLARI</b></h1>
        <div className="night-date">📅 {dateText}</div>
        <div className="night-poster-list">
          {Array.from({ length: 4 }, (_, index) => {
            const match = dayMatches[index];
            return <div className={`night-poster-match ${!match ? "empty" : ""}`} key={match?.id || index}><div className="night-poster-time"><strong>{match?.time || "--:--"}</strong><small>{match?.field || "SAHA 1"}</small></div><div className="night-poster-teams"><strong>{match?.home || "TAKIM"}</strong><span>VS</span><strong>{match?.away || "TAKIM"}</strong></div></div>;
          })}
        </div>
        <div className="night-poster-footer"><div><span>📍</span><p><small>MAÇLARIN ADRESİ</small><strong>{venue}</strong></p></div><b>HEYECAN<br/><i>SAHADA!</i></b></div>
      </div>
    </div>
  );
}
