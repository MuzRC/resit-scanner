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
