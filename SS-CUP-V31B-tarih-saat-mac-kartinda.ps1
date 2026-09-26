$ErrorActionPreference="Stop"
$f="src\components\KnockoutDraw.jsx"
$c="src\components\KnockoutDraw.css"
$t=Get-Content $f -Raw -Encoding UTF8

# Ayrı program panelini kaldır
$t=[regex]::Replace($t,'(?s)\s*<section className="ko-card ko-schedule-card">.*?</section>\s*(?=<section className="ko-card ko-bracket-card">)',"`r`n      ",1)
$t=[regex]::Replace($t,'(?s)\r?\n\s*const scheduleSlots = \[.*?\];\r?\n',"`r`n",1)

# Çeyrek: her ko-pair içinde butondan önce
$old='{pair && !completed && <button type="button" className="ko-mc-button" onClick={() => sendQuarterToMatchCenter(index)}>🏟️ Maç Merkezine Al</button>}'
$new=@'
<div className="ko-inline-schedule">
  <label><span>📅 TARİH</span><input type="date" value={knockoutSchedule?.[`quarter-${index}`]?.date || ""} onChange={(e) => updateKnockoutSchedule(`quarter-${index}`, "date", e.target.value)} /></label>
  <label><span>🕘 SAAT</span><input type="time" value={knockoutSchedule?.[`quarter-${index}`]?.time || ""} onChange={(e) => updateKnockoutSchedule(`quarter-${index}`, "time", e.target.value)} /></label>
</div>
{pair && !completed && <button type="button" className="ko-mc-button" onClick={() => sendQuarterToMatchCenter(index)}>🏟️ Maç Merkezine Al</button>}
'@
if(!$t.Contains($old)){throw "Ceyrek hedefi bulunamadi"}
$t=$t.Replace($old,$new)

# Yarı final
$old='{m?.home && m?.away && m?.played !== true && <button type="button" className="ko-mc-button" onClick={() => sendExistingToMatchCenter(m, `semi-${i+1}`, `Yarı Final ${i+1}`, `semi-${i}`)}>🏟️ Maç Merkezine Al</button>}'
$new=@'
<div className="ko-inline-schedule"><label><span>📅 TARİH</span><input type="date" value={knockoutSchedule?.[`semi-${i}`]?.date || ""} onChange={(e) => updateKnockoutSchedule(`semi-${i}`, "date", e.target.value)} /></label><label><span>🕘 SAAT</span><input type="time" value={knockoutSchedule?.[`semi-${i}`]?.time || ""} onChange={(e) => updateKnockoutSchedule(`semi-${i}`, "time", e.target.value)} /></label></div>
{m?.home && m?.away && m?.played !== true && <button type="button" className="ko-mc-button" onClick={() => sendExistingToMatchCenter(m, `semi-${i+1}`, `Yarı Final ${i+1}`, `semi-${i}`)}>🏟️ Maç Merkezine Al</button>}
'@
if(!$t.Contains($old)){throw "Yari final hedefi bulunamadi"}
$t=$t.Replace($old,$new)

# 3.lük - tek satırlı mevcut kartta takım bloklarının hemen ardından ekle
$old='<div className="team"><span>{thirdCloud?.away || "YF2 Kaybedeni"}</span></div>{thirdCloud?.home && thirdCloud?.away && thirdCloud?.played !== true'
$new='<div className="team"><span>{thirdCloud?.away || "YF2 Kaybedeni"}</span></div><div className="ko-inline-schedule"><label><span>📅 TARİH</span><input type="date" value={knockoutSchedule?.["third-place-0"]?.date || ""} onChange={(e) => updateKnockoutSchedule("third-place-0", "date", e.target.value)} /></label><label><span>🕘 SAAT</span><input type="time" value={knockoutSchedule?.["third-place-0"]?.time || ""} onChange={(e) => updateKnockoutSchedule("third-place-0", "time", e.target.value)} /></label></div>{thirdCloud?.home && thirdCloud?.away && thirdCloud?.played !== true'
if(!$t.Contains($old)){throw "Ucunculuk hedefi bulunamadi"}
$t=$t.Replace($old,$new)

# Final
$old='<div className="team"><span>{finalCloud?.away || "YF2 Kazananı"}</span></div>{finalCloud?.home && finalCloud?.away && finalCloud?.played !== true'
$new='<div className="team"><span>{finalCloud?.away || "YF2 Kazananı"}</span></div><div className="ko-inline-schedule"><label><span>📅 TARİH</span><input type="date" value={knockoutSchedule?.["final-0"]?.date || ""} onChange={(e) => updateKnockoutSchedule("final-0", "date", e.target.value)} /></label><label><span>🕘 SAAT</span><input type="time" value={knockoutSchedule?.["final-0"]?.time || ""} onChange={(e) => updateKnockoutSchedule("final-0", "time", e.target.value)} /></label></div>{finalCloud?.home && finalCloud?.away && finalCloud?.played !== true'
if(!$t.Contains($old)){throw "Final hedefi bulunamadi"}
$t=$t.Replace($old,$new)

Set-Content $f $t -Encoding UTF8

$css=Get-Content $c -Raw -Encoding UTF8
if(!$css.Contains("V31B:")){
$css += @'

/* V31B: tarih/saat ilgili mac kartinin icinde */
.ko-inline-schedule{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 8px;padding-top:9px;border-top:1px solid rgba(244,196,0,.16)}
.ko-inline-schedule label span{display:block;margin:0 0 4px;color:#9a9a9a;font-size:9px;font-weight:900;letter-spacing:.7px}
.ko-inline-schedule input{width:100%;box-sizing:border-box;height:36px;padding:0 8px;border:1px solid #343434;border-radius:8px;background:#0b1628;color:#fff;color-scheme:dark;font-size:12px}
.ko-inline-schedule input:focus{outline:none;border-color:#f4c400}
@media(max-width:430px){.ko-inline-schedule{gap:6px}.ko-inline-schedule input{height:34px;font-size:11px}}
'@
Set-Content $c $css -Encoding UTF8
}
Write-Host "V31B tamam." -ForegroundColor Green
Write-Host "Simdi npm run build" -ForegroundColor Cyan
