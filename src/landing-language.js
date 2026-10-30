// Public pages default to Georgian without changing the studio's locale logic.
export function initialLandingLanguage() {
  const requested = new URLSearchParams(location.search).get("lang");
  if (["ka", "en", "ru"].includes(requested)) return requested;
  try {
    const saved = localStorage.getItem("matiane-language");
    if (["ka", "en", "ru"].includes(saved)) return saved;
  } catch {}
  return "ka";
}
