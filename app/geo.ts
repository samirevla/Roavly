/** Shared geo helpers for Near Me (~50 km) discovery. */

export const NEAR_ME_RADIUS_KM = 50;

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type GeoLocated = {
  latitude: number | null;
  longitude: number | null;
};

/** Great-circle distance in kilometres between two WGS84 points. */
export function haversineKm(first: GeoPoint, second: GeoPoint): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(first.lat)) *
      Math.cos(toRadians(second.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function hasCoordinates(item: GeoLocated): item is GeoLocated & {
  latitude: number;
  longitude: number;
} {
  return Number.isFinite(item.latitude) && Number.isFinite(item.longitude);
}

/** Distance from the user to a post, or null when either side lacks coordinates. */
export function distanceFromUserKm(
  user: GeoPoint | null | undefined,
  item: GeoLocated,
): number | null {
  if (!user || !hasCoordinates(item)) return null;
  return haversineKm(user, { lat: item.latitude, lng: item.longitude });
}

/**
 * Keep posts within radiusKm of the user, sorted nearest-first.
 * Posts without usable coordinates are excluded (they never break the UI).
 */
export function filterNearbyPosts<T extends GeoLocated>(
  posts: T[],
  user: GeoPoint | null | undefined,
  radiusKm: number = NEAR_ME_RADIUS_KM,
): Array<T & { distanceFromUserKm: number }> {
  if (!user || !Number.isFinite(user.lat) || !Number.isFinite(user.lng)) return [];
  const radius = Math.max(1, Math.min(500, Number(radiusKm) || NEAR_ME_RADIUS_KM));
  return posts
    .map((post) => {
      const distance = distanceFromUserKm(user, post);
      return distance == null ? null : { ...post, distanceFromUserKm: distance };
    })
    .filter((post): post is T & { distanceFromUserKm: number } => post != null && post.distanceFromUserKm <= radius)
    .sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm);
}
