export const ORIGINAL_THEMES = [
  { id: "folio", name: "Folio", colors: ["#f5f3ed", "#22211f", "#c63f2b"], subtitle: { ru: "Белая галерея · типографика · красный акцент", en: "White gallery · typography · red accent", ka: "თეთრი გალერეა · ტიპოგრაფია · წითელი აქცენტი" } },
  { id: "grove", name: "Grove", colors: ["#e9eddf", "#193f33", "#d2df95"], subtitle: { ru: "Оливковый · мягкие формы · природные оттенки", en: "Olive · soft shapes · natural tones", ka: "ზეთისხილისფერი · რბილი ფორმები · ბუნებრივი ტონები" } },
  { id: "signal", name: "Signal", colors: ["#214de5", "#eff3ff", "#e0f16c"], subtitle: { ru: "Кобальт · крупный гротеск · чёткая геометрия", en: "Cobalt · bold sans serif · clear geometry", ka: "კობალტისფერი · მსხვილი შრიფტი · მკაფიო გეომეტრია" } },
  { id: "noir", name: "Noir", colors: ["#191b1c", "#eee9dc", "#cbb995"], subtitle: { ru: "Графит · спокойная антиква · тёплое золото", en: "Graphite · quiet serif · warm gold", ka: "გრაფიტისფერი · მშვიდი სერიფი · თბილი ოქრო" } },
  { id: "bloom", name: "Bloom", colors: ["#ede4f6", "#4a285b", "#f28a74"], subtitle: { ru: "Лаванда · коралл · округлые блоки", en: "Lavender · coral · rounded blocks", ka: "ლავანდისფერი · მარჯნისფერი · მომრგვალებული ბლოკები" } },
];
export const LANDING_REFINEMENTS = [
  { id: "folio-sans", name: "Folio / Sans", round: 2, colors: ["#f5f3ed", "#252823", "#9a5140"], subtitle: { ru: "Композиция Folio · гротеск Signal · тёплый акцент", en: "Folio composition · Signal typography · warm accent", ka: "Folio-ს კომპოზიცია · Signal-ის შრიფტი · თბილი აქცენტი" } },
  { id: "folio-editorial", name: "Folio / Editorial", round: 2, colors: ["#f2f1eb", "#29372f", "#e1e4da"], subtitle: { ru: "Узкий гротеск · издательская сетка · спокойный зелёный", en: "Narrow sans serif · publisher’s grid · quiet green", ka: "ვიწრო შრიფტი · საგამომცემლო ბადე · მშვიდი მწვანე" } },
  { id: "signal-paper", name: "Signal / Paper", round: 2, colors: ["#f6f5f0", "#25383f", "#315d73"], subtitle: { ru: "Типографика Signal · светлый фон · чернильный синий", en: "Signal typography · light paper · ink blue", ka: "Signal-ის შრიფტი · ღია ფონი · მელნისფერი ლურჯი" } },
  { id: "bloom-linen", name: "Bloom / Linen", round: 2, colors: ["#f1eee6", "#364039", "#e4dacc"], subtitle: { ru: "Мягкость Bloom · Manrope · лён и шалфей", en: "Bloom softness · Manrope · linen and sage", ka: "Bloom-ის რბილი ფორმები · Manrope · სელისფერი და სალბი" } },
];
export const LANDING_THEMES = [...ORIGINAL_THEMES, ...LANDING_REFINEMENTS];
export function currentLandingTheme() {
  const id = location.pathname.match(/^\/designs\/([^/]+)\/?$/)?.[1];
  return LANDING_THEMES.find(theme => theme.id === id) || null;
}
