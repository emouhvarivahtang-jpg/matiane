import React, { useState } from "react";

export const photoThumbnail = (photo) =>
  photo.thumbnail ||
  (photo.src.startsWith("/api/photos/")
    ? photo.src + "?thumbnail=1"
    : photo.src);

export const photoPreview = (photo) =>
  photo.src.startsWith("/api/photos/") ? photo.src + "?preview=1" : photo.src;

// The screen copy never replaces photo.src: exports and print-quality checks
// continue to use the original bytes and dimensions.
export function PhotoImage({ photo, tiny, style }) {
  const source = tiny ? photoThumbnail(photo) : photoPreview(photo);
  const [ready, setReady] = useState(null);
  const [failed, setFailed] = useState(null);
  const displayed = failed === source ? photo.src : source;
  const loaded = tiny || ready === displayed;
  return (
    <img
      src={displayed}
      alt={photo.name}
      draggable={false}
      loading={tiny ? "lazy" : "eager"}
      decoding="async"
      fetchPriority={tiny ? "low" : "high"}
      data-ready={loaded}
      onLoad={async (event) => {
        const element = event.currentTarget;
        if (!tiny) {
          try {
            await element.decode();
          } catch {
            return;
          }
        }
        if (element.isConnected && element.getAttribute("src") === displayed)
          setReady(displayed);
      }}
      onError={() => displayed !== photo.src && setFailed(source)}
      style={{
        ...style,
        opacity: loaded ? 1 : 0,
        transition: tiny ? undefined : "opacity 160ms ease",
      }}
    />
  );
}
