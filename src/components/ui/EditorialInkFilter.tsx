/** Shared SVG definition: remove Flow's dark matte while retaining the silver artwork. */
export function EditorialInkFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", pointerEvents: "none" }}>
      <defs>
        <filter id="lexopen-editorial-cutout" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            1.063 3.576 .361 0 -.75
          " />
        </filter>
      </defs>
    </svg>
  );
}
