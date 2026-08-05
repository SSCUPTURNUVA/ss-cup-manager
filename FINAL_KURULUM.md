# S&S CUP Manager v1.0 Final

## Windows geliştirme testi
```powershell
npm install
npm run dev -- --host --port 5174
```

## Windows EXE oluşturma
```powershell
npm install
npm run dist:win
```
Kurulum dosyası `release` klasöründe oluşur.

## Telefonda bilgisayardan bağımsız kullanım
PWA'nın bağımsız çalışması için `dist` klasörünü HTTPS sunan bir yere yayınlayın (GitHub Pages, Vercel veya Netlify).

```powershell
npm run build
```
Ardından siteyi telefonda açın ve tarayıcı menüsünden **Ana ekrana ekle / Uygulamayı yükle** seçeneğini kullanın.

> Supabase çevrimiçi senkronizasyonu internet gerektirir. PWA arayüzü önbellekten açılabilir; canlı ortak veri için internet gerekir.

## GitHub'a ilk yükleme
```powershell
git init
git add .
git commit -m "S&S CUP Manager v1.0 Final"
git branch -M main
git remote add origin GITHUB_REPO_ADRESI
git push -u origin main
```

`.env` ve `.env.local` dosyalarının GitHub'a gönderilmediğini kontrol edin.
