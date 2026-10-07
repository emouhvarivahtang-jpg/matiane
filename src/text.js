import { captionBox } from "./model";
export const fontFamily = (font) =>
  font === "serif"
    ? '"Noto Serif", "Noto Georgian Serif", serif'
    : font === "compact"
      ? '"Noto Compact", "Noto Georgian Compact", sans-serif'
      : '"Noto Sans", "Noto Georgian", sans-serif';
export function fontName(font, bold, georgian) {
  const base = georgian
    ? font === "serif"
      ? "NotoSerifGeorgian"
      : font === "compact"
        ? "NotoSansGeorgian-Condensed"
        : "NotoSansGeorgian"
    : font === "serif"
      ? "NotoSerif"
      : font === "compact"
        ? "NotoSans-Condensed"
        : "NotoSans";
  return base.includes("Condensed")
    ? base + (bold ? "Bold" : "")
    : base + (bold ? "-Bold" : "-Regular");
}
export function wrapText(text, width, size, measure) {
  const lines = [];
  let line = "",
    measured = 0;
  for (const char of text) {
    if (char === "\n") {
      lines.push(line);
      line = "";
      measured = 0;
      continue;
    }
    const length = measure(char, size);
    if (measured + length > width && line) {
      if (char === " ") {
        lines.push(line.trimEnd());
        line = "";
        measured = 0;
        continue;
      }
      const space = line.lastIndexOf(" ");
      if (space > 0) {
        lines.push(line.slice(0, space));
        line = line.slice(space + 1);
        measured = [...line].reduce((sum, c) => sum + measure(c, size), 0);
      } else {
        lines.push(line);
        line = "";
        measured = 0;
      }
    }
    line += char;
    measured += length;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
export function fitCaption(
  text,
  requestedSize,
  measure,
  box = { w: 124, h: 24 },
) {
  const width = (box.w * 72) / 25.4,
    height = (box.h * 72) / 25.4;
  let size = requestedSize,
    lines = wrapText(text, width, size, measure);
  while (lines.length * size * 1.45 > height && size > 0.1) {
    size = Math.max(0.1, size - 0.5);
    lines = wrapText(text, width, size, measure);
  }
  return { size, lines };
}
export function browserCaption(page) {
  const ctx = document.createElement("canvas").getContext("2d");
  return fitCaption(
    page.caption,
    page.fontSize,
    (char, size) => {
      ctx.font = `${page.italic ? "italic " : ""}${page.bold ? "700" : "400"} ${size}px ${fontFamily(page.font)}`;
      return ctx.measureText(char).width;
    },
    captionBox(page),
  );
}
