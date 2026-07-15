// Manual light/dark/auto theme toggle. "Auto" defers to the OS/browser
// preference via the @media (prefers-color-scheme) rules in index.html's
// <style> block; an explicit "light"/"dark" choice sets data-theme on <html>,
// which wins over the media query in both directions (CSS attribute-selector
// specificity beats a bare :root rule inside @media, see index.html).
//
// The stored choice is also applied by a small inline script at the very top
// of <head> (before <style> and before first paint) so a returning visitor
// with an explicit light/dark choice never sees a flash of the wrong theme.
// This module re-applies the same logic on load (harmless/idempotent) and
// then owns the toggle button's click-to-cycle behaviour and label.

export const THEME_KEY = "rwb.theme";
const THEMES = ["auto", "light", "dark"];
const LABELS = { auto: "Auto", light: "Light", dark: "Dark" };
// Text glyphs only — no external icon assets, offline-first constraint.
const ICONS = { auto: "◐", light: "☀", dark: "☾" };

export function getStoredTheme() {
  const value = localStorage.getItem(THEME_KEY);
  return THEMES.includes(value) ? value : "auto";
}

// Exported so the pre-paint inline script's logic can be unit-tested in one
// place (the inline script itself is a thin, untestable copy of this).
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  } else {
    root.removeAttribute("data-theme");
    root.style.colorScheme = "light dark";
  }
}

function updateToggleUI(button, theme) {
  const icon = button.querySelector(".theme-toggle-icon");
  const label = button.querySelector(".theme-toggle-label");
  if (icon) icon.textContent = ICONS[theme];
  if (label) label.textContent = LABELS[theme];
  button.setAttribute("aria-label", `Colour theme: ${LABELS[theme]}. Tap to change.`);
  button.title = `Theme: ${LABELS[theme]} (tap to cycle)`;
}

export function initThemeToggle() {
  const button = document.getElementById("theme-toggle");
  if (!button) return;

  let theme = getStoredTheme();
  applyTheme(theme);
  updateToggleUI(button, theme);

  button.addEventListener("click", () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    updateToggleUI(button, theme);
  });
}
