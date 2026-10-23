// Keep both surfaces isolated even if an unrelated stylesheet is ever loaded.
// :where() preserves the existing selector specificity and cascade order.
export function scopeUiStyles() {
  return {
    postcssPlugin: "matiane-independent-surfaces",
    Once(root) {
      const path = root.source?.input.file?.replaceAll("\\", "/") || "";
      const surface = /\/src\/landing\.css$/.test(path)
        ? "landing"
        : /\/src\/(?:styles|studio|fonts)\.css$/.test(path)
          ? "studio"
          : null;
      if (!surface) return;
      const guard = `:where(html[data-surface="${surface}"])`;
      root.walkRules((rule) => {
        // Percentages/from/to belong to keyframes, not document selectors.
        if (
          rule.parent?.type === "atrule" &&
          /keyframes$/.test(rule.parent.name)
        )
          return;
        rule.selectors = rule.selectors.map((selector) => {
          if (selector.startsWith(guard)) return selector;
          if (selector.startsWith(":root"))
            return selector.replace(":root", `:root${guard}`);
          if (/^html(?=[\s.:#\[]|$)/.test(selector))
            return selector.replace(/^html/, `html${guard}`);
          return `${guard} ${selector}`;
        });
      });
    },
  };
}
