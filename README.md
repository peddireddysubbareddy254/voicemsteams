# Voice Echo — Microsoft Teams voice-mode app

A voice-only Teams personal tab, styled like ChatGPT / Gemini voice mode:

- **Tap the orb** (or the mic button) to start a hands-free voice session.
- **Speak** — when you pause, the app speaks your words back to you.
- **Barge-in** — start talking while it's speaking and it stops immediately and listens.
- Tap the red ✕ to end the session.

Built with React + Vite, the [Teams JS SDK](https://www.npmjs.com/package/@microsoft/teams-js), the browser
Web Speech API (`SpeechRecognition`) and `speechSynthesis`. No backend is needed.

## How barge-in works

Recognition stays running continuously, even while the app is speaking:

1. **Transcript-based (default)** – as soon as an interim transcript arrives that is *not* an echo of what
   the app is currently saying (word-overlap check), speech is cancelled. Works with speakers.
2. **Headphones mode** (headphones button) – also interrupts on raw microphone voice energy (~180 ms), which
   is faster but would trigger on speaker echo, so only enable it when using a headset.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/useVoiceEcho.js` | Voice engine: continuous recognition, TTS, echo filtering, barge-in, mic level meter |
| `src/App.jsx` / `src/App.css` | Voice-only UI (animated orb, live caption, controls, Teams themes) |
| `src/teams.js` | Teams SDK init, theme + locale |
| `appPackage/manifest.template.json` | Teams manifest (static tab, `devicePermissions: media`) |
| `scripts/package-teams.mjs` | Generates icons and the Teams app zip |

## Run locally

```powershell
npm install
npm run dev          # https://localhost:5173 (self-signed cert)
```

Open `https://localhost:5173` once in your browser and accept the certificate warning, otherwise Teams
cannot load the tab.

## Sideload into Teams

1. Build the package for the host that serves the app:
   ```powershell
   # local dev
   npm run package:teams
   # or a tunnel / deployed host
   $env:TAB_DOMAIN="abc123-5173.inc1.devtunnels.ms"; npm run package:teams
   ```
   Output: `appPackage/build/teams-voice-app.zip`.
2. In Teams: **Apps → Manage your apps → Upload an app → Upload a custom app** and pick the zip
   (custom app upload must be enabled by your tenant admin).
3. Open **Voice Echo** and allow microphone access when prompted.

To expose the dev server publicly use a dev tunnel, e.g.
`devtunnel host -p 5173 --protocol https --allow-anonymous`, then package with that hostname.

## Deploy

`npm run build` produces static files in `dist/` — host them on any HTTPS static host (Azure Static Web Apps,
Azure Storage static website, etc.) and package with `TAB_DOMAIN` set to that host.

## Client support

Speech recognition relies on the browser's Web Speech API:

| Client | Status |
| --- | --- |
| Teams on the web in **Edge** or **Chrome** | ✅ Supported |
| Teams desktop / mobile | ⚠️ The embedded webview may not expose a working speech recognition service; the app shows an error message in that case |

For full desktop/mobile support, swap the recognizer in `useVoiceEcho.js` for the
[Azure AI Speech SDK](https://learn.microsoft.com/azure/ai-services/speech-service/) (same state machine).
