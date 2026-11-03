import React from "react";

// A fixed product view of the Blender model. Native images preserve ordinary
// page scrolling and keep the same presentation on every device.
export function BookPreview({ cover, pages, language }) {
  return (
    <div className="lp-book-viewer">
      <div className="lp-book-scene">
        <img
          className="lp-book-poster"
          src={`/landing/models/card-${cover}-${pages}-${language}.webp`}
          alt=""
          width="1000"
          height="1000"
          loading="lazy"
          decoding="async"
          draggable="false"
        />
      </div>
    </div>
  );
}
