export const LANDING_THEMES = [
  { id: "folio", name: "Folio", colors: ["#f5f3ed", "#22211f", "#c63f2b"], subtitle: { ru: "Белая галерея · типографика · красный акцент", en: "White gallery · typography · red accent", ka: "თეთრი გალერეა · ტიპოგრაფია · წითელი აქცენტი" } },
  { id: "grove", name: "Grove", colors: ["#e9eddf", "#193f33", "#d2df95"], subtitle: { ru: "Оливковый · мягкие формы · природные оттенки", en: "Olive · soft shapes · natural tones", ka: "ზეთისხილისფერი · რბილი ფორმები · ბუნებრივი ტონები" } },
  { id: "signal", name: "Signal", colors: ["#214de5", "#eff3ff", "#e0f16c"], subtitle: { ru: "Кобальт · крупный гротеск · чёткая геометрия", en: "Cobalt · bold sans serif · clear geometry", ka: "კობალტისფერი · მსხვილი შრიფტი · მკაფიო გეომეტრია" } },
  { id: "noir", name: "Noir", colors: ["#191b1c", "#eee9dc", "#cbb995"], subtitle: { ru: "Графит · спокойная антиква · тёплое золото", en: "Graphite · quiet serif · warm gold", ka: "გრაფიტისფერი · მშვიდი სერიფი · თბილი ოქრო" } },
  { id: "bloom", name: "Bloom", colors: ["#ede4f6", "#4a285b", "#f28a74"], subtitle: { ru: "Лаванда · коралл · округлые блоки", en: "Lavender · coral · rounded blocks", ka: "ლავანდისფერი · მარჯნისფერი · მომრგვალებული ბლოკები" } },
];
export function currentLandingTheme() {
  const id = location.pathname.match(/^\/designs\/([^/]+)\/?$/)?.[1];
  return LANDING_THEMES.find(theme => theme.id === id) || null;
}
