import React, { useState } from "react";

export const photoThumbnail = (photo) =>
  photo.thumbnail ||
  (photo.src.startsWith("/api/photos/")
    ? photo.src + "?thumbnail=1"
    : photo.src);

export const photoPreview = (photo) =>
  photo.src.startsWith("/api/photos/")
    ? photo.src + "?preview=1"
    : photo.src;

// The screen copy never replaces photo.src: exports and print-quality checks
// continue to use the original bytes and dimensions.
export function PhotoImage({ photo, tiny, style }) {
  const source = tiny ? photoThumbnail(photo) : photoPreview(photo);
  const [ready, setReady] = useState(null);
  const [failed, setFailed] = useState(null);
  const displayed = failed === source ? photo.src : source;
  const thumbnail = photoThumbnail(photo);
  const placeholder = !tiny && thumbnail !== displayed && ready !== displayed;
  return (
    <>
      {placeholder && (
        <img
          className="photo-placeholder"
          src={thumbnail}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          style={style}
        />
      )}
      <img
        src={displayed}
        alt={photo.name}
        draggable={false}
        loading={tiny ? "lazy" : "eager"}
        decoding="async"
        fetchPriority={tiny ? "low" : "high"}
        onLoad={() => setReady(displayed)}
        onError={() => displayed !== photo.src && setFailed(source)}
        style={{ ...style, opacity: placeholder ? 0 : 1 }}
      />
    </>
  );
}
