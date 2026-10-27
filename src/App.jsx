import { useEffect, useState } from "react";
import { initTeams } from "./teams";
import { STATUS, isSupported, useVoiceEcho } from "./useVoiceEcho";
import "./App.css";

const toBcp47 = (locale = "en-US") => {
  const [l, r] = locale.split("-");
  return r ? `${l.toLowerCase()}-${r.toUpperCase()}` : l.toLowerCase();
};

const STATUS_LABEL = {
  [STATUS.IDLE]: "Tap to start voice",
  [STATUS.CONNECTING]: "Connecting…",
  [STATUS.LISTENING]: "Listening",
  [STATUS.SPEAKING]: "Speaking — talk to interrupt",
  [STATUS.ERROR]: "Something went wrong",
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.3 5.7 13.4 10.6 12 12l6.3 6.3-1.4 1.4L12 13.4l-4.9 6.3-1.4-1.4L10.6 12 5.7 5.7l1.4-1.4L12 10.6l4.9-6.3 1.4 1.4Z" />
    </svg>
  );
}

function HeadphonesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [lang, setLang] = useState(toBcp47(navigator.language));
  const [headphones, setHeadphones] = useState(false);
  const { status, interim, lastHeard, error, level, start, stop } = useVoiceEcho({
    lang,
    headphonesMode: headphones,
  });

  useEffect(() => {
    initTeams(setTheme).then((ctx) => {
      setTheme(ctx.theme);
      setLang(toBcp47(ctx.locale));
    });
  }, []);

  const active =
    status === STATUS.LISTENING || status === STATUS.SPEAKING || status === STATUS.CONNECTING;
  const caption = interim || lastHeard;
  const scale = status === STATUS.LISTENING ? 1 + level * 0.6 : 1;
  const themeClass = theme === "default" ? "light" : theme;

  const toggle = () => (active ? stop() : start());

  return (
    <main className={`voice theme-${themeClass}`}>
      <div className="stage">
        <button
          type="button"
          className={`orb orb-${status}`}
          style={{ "--scale": scale }}
          onClick={toggle}
          aria-label={active ? "End voice" : "Start voice"}
        >
          <span className="orb-glow" />
          <span className="orb-core" />
          {status === STATUS.SPEAKING && (
            <span className="bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
        </button>

        <p className="status" aria-live="polite">
          {STATUS_LABEL[status]}
        </p>
        <p className={`caption ${interim ? "caption-live" : ""} ${error ? "caption-error" : ""}`}>
          {error || caption}
        </p>
        {!isSupported && (
          <p className="hint">
            Voice mode needs the Web Speech API — use Teams on the web in Edge or Chrome.
          </p>
        )}
      </div>

      <footer className="controls">
        <button
          type="button"
          className={`ctrl ${headphones ? "ctrl-on" : ""}`}
          onClick={() => setHeadphones((h) => !h)}
          title="Headphones mode: interrupt instantly on any voice (no speaker echo)"
          aria-pressed={headphones}
          aria-label="Headphones mode"
        >
          <HeadphonesIcon />
        </button>
        <button
          type="button"
          className={`ctrl ctrl-main ${active ? "ctrl-end" : ""}`}
          onClick={toggle}
          aria-label={active ? "End voice" : "Start voice"}
        >
          {active ? <CloseIcon /> : <MicIcon />}
        </button>
        <span className="ctrl ctrl-spacer" aria-hidden="true" />
      </footer>
    </main>
  );
}
