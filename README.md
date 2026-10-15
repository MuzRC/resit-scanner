# Pengimbas Resit AI (PWA + Google Cloud Run)

Pakej lengkap aplikasi PWA untuk imbas resit, tukar kepada PDF di telefon pintar, dan ekstrak data menggunakan Google Gemini 2.5 Flash melalui Google Cloud Run (ADC).

---

## Struktur Folder:
- `index.html` : Antaramuka web PWA responsif (kamera, pra-tonton, jadual keputusan).
- `app.js` : Enjin tukar imej ke PDF (jsPDF) & panggilan API backend.
- `manifest.json` : Konfigurasi "Add to Home Screen" PWA.
- `sw.js` : Service worker untuk sokongan offline & syarat install.
- `icon-192.png` & `icon-512.png` : Ikon aplikasi.
- `server/main.py` : Backend FastAPI dengan Google GenAI SDK (Gemini 2.5 Flash).
- `server/requirements.txt` : Senarai pustaka Python.
- `server/Dockerfile` : Skrip kontena sedia untuk Google Cloud Run.

---

## Langkah 1: Hos Frontend di GitHub Pages (Percuma)
1. Cipta repositori baru di GitHub (contoh: `resit-pwa`).
2. Muat naik fail-fail frontend di folder utama (root):
   - `index.html`, `app.js`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`.
3. Masuk ke **Settings > Pages > Branch: main** dan tekan **Save**.
4. Pautan HTTPS PWA anda akan siap dijana (contoh: `https://username.github.io/resit-pwa/`).

---

## Langkah 2: Deploy Backend ke Google Cloud Run
Buka Google Cloud Shell (di konsol Google Cloud) atau terminal komputer:
```bash
cd server
gcloud run deploy resit-api \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated
```
- Sistem Cloud Run akan membina kontena dan memberikan satu URL HTTPS rasmi (contoh: `https://resit-api-xxxxxx-as.a.run.app`).
- Kos penggunaan akan automatik menolak baki kredit Google Cloud anda.

---

## Langkah 3: Sambungkan Frontend & Pasang di Telefon
1. Buka pautan GitHub Pages anda di pelayar Google Chrome telefon.
2. Masukkan URL Cloud Run dari Langkah 2 ke dalam kotak konfigurasi di bahagian atas aplikasi.
3. Tekan menu 3 titik di Chrome > Pilih **"Install app"** atau **"Add to Home screen"**.
4. Ikon ResitAI akan muncul di skrin telefon anda!
