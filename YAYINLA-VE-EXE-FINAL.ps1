$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== S&S CUP FINAL YAYIN + EXE ===" -ForegroundColor Yellow

if (-not (Test-Path ".\package.json")) {
    Write-Host "HATA: Bu dosyayi proje ana klasorunde calistir." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".\src")) {
    Write-Host "HATA: src klasoru bulunamadi." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[1/4] Web build kontrolu..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD HATASI - GitHub'a gonderilmedi." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[2/4] Calisan FINAL src Git'e hazirlaniyor..." -ForegroundColor Cyan
git add src

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "Git'te yeni src degisikligi yok; mevcut commit gonderilecek." -ForegroundColor DarkYellow
} else {
    git commit -m "release: saha testli canli takip ve disiplin final"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "GIT COMMIT HATASI." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "[3/4] GitHub main'e gonderiliyor..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "GIT PUSH HATASI - EXE build baslatilmadi." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[4/4] Windows EXE hazirlaniyor..." -ForegroundColor Cyan
npm run dist:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "EXE BUILD HATASI." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== TAMAMLANDI ===" -ForegroundColor Green
Write-Host "GitHub push basarili. Vercel yeni main'i yayinlayacak." -ForegroundColor Green

$exeFiles = Get-ChildItem -Path . -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\release\\" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 5

if ($exeFiles) {
    Write-Host ""
    Write-Host "Bulunan EXE:" -ForegroundColor Yellow
    $exeFiles | ForEach-Object { Write-Host $_.FullName -ForegroundColor White }
} else {
    Write-Host "EXE release klasorunde olusmus olmali; dosya listesinde bulunamadi." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "Saha testi icin production telefonda sayfayi bir kez yeniden ac; bundan sonra F5'siz takip et." -ForegroundColor Cyan
