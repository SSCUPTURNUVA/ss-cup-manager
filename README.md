# S&S CUP Manager v1.0 Final

Turnuva yönetimi; lig, puan durumu, gol krallığı, canlı maç merkezi, çeyrek final, yarı final, final, üçüncülük ve manuel penaltı yönetimi.

## Çalıştırma
```bash
npm install
npm run dev -- --host --port 5174
```

## Windows kurulum dosyası
```bash
npm run dist:win
```
Çıktı `release/` klasöründe oluşur.

## Telefon uygulaması (PWA)
GitHub Pages iş akışı hazırdır. GitHub depo ayarlarında `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` isimli Actions secret'larını ekleyin. Pages kaynağını **GitHub Actions** seçin. Yayınlanan siteyi telefonda açıp **Ana ekrana ekle** seçeneğini kullanın.

Ayrıntılı kurulum için `FINAL_KURULUM.md` dosyasına bakın.
