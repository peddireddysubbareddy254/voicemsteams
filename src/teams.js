import { app } from "@microsoft/teams-js";

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/**
 * Initializes the Teams JS SDK when hosted inside Teams. Resolves with
 * { inTeams, theme, locale } and works standalone in a normal browser too.
 */
export async function initTeams(onThemeChange) {
  const inIframe = window.self !== window.top;
  if (!inIframe) return { inTeams: false, theme: "dark", locale: navigator.language };
  try {
    await withTimeout(app.initialize(), 4000);
    const ctx = await app.getContext();
    app.registerOnThemeChangeHandler((t) => onThemeChange?.(t));
    app.notifySuccess();
    return {
      inTeams: true,
      theme: ctx.app?.theme || "default",
      locale: ctx.app?.locale || navigator.language,
    };
  } catch {
    return { inTeams: false, theme: "dark", locale: navigator.language };
  }
}
