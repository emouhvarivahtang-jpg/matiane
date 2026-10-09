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
export const LEGACY_FONT_CATALOG = [
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

export const FONT_CATALOG = [
  {
    regularItalic: "Matiane-montserrat-RegularItalic",
    boldItalic: "Matiane-montserrat-BoldItalic",
    regular: "Matiane-montserrat-Regular",
    bold: "Matiane-montserrat-Bold",
    id: "montserrat",
    name: "Montserrat",
    family: "Matiane Latin montserrat",
    serif: false,
  },
  {
    regular: "Matiane-manrope-Regular",
    bold: "Matiane-manrope-Bold",
    id: "manrope",
    name: "Manrope",
    family: "Matiane Latin manrope",
    serif: false,
  },
  {
    regularItalic: "Matiane-lora-RegularItalic",
    boldItalic: "Matiane-lora-BoldItalic",
    regular: "Matiane-lora-Regular",
    bold: "Matiane-lora-Bold",
    id: "lora",
    name: "Matiane Book Serif",
    family: "Matiane Latin lora",
    serif: true,
  },
  {
    regularItalic: "Matiane-cormorantgaramond-RegularItalic",
    boldItalic: "Matiane-cormorantgaramond-BoldItalic",
    regular: "Matiane-cormorantgaramond-Regular",
    bold: "Matiane-cormorantgaramond-Bold",
    id: "cormorantgaramond",
    name: "Cormorant Garamond",
    family: "Matiane Latin cormorantgaramond",
    serif: true,
  },
  {
    regularItalic: "Matiane-playfairdisplay-RegularItalic",
    boldItalic: "Matiane-playfairdisplay-BoldItalic",
    regular: "Matiane-playfairdisplay-Regular",
    bold: "Matiane-playfairdisplay-Bold",
    id: "playfairdisplay",
    name: "Matiane Display",
    family: "Matiane Latin playfairdisplay",
    serif: true,
  },
  {
    bold: "Matiane-ptserif-Bold",
    boldItalic: "Matiane-ptserif-BoldItalic",
    regularItalic: "Matiane-ptserif-RegularItalic",
    regular: "Matiane-ptserif-Regular",
    id: "ptserif",
    name: "PT Serif",
    family: "Matiane Latin ptserif",
    serif: true,
  },
  {
    regularItalic: "Matiane-alegreya-RegularItalic",
    boldItalic: "Matiane-alegreya-BoldItalic",
    regular: "Matiane-alegreya-Regular",
    bold: "Matiane-alegreya-Bold",
    id: "alegreya",
    name: "Alegreya",
    family: "Matiane Latin alegreya",
    serif: true,
  },
  {
    regular: "Matiane-caveat-Regular",
    bold: "Matiane-caveat-Bold",
    id: "caveat",
    name: "Caveat",
    family: "Matiane Latin caveat",
    serif: false,
  },
  {
    regular: "Matiane-marckscript-Regular",
    id: "marckscript",
    name: "Marck Script",
    family: "Matiane Latin marckscript",
    serif: false,
  },
  {
    regular: "Matiane-badscript-Regular",
    id: "badscript",
    name: "Bad Script",
    family: "Matiane Latin badscript",
    serif: false,
  },
];

export const GEORGIAN_FONT_CATALOG = [
  {
    id: "bpg-ingiri",
    name: "BPG Ingiri",
    regular: "BPG-ingiri",
    family: "GE BPG Ingiri",
  },
  {
    id: "bpg-algeti",
    name: "BPG Algeti",
    regular: "BPG-algeti",
    family: "GE BPG Algeti",
  },
  {
    id: "bpg-glaho",
    name: "BPG Glaho",
    regular: "BPG-glaho",
    family: "GE BPG Glaho",
  },
  {
    id: "bpg-chveulebrivi",
    name: "BPG Chveulebrivi",
    regular: "BPG-chveulebrivi",
    family: "GE BPG Chveulebrivi",
  },
  {
    id: "bpg-elite",
    name: "BPG Elite",
    regular: "BPG-elite",
    family: "GE BPG Elite",
  },
  {
    id: "bpg-nino",
    name: "BPG Nino Medium",
    regular: "BPG-nino",
    family: "GE BPG Nino Medium",
  },
  {
    id: "bpg-nino-condensed",
    name: "BPG Nino Condensed",
    regular: "BPG-nino-condensed",
    family: "GE BPG Nino Condensed",
  },
  {
    id: "bpg-courier",
    name: "BPG Courier",
    regular: "BPG-courier",
    family: "GE BPG Courier",
  },
  {
    id: "bpg-serif",
    name: "BPG Serif",
    regular: "BPG-serif",
    family: "GE BPG Serif",
  },
  {
    id: "bpg-serif-modern",
    name: "BPG Serif Modern",
    regular: "BPG-serif-modern",
    family: "GE BPG Serif Modern",
  },
];

export const FONTS = [...FONT_CATALOG, ...LEGACY_FONT_CATALOG].map(
  (font) => font.id,
);
export const GEORGIAN_FONTS = GEORGIAN_FONT_CATALOG.map((font) => font.id);
export const fontDefinition = (id) =>
  [...FONT_CATALOG, ...LEGACY_FONT_CATALOG].find((font) => font.id === id) ||
  FONT_CATALOG[0];
export const georgianDefinition = (id) =>
  GEORGIAN_FONT_CATALOG.find((font) => font.id === id);
export const isGeorgian = (char) =>
  /[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/u.test(char);
export function fontName(
  id,
  bold,
  georgian,
  italic = false,
  georgianId = null,
) {
  const selected = fontDefinition(id);
  const font = georgian
    ? georgianDefinition(georgianId) || {
        regular:
          selected.georgianRegular ||
          (selected.serif
            ? "NotoSerifGeorgian-Regular"
            : "NotoSansGeorgian-Regular"),
        bold:
          selected.georgianBold ||
          (selected.serif ? "NotoSerifGeorgian-Bold" : "NotoSansGeorgian-Bold"),
      }
    : selected;
  const weight = bold ? "bold" : "regular";
  return (italic && font[weight + "Italic"]) || font[weight] || font.regular;
}
export const fallbackFontName = (id, bold, georgian) => {
  const font = LEGACY_FONT_CATALOG.find(
    (f) => f.id === (fontDefinition(id).serif ? "serif" : "sans"),
  );
  return font[
    georgian
      ? bold
        ? "georgianBold"
        : "georgianRegular"
      : bold
        ? "bold"
        : "regular"
  ];
};
export const fontAssets = (id, bold, italic = false, georgianId = null) => [
  ...new Set(
    [false, true].flatMap((georgian) => [
      fontName(id, bold, georgian, italic, georgianId),
      fallbackFontName(id, bold, georgian),
    ]),
  ),
];
