$ErrorActionPreference = "Stop"

$root = Get-Location
$ko = Join-Path $root "src\components\KnockoutDraw.jsx"
$kocss = Join-Path $root "src\components\KnockoutDraw.css"
$pub = Join-Path $root "src\components\PublicTournament.jsx"

foreach ($f in @($ko,$kocss,$pub)) {
  if (!(Test-Path $f)) { throw "Dosya bulunamadi: $f" }
}

function Replace-Once([string]$text,[string]$old,[string]$new,[string]$label) {
  if (-not $text.Contains($old)) { throw "Eslesme bulunamadi: $label" }
  return $text.Replace($old,$new)
}

# ---------- KnockoutDraw.jsx ----------
$t = Get-Content $ko -Raw -Encoding UTF8

$t = Replace-Once $t `
'  const [notice, setNotice] = useState("");
  const drawLoadedRef = useRef(false);' `
'  const [notice, setNotice] = useState("");
  const [knockoutSchedule, setKnockoutSchedule] = useState({});
  const drawLoadedRef = useRef(false);

  const scheduleSlots = [
    ["quarter-0", "ÇF 1"], ["quarter-1", "ÇF 2"], ["quarter-2", "ÇF 3"], ["quarter-3", "ÇF 4"],
    ["semi-0", "YF 1"], ["semi-1", "YF 2"], ["third-place-0", "3.''LÜK"], ["final-0", "FİNAL"],
  ];

  useEffect(() => {
    let mounted = true;
    const loadSchedule = async () => {
      const { data, error } = await supabase.from("app_state").select("value").eq("id", "knockout_schedule_v1").maybeSingle();
      if (!error && mounted) setKnockoutSchedule(data?.value && typeof data.value === "object" ? data.value : {});
    };
    loadSchedule();
    const channel = supabase.channel(`ko-schedule-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_schedule_v1" }, loadSchedule)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  async function updateKnockoutSchedule(slotKey, field, value) {
    const next = {
      ...knockoutSchedule,
      [slotKey]: { ...(knockoutSchedule?.[slotKey] || {}), [field]: value },
    };
    setKnockoutSchedule(next);
    const { error } = await supabase.from("app_state").upsert({
      id: "knockout_schedule_v1",
      value: next,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Eleme tarih/saat kaydedilemedi:", error);
      setNotice("Tarih/saat kaydedilemedi. Tekrar deneyin.");
    }
  }' `
'admin schedule state'

$t = Replace-Once $t `
'    setKnockoutResults([]);

    // Ayrı Eleme Maç Merkezi' `
'    setKnockoutResults([]);
    setKnockoutSchedule({});

    // Ayrı Eleme Maç Merkezi' `
'reset schedule state'

$t = Replace-Once $t `
'        supabase.from("app_state").upsert({ id: "knockout_cards_v1", value: [], updated_at: now }),
        supabase.from("app_state").upsert({
          id: "fixtures_snapshot",' `
'        supabase.from("app_state").upsert({ id: "knockout_cards_v1", value: [], updated_at: now }),
        supabase.from("app_state").upsert({ id: "knockout_schedule_v1", value: {}, updated_at: now }),
        supabase.from("app_state").upsert({
          id: "fixtures_snapshot",' `
'reset cloud schedule'

$t = Replace-Once $t `
'      away: pair[1],
      status: "waiting",' `
'      away: pair[1],
      date: knockoutSchedule?.[`quarter-${index}`]?.date || "",
      time: knockoutSchedule?.[`quarter-${index}`]?.time || "",
      status: "waiting",' `
'quarter active schedule'

$t = Replace-Once $t `
'  async function sendExistingToMatchCenter(source, fallbackKey, fallbackLabel) {
    if (!source?.home || !source?.away) return;
    const activeMatch = {
      ...source,' `
'  async function sendExistingToMatchCenter(source, fallbackKey, fallbackLabel, scheduleKey = fallbackKey) {
    if (!source?.home || !source?.away) return;
    const activeMatch = {
      ...source,
      date: knockoutSchedule?.[scheduleKey]?.date || source.date || "",
      time: knockoutSchedule?.[scheduleKey]?.time || source.time || "",' `
'existing active schedule'

$t = Replace-Once $t `
'      <section className="ko-card ko-bracket-card">
        <div className="ko-section-title"><div><span>04</span><h3>1/8 Final Eşleşmeleri</h3></div>{complete && <small className="done">KURA TAMAMLANDI ✓</small>}</div>' `
'      <section className="ko-card ko-schedule-card">
        <div className="ko-section-title"><div><span>04</span><h3>Eleme Maç Programı</h3></div><small>Tarih ve saati manuel gir</small></div>
        <div className="ko-schedule-grid">
          {scheduleSlots.map(([key, label]) => (
            <div className="ko-schedule-row" key={key}>
              <strong>{label}</strong>
              <label><span>TARİH</span><input type="date" value={knockoutSchedule?.[key]?.date || ""} onChange={(e) => updateKnockoutSchedule(key, "date", e.target.value)} /></label>
              <label><span>SAAT</span><input type="time" value={knockoutSchedule?.[key]?.time || ""} onChange={(e) => updateKnockoutSchedule(key, "time", e.target.value)} /></label>
            </div>
          ))}
        </div>
      </section>

      <section className="ko-card ko-bracket-card">
        <div className="ko-section-title"><div><span>05</span><h3>1/8 Final Eşleşmeleri</h3></div>{complete && <small className="done">KURA TAMAMLANDI ✓</small>}</div>' `
'schedule UI'

# Calls: explicit public slot keys
$t = $t.Replace('sendExistingToMatchCenter(m, `semi-${i+1}`, `Yarı Final ${i+1}`)', 'sendExistingToMatchCenter(m, `semi-${i+1}`, `Yarı Final ${i+1}`, `semi-${i}`)')
$t = $t.Replace('sendExistingToMatchCenter(thirdCloud, "third-place-0", "3.''lük Maçı")', 'sendExistingToMatchCenter(thirdCloud, "third-place-0", "3.''lük Maçı", "third-place-0")')
$t = $t.Replace('sendExistingToMatchCenter(finalCloud, "final-0", "Final")', 'sendExistingToMatchCenter(finalCloud, "final-0", "Final", "final-0")')

Set-Content $ko $t -Encoding UTF8

# ---------- KnockoutDraw.css ----------
$css = Get-Content $kocss -Raw -Encoding UTF8
if (-not $css.Contains(".ko-schedule-grid")) {
$css += @'

/* V30: Eleme tarih/saat manuel program */
.ko-schedule-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.ko-schedule-row{display:grid;grid-template-columns:72px 1fr 1fr;gap:10px;align-items:end;padding:12px;border:1px solid rgba(244,196,0,.2);border-radius:12px;background:#111}
.ko-schedule-row>strong{align-self:center;color:#f4c400;font-size:13px}
.ko-schedule-row label span{display:block;margin-bottom:5px;color:#888;font-size:10px;font-weight:900;letter-spacing:.8px}
.ko-schedule-row input{width:100%;box-sizing:border-box;height:40px;padding:0 9px;border:1px solid #343434;border-radius:9px;background:#0b0b0b;color:#fff;color-scheme:dark}
.ko-schedule-row input:focus{outline:none;border-color:#f4c400}
@media(max-width:700px){.ko-schedule-grid{grid-template-columns:1fr}.ko-schedule-row{grid-template-columns:62px 1fr 1fr}}
@media(max-width:430px){.ko-schedule-row{grid-template-columns:1fr 1fr}.ko-schedule-row>strong{grid-column:1/-1}}
'@
}
Set-Content $kocss $css -Encoding UTF8

# ---------- PublicTournament.jsx ----------
$p = Get-Content $pub -Raw -Encoding UTF8

$p = Replace-Once $p `
'  const [remoteKnockoutDraw, setRemoteKnockoutDraw] = useState([]);
  const [remoteSettings, setRemoteSettings] = useState(null);' `
'  const [remoteKnockoutDraw, setRemoteKnockoutDraw] = useState([]);
  const [remoteKnockoutSchedule, setRemoteKnockoutSchedule] = useState({});
  const [remoteSettings, setRemoteSettings] = useState(null);' `
'public schedule state'

$p = Replace-Once $p `
'.in("id", ["squads", "knockout", "knockout_draw_v1", "knockout_match_center_v1", "active_fixture_ids", "settings", "fixtures_snapshot", "public_match_center"]),' `
'.in("id", ["squads", "knockout", "knockout_draw_v1", "knockout_schedule_v1", "knockout_match_center_v1", "active_fixture_ids", "settings", "fixtures_snapshot", "public_match_center"]),' `
'public fetch schedule'

$p = Replace-Once $p `
'      setRemoteKnockoutDraw(drawPairs);

      const knockoutRow' `
'      setRemoteKnockoutDraw(drawPairs);
      const scheduleRow = stateById.get("knockout_schedule_v1");
      setRemoteKnockoutSchedule(scheduleRow?.value && typeof scheduleRow.value === "object" ? scheduleRow.value : {});

      const knockoutRow' `
'public set schedule'

$p = Replace-Once $p `
'      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_draw_v1" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_match_center_v1" }, refresh)' `
'      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_draw_v1" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_schedule_v1" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.knockout_match_center_v1" }, refresh)' `
'public realtime schedule'

$p = Replace-Once $p `
'  const knockoutKeys = new Set(knockoutMatches.map((m) => m.knockoutKey).filter(Boolean));' `
'  const scheduledKnockoutMatches = knockoutMatches.map((m) => ({
    ...m,
    date: remoteKnockoutSchedule?.[m.knockoutKey]?.date || m.date || "",
    time: remoteKnockoutSchedule?.[m.knockoutKey]?.time || m.time || "",
  }));
  const knockoutKeys = new Set(scheduledKnockoutMatches.map((m) => m.knockoutKey).filter(Boolean));' `
'merge public schedule'

$p = Replace-Once $p `
'    ...knockoutMatches,
  ]);' `
'    ...scheduledKnockoutMatches,
  ]);' `
'use scheduled matches'

# Eleme tab itself must render scheduled objects too
$p = $p.Replace('knockoutMatches.length === 0', 'scheduledKnockoutMatches.length === 0')
$p = $p.Replace('const matches = knockoutMatches.filter((m) => stageText(m) === stage);', 'const matches = scheduledKnockoutMatches.filter((m) => stageText(m) === stage);')

Set-Content $pub $p -Encoding UTF8

Write-Host ""
Write-Host "V30 tamam: Eleme tarih/saat manuel program eklendi." -ForegroundColor Green
Write-Host "Degisen dosyalar:" -ForegroundColor Yellow
Write-Host " - src/components/KnockoutDraw.jsx"
Write-Host " - src/components/KnockoutDraw.css"
Write-Host " - src/components/PublicTournament.jsx"
Write-Host ""
Write-Host "Simdi: npm run build" -ForegroundColor Cyan
