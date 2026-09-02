$ErrorActionPreference = "Stop"

$target = Join-Path (Get-Location) "src\components\CompletedMatches.jsx"
if (!(Test-Path $target)) {
  Write-Host "HATA: Proje ana klasorunde degilsin. src\components\CompletedMatches.jsx bulunamadi." -ForegroundColor Red
  exit 1
}

$content = Get-Content $target -Raw -Encoding UTF8

$startMarker = "  async function reopenMatch() {"
$endMarker = "`n  if (openedIndex !== null && fixtures[openedIndex]) {"

$start = $content.IndexOf($startMarker)
if ($start -lt 0) {
  Write-Host "HATA: reopenMatch fonksiyonu bulunamadi." -ForegroundColor Red
  exit 1
}
$end = $content.IndexOf($endMarker, $start)
if ($end -lt 0) {
  Write-Host "HATA: reopenMatch fonksiyonunun bitisi bulunamadi." -ForegroundColor Red
  exit 1
}

$newFunction = @'
  async function reopenMatch() {
    const match = fixtures[openedIndex];
    if (!match) return;
    if (!window.confirm(`${match.home} - ${match.away} maçı oynanmamış hale getirilsin mi?`)) return;

    const sameFixture = (fixture, index) => {
      if (index === openedIndex) return true;
      if (
        String(fixture?.id ?? "") &&
        String(fixture?.id ?? "") === String(match?.id ?? "")
      ) return true;

      return (
        String(fixture?.home || "") === String(match?.home || "") &&
        String(fixture?.away || "") === String(match?.away || "") &&
        String(fixture?.date || "") === String(match?.date || "") &&
        String(fixture?.time || "") === String(match?.time || "")
      );
    };

    const makeWaiting = (fixture) => ({
      ...fixture,
      homeScore: 0,
      awayScore: 0,
      homePen: "",
      awayPen: "",
      events: [],
      goals: [],
      played: false,
      live: false,
      timerRunning: false,
      timerStartedAt: null,
      elapsedSeconds: 0,
      matchPhase: "waiting",
    });

    const updatedFixtures = fixtures.map((fixture, index) =>
      sameFixture(fixture, index) ? makeWaiting(fixture) : fixture
    );

    const resetId = String(match?.id ?? "");

    if (resetId) {
      localStorage.setItem("sscup-match-center-reopened-reset", resetId);
    }
    localStorage.setItem(
      "sscup-match-center-reopened-reset-signature",
      JSON.stringify({
        id: resetId,
        home: String(match?.home || ""),
        away: String(match?.away || ""),
        date: String(match?.date || ""),
        time: String(match?.time || ""),
      })
    );

    localStorage.removeItem("sscup-match-center-active");
    localStorage.removeItem("sscup-match-center-selected");
    localStorage.removeItem("sscup-live-match");
    clearQueuedFixtureSync(match.id);

    // Ekrani ANINDA oynanmamis yap.
    persist(updatedFixtures);
    rebuildScorers(updatedFixtures);
    setOpenedIndex(null);
    resetDraft();

    try {
      const stamp = new Date().toISOString();

      const { error: markerError } = await supabase.from("app_state").upsert({
        id: "fixture_reopen_reset",
        value: {
          matchId: resetId,
          home: match.home || "",
          away: match.away || "",
          date: match.date || "",
          time: match.time || "",
          updatedAt: stamp,
        },
        updated_at: stamp,
      });
      if (markerError) throw markerError;

      const resetPayload = {
        home_score: 0,
        away_score: 0,
        played: false,
      };

      const { error: fixtureError } = await supabase
        .from("fixtures")
        .update(resetPayload)
        .eq("id", match.id);
      if (fixtureError) throw fixtureError;

      let duplicateReset = supabase
        .from("fixtures")
        .update(resetPayload)
        .eq("home", match.home)
        .eq("away", match.away);

      if (match.date) duplicateReset = duplicateReset.eq("date", match.date);
      if (match.time) duplicateReset = duplicateReset.eq("time", match.time);

      const { error: duplicateError } = await duplicateReset;
      if (duplicateError) throw duplicateError;

      for (const stateId of ["fixture_runtime", "completed_fixture_results"]) {
        const { data, error: readError } = await supabase
          .from("app_state")
          .select("value")
          .eq("id", stateId)
          .maybeSingle();

        if (readError) throw readError;

        const value =
          data?.value &&
          typeof data.value === "object" &&
          !Array.isArray(data.value)
            ? { ...data.value }
            : {};

        delete value[resetId];

        const { error: writeError } = await supabase.from("app_state").upsert({
          id: stateId,
          value,
          updated_at: stamp,
        });
        if (writeError) throw writeError;
      }

      const { error: publicError } = await supabase.from("app_state").upsert({
        id: "public_match_center",
        value: {
          matchId: "",
          home: "",
          away: "",
          updatedAt: stamp,
        },
        updated_at: stamp,
      });
      if (publicError) throw publicError;

      const snapshotFixtures = updatedFixtures
        .filter((fixture) => fixture?.isKnockout !== true)
        .map((fixture, index) =>
          sameFixture(fixture, index) ? makeWaiting(fixture) : fixture
        );

      const { error: snapshotError } = await supabase.from("app_state").upsert({
        id: "fixtures_snapshot",
        value: {
          fixtures: snapshotFixtures,
          updatedAt: stamp,
        },
        updated_at: stamp,
      });
      if (snapshotError) throw snapshotError;
    } catch (error) {
      console.error("Maçı oynanmamışa alma bulut eşitleme hatası:", error);
      alert(
        "Maç bu cihazda oynanmamış yapıldı fakat bulut kaydı başarısız oldu: " +
          (error?.message || "Bilinmeyen hata")
      );
    }
  }
'@

$newContent = $content.Substring(0, $start) + $newFunction + $content.Substring($end)
Set-Content -Path $target -Value $newContent -Encoding UTF8

Write-Host "CompletedMatches.jsx duzeltildi." -ForegroundColor Green

npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "BUILD HATASI - push yapilmadi." -ForegroundColor Red
  exit 1
}

git add src/components/CompletedMatches.jsx
git commit -m "fix: maci yeniden ac kalici oynanmamis yap"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit olusmadi veya degisiklik yok. Push deneniyor..." -ForegroundColor Yellow
}
git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "GIT PUSH HATASI." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "TAMAM: Duzeltme build edildi ve GitHub main'e gonderildi." -ForegroundColor Green
Write-Host "Simdi: npm run dev -- --port 5174" -ForegroundColor Cyan
