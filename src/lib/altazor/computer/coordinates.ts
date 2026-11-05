/** Map a pointer on a fitted, zoomed or scrolled screenshot to the remote pixels. */
export function desktopPoint(pointer: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }, image: { width: number; height: number }) {
  if (![pointer.x, pointer.y, rect.left, rect.top, rect.width, rect.height, image.width, image.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || image.width <= 0 || image.height <= 0 || image.width > 10000 || image.height > 10000) return null;
  const x = (pointer.x - rect.left) / rect.width, y = (pointer.y - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: Math.min(image.width - 1, Math.floor(x * image.width)), y: Math.min(image.height - 1, Math.floor(y * image.height)) };
}
