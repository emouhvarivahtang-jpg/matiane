export function wrapText(text, width, size, measure) {
  const lines = []; let line = '', measured = 0;
  for (const char of text) {
    if (char === '\n') { lines.push(line); line = ''; measured = 0; continue; }
    const length = measure(char, size);
    if (measured + length > width && line) {
      if (char === ' ') { lines.push(line.trimEnd()); line = ''; measured = 0; continue; }
      const space = line.lastIndexOf(' ');
      if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); measured = [...line].reduce((sum, c) => sum + measure(c, size), 0); }
      else { lines.push(line); line = ''; measured = 0; }
    }
    line += char; measured += length;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
export function fitCaption(text, requestedSize, measure) {
  const width = 124 * 72 / 25.4, height = 24 * 72 / 25.4;
  let size = requestedSize, lines = wrapText(text, width, size, measure);
  while (lines.length * size * 1.45 > height && size > .1) { size = Math.max(.1, size - .5); lines = wrapText(text, width, size, measure); }
  return { size, lines };
}
export function browserCaption(page) {
  const ctx = document.createElement('canvas').getContext('2d');
  return fitCaption(page.caption, page.fontSize, (char, size) => {
    const family = /[\u10A0-\u10FF\u1C90-\u1CBF]/.test(char) ? 'Noto Georgian' : page.font === 'serif' ? 'Noto Serif' : 'Noto Sans';
    ctx.font = `${size}px "${family}"`; return ctx.measureText(char).width;
  });
}
