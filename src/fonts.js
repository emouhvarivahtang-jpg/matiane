// Preserve the original IDs so previously saved books keep their typeface.
const shared = (id, name, regular, bold, serif = false, mono = false) => ({
  id,
  name,
  regular,
  bold,
  georgianRegular: regular,
  georgianBold: bold,
  family: `"${name}", "${serif ? "Noto Serif" : "Noto Sans"}", "${serif ? "Noto Georgian Serif" : "Noto Georgian"}", ${mono ? "monospace" : serif ? "serif" : "sans-serif"}`,
  serif,
});
export const FONT_CATALOG = [
  {
    id: "serif",
    name: "Noto Serif",
    regular: "NotoSerif-Regular",
    bold: "NotoSerif-Bold",
    georgianRegular: "NotoSerifGeorgian-Regular",
    georgianBold: "NotoSerifGeorgian-Bold",
    family: '"Noto Serif", "Noto Georgian Serif", serif',
    serif: true,
  },
  {
    id: "sans",
    name: "Noto Sans",
    regular: "NotoSans-Regular",
    bold: "NotoSans-Bold",
    georgianRegular: "NotoSansGeorgian-Regular",
    georgianBold: "NotoSansGeorgian-Bold",
    family: '"Noto Sans", "Noto Georgian", sans-serif',
  },
  {
    id: "compact",
    name: "Noto Sans Condensed",
    regular: "NotoSans-Condensed",
    bold: "NotoSans-CondensedBold",
    georgianRegular: "NotoSansGeorgian-Condensed",
    georgianBold: "NotoSansGeorgian-CondensedBold",
    family: '"Noto Compact", "Noto Georgian Compact", sans-serif',
  },
  shared("firago", "FiraGO", "FiraGO-Regular", "FiraGO-Bold"),
  shared(
    "dejavu-serif",
    "DejaVu Serif",
    "DejaVuSerif",
    "DejaVuSerif-Bold",
    true,
  ),
  shared("dejavu-sans", "DejaVu Sans", "DejaVuSans", "DejaVuSans-Bold"),
  shared(
    "dejavu-mono",
    "DejaVu Sans Mono",
    "DejaVuSansMono",
    "DejaVuSansMono-Bold",
    false,
    true,
  ),
  shared("free-serif", "FreeSerif", "FreeSerif", "FreeSerifBold", true),
  shared("free-sans", "FreeSans", "FreeSans", "FreeSansBold"),
  shared("free-mono", "FreeMono", "FreeMono", "FreeMonoBold", false, true),
];
export const FONTS = FONT_CATALOG.map((font) => font.id);
export const fontDefinition = (id) =>
  FONT_CATALOG.find((font) => font.id === id) || FONT_CATALOG[0];
export const isGeorgian = (char) =>
  /[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/u.test(char);
export function fontName(id, bold, georgian) {
  const font = fontDefinition(id);
  return font[
    georgian
      ? bold
        ? "georgianBold"
        : "georgianRegular"
      : bold
        ? "bold"
        : "regular"
  ];
}
// Older Unicode fonts have Mkhedruli but not Mtavruli. The same Noto fallback
// is used by the browser and PDF for characters absent from the chosen font.
export const fallbackFontName = (id, bold, georgian) =>
  fontName(fontDefinition(id).serif ? "serif" : "sans", bold, georgian);
export const fontAssets = (id, bold) => [
  ...new Set(
    [false, true].flatMap((georgian) => [
      fontName(id, bold, georgian),
      fallbackFontName(id, bold, georgian),
    ]),
  ),
];
