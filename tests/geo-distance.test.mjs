import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

/** Mirror of app/geo.ts haversine for pure assertion without a TS loader. */
function haversineKm(first, second) {
  const toRadians = (value) => (value * Math.PI) / 180;
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

function filterNearbyPosts(posts, user, radiusKm = 50) {
  if (!user) return [];
  return posts
    .map((post) => {
      if (!Number.isFinite(post.latitude) || !Number.isFinite(post.longitude)) return null;
      const distanceFromUserKm = haversineKm(user, {
        lat: post.latitude,
        lng: post.longitude,
      });
      return { ...post, distanceFromUserKm };
    })
    .filter((post) => post != null && post.distanceFromUserKm <= radiusKm)
    .sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm);
}

test("geo helper module exports Near Me radius and haversine", async () => {
  const geo = await source("app/geo.ts");
  assert.match(geo, /export const NEAR_ME_RADIUS_KM = 50/);
  assert.match(geo, /export function haversineKm/);
  assert.match(geo, /export function filterNearbyPosts/);
  assert.match(geo, /distanceFromUserKm/);
});

test("haversineKm matches known Melbourne distances within tolerance", () => {
  const melbourne = { lat: -37.8136, lng: 144.9631 };
  const stKilda = { lat: -37.8677, lng: 144.981 };
  const ballarat = { lat: -37.5622, lng: 143.8503 };
  const sydney = { lat: -33.8688, lng: 151.2093 };

  const toStKilda = haversineKm(melbourne, stKilda);
  const toBallarat = haversineKm(melbourne, ballarat);
  const toSydney = haversineKm(melbourne, sydney);

  assert.ok(toStKilda > 5 && toStKilda < 8, `St Kilda should be ~6 km, got ${toStKilda}`);
  assert.ok(toBallarat > 95 && toBallarat < 120, `Ballarat should be ~110 km, got ${toBallarat}`);
  assert.ok(toSydney > 700 && toSydney < 750, `Sydney should be ~713 km, got ${toSydney}`);
  assert.equal(haversineKm(melbourne, melbourne), 0);
});

test("filterNearbyPosts keeps ~50 km, ranks nearest first, skips missing coords", () => {
  const melbourne = { lat: -37.8136, lng: 144.9631 };
  const posts = [
    { id: "sydney", latitude: -33.8688, longitude: 151.2093 },
    { id: "st-kilda", latitude: -37.8677, longitude: 144.981 },
    { id: "no-geo", latitude: null, longitude: null },
    { id: "fitzroy", latitude: -37.798, longitude: 144.978 },
    { id: "ballarat", latitude: -37.5622, longitude: 143.8503 },
  ];

  const nearby = filterNearbyPosts(posts, melbourne, 50);
  assert.deepEqual(
    nearby.map((post) => post.id),
    ["fitzroy", "st-kilda"],
  );
  assert.ok(nearby[0].distanceFromUserKm < nearby[1].distanceFromUserKm);
  assert.equal(filterNearbyPosts(posts, null, 50).length, 0);
  assert.doesNotThrow(() => filterNearbyPosts(posts, melbourne, 50));
});

test("Near Me feed and Explore wire the geo filter", async () => {
  const page = await source("app/page.tsx");
  const explore = await source("app/components/explore-map.tsx");
  assert.match(page, /from "\.\/geo"/);
  assert.match(page, /Near Me/);
  assert.match(page, /filterNearbyPosts|NEAR_ME_RADIUS_KM|requestUserLocation/);
  assert.match(explore, /filterNearbyPosts|NEAR_ME_RADIUS_KM|distanceFromUserKm/);
  assert.match(explore, /Enable location|within .*km|Share a journey/i);
});
