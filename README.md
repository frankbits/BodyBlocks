# Bodyblocks — Kurzleitfaden

---

## 1) Lokal testen

1. Abhängigkeiten installieren:

```powershell
npm install
```

2. Entwickeln / Live‑Reload:

```powershell
npm run dev
# öffne dann http://localhost:5173 (oder Port in Konsole)
```

---

## 2) Produktion‑Build (inkl. Mediapipe‑Assets kopieren):

```powershell
npm run build
```

Hinweis: `npm run build` führt nacheinander `tsc`, `vite build` und danach das Skript `scripts/copy_mediapipe.cjs` aus, das die notwendigen Mediapipe‑Dateien aus `node_modules/@mediapipe/holistic` nach `dist/mediapipe` kopiert.

Das Script liest optional `scripts/copy_mediapipe.config.json` oder Umgebungsvariablen:

- `scripts/copy_mediapipe.config.json` (Beispiel):
  ```json
  {
    "excludes": ["pose_landmark_heavy.tflite"],
    "maxSizeMB": 25
  }
  ```
- Alternativ: ENV VARs
  - `COPY_MEDIAPIPE_EXCLUDES` (Komma‑getrennt)
  - `COPY_MEDIAPIPE_MAX_MB`

Bei Dateien, die größer als `maxSizeMB` sind, bricht das Copy‑Skript am Ende mit Exit‑Code `2` ab.

Oversize‑Test (optional):

```powershell
# Erzeuge temporär eine 30 MiB Datei zum Testen der Größenprüfung
fsutil file createnew node_modules\@mediapipe\holistic\oversize_test.tflite 31457280
npm run build   # erwartet: das Copy‑Script bricht mit Fehler wegen Oversize
Remove-Item node_modules\@mediapipe\holistic\oversize_test.tflite
npm run build   # jetzt sollte der Build wieder erfolgreich laufen
```

---

## 3) Hosting mit Cloudflare Pages

Hosting des Projekts mit Cloudflare Pages:
- [bodyblocks.pages.dev](bodyblocks.pages.dev)
- Max file size: 25 MiB (-> `copy_mediapipe.config.json`)
