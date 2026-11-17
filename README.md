# 🎙️ DJSinatra

Instrumental MP3 player that plays in **VLC** on every device — TV, PC, tablet and phone.
It's a website you can also **install as an app** (no app store needed), hosted free on GitHub Pages.

## What it does
- 🎵 Library of instrumentals — **MP3 only** (anything else is rejected)
- 🟠 **VLC is the default player**
  - Android phone / tablet / Android TV / Fire TV → opens straight in the VLC app
  - iPhone / iPad → opens in *VLC for Mobile*
  - Windows / Mac → downloads a tiny `.m3u` playlist that opens in VLC
  - Any TV running VLC → 🔗 *Copy link* → VLC → *Open Network Stream*
  - **Play all in VLC** sends the whole library as one playlist
- ▶ Built-in player as a backup (switch in ⚙ Settings)
- ⬇ Download any MP3
- ⤒ Upload MP3s from any device (saved on that device), or **Publish to GitHub** so every device gets them
- 📲 *Install app* button (Android, Chrome/Edge on PC; on iPhone: Share → Add to Home Screen)
- 📺 TV-remote friendly (arrow keys / D-pad move between songs)

## Put it on GitHub (one-time, ~5 minutes, all in the browser)
1. Sign in at **github.com** → **+** → **New repository** → name it `DJSinatra` → **Public** → **Create repository**.
2. Click **uploading an existing file**, then drag in **everything inside this `DJSinatra` folder**
   (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `tracks.json`, and the `icons`, `tools` folders) → **Commit changes**.
3. The `.github` folder is hidden from drag-and-drop on Windows, so create it by hand:
   **Add file → Create new file**, name it `.github/workflows/deploy.yml`, paste the contents of
   `.github/workflows/deploy.yml` from this folder → **Commit changes**.
4. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Upload your music: open the `tracks` folder on GitHub → **Add file → Upload files** → drag MP3s in
   (max 25 MB each, 100 files per upload) → **Commit**.
6. Wait ~1 minute (watch the **Actions** tab). Your app is live at
   **`https://<your-username>.github.io/DJSinatra/`** — open that link on your TV, PC, tablet and phone.

Every time you add MP3s to `tracks/`, the site rebuilds itself automatically.
Inside the app, **☁ Publish to GitHub** takes you straight to that upload page.

## 📺 Android app (APK) — Chromecast with Google TV, Android TV, Fire TV, phones
GitHub builds the APK automatically (see `.github/workflows/android.yml`). Newest version, always:
**https://github.com/ajg1915/DJSinatra/releases/latest/download/DJSinatra.apk**

Install on a **Chromecast with Google TV** (or Google TV Streamer):
1. Install **VLC** from the Google TV app store.
2. Install the free **Downloader** app (by AFTVnews) from the store.
3. Turn on developer mode: **Settings → System → About → Android TV OS build** — click it 7 times.
4. **Settings → Apps → Security & restrictions → Unknown sources** → turn on **Downloader**.
5. Open Downloader, type the APK link above, download, and tap **Install**.
6. DJSinatra appears in your apps row. Pick a song → it plays in VLC.

**Auto-updates — you never reinstall:**
- **New songs:** the app loads the live website, so songs you add to `tracks/` show up on their own
  (when you reopen the app, and every 5 minutes while it's open).
- **New app versions:** on start-up the app checks GitHub Releases; if a newer APK exists it asks
  *"Update available → Install"*. The first time, Android asks you to allow installs from DJSinatra.

Every APK is signed with the permanent key in the `ANDROID_SIGNING` repo secret (kept outside this repo,
in `DJSinatra-signing-key`). Don't lose it — a different key means updates can't install over the old app.
(The original puck-style Chromecasts without a remote can't install apps — use the website and *Cast* instead.)

## Each device, once
Install the free **VLC** app: Google Play / Amazon (Fire TV) / App Store / videolan.org (PC & Mac).
On a PC, the first time you open a `.m3u`, choose **VLC** and tick *Always use this app*.

## Test it on this PC
```powershell
powershell -ExecutionPolicy Bypass -File tools\update-tracks.ps1   # rebuild the track list
powershell -ExecutionPolicy Bypass -File tools\serve.ps1           # then open http://localhost:8080
```

## ⚠️ About the music
A public GitHub repo/site lets **anyone** stream and download the files. Only publish instrumentals
you made or have the rights to share — commercial karaoke/backing tracks can get the repo taken down
under a DMCA notice. For a private library, keep the songs in the app's on-device upload instead.
