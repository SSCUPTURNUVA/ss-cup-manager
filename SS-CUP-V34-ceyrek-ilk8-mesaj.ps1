$ErrorActionPreference="Stop"
$f="src\components\KnockoutMessages.jsx"
if(!(Test-Path $f)){throw "KnockoutMessages.jsx bulunamadi"}
$t=Get-Content $f -Raw -Encoding UTF8

# standings prop
$t=$t.Replace('export default function KnockoutMessages({settings={}}){','export default function KnockoutMessages({settings={},standings=[]}){')

# quarter cards: knockout yerine puan durumundaki ilk 8
$old='...getMatches(k,"quarter").flatMap((m,i)=>m?.home&&m?.away?[{type:"quarter",m,i,team:m.home},{type:"quarter",m,i,team:m.away}]:[]),'
$new='...(standings||[]).slice(0,8).map((row,i)=>({type:"quarter",m:{home:row?.team||row?.name||"",away:""},i,team:row?.team||row?.name||""})).filter(x=>x.team),'
if(!$t.Contains($old)){throw "Ceyrek kart kaynagi bulunamadi"}
$t=$t.Replace($old,$new)

# useMemo dependency
$t=$t.Replace('],[k]);','],[k,standings]);')

# Çeyrek kartında rakip henüz kura çekilmediyse çizgi göster
$t=$t.Replace('<div className="km-vs">🆚 {c.team===c.m.home?c.m.away:c.m.home}</div>','<div className="km-vs">{c.type==="quarter" ? "🏅 Lig sıralaması: İlk 8" : <>🆚 {c.team===c.m.home?c.m.away:c.m.home}</>}</div>')

Set-Content $f $t -Encoding UTF8

$app="src\App.jsx"
$a=Get-Content $app -Raw -Encoding UTF8
$oldApp='return <KnockoutMessages settings={settings} />;'
$newApp='return <KnockoutMessages settings={settings} standings={standings} />;'
if(!$a.Contains($oldApp)){throw "App KnockoutMessages satiri bulunamadi"}
$a=$a.Replace($oldApp,$newApp)
Set-Content $app $a -Encoding UTF8

Write-Host "V34 tamam: Ceyrek Final mesajlari lig puan durumundaki ilk 8'den okunuyor." -ForegroundColor Green
Write-Host "Yari Final / 3.luk / Final eleme sisteminden okunmaya devam ediyor." -ForegroundColor Green
Write-Host "Simdi npm run build" -ForegroundColor Cyan
