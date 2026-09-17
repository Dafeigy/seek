const AVATAR_SATURATION = 68;
const AVATAR_LIGHTNESS = 38;

/**
 * Returns a stable, sufficiently dark color for a user's default avatar.
 *
 * The color is derived from the immutable user id rather than the display
 * name, so renaming a user does not make their avatar look like somebody
 * else's. Using the full hue range avoids the frequent collisions caused by
 * a small fixed palette while keeping the saturation/lightness consistent
 * enough for white initials to remain readable.
 */
export function participantColor(userId: string): string {
  let hash = 0;
  for (const character of userId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue} ${AVATAR_SATURATION}% ${AVATAR_LIGHTNESS}%)`;
}
