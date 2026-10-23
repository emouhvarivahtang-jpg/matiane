export const LANGUAGES = ["en", "ka", "ru"];

export function initialLanguage() {
  const requested = new URLSearchParams(location.search).get("lang");
  if (LANGUAGES.includes(requested)) return requested;
  try {
    const saved = localStorage.getItem("matiane-language");
    if (LANGUAGES.includes(saved)) return saved;
  } catch {}
  return /^ka/.test(navigator.language)
    ? "ka"
    : /^ru/.test(navigator.language)
      ? "ru"
      : "en";
}
