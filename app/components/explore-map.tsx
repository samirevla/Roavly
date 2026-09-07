"use client";

import { Clock3, LocateFixed, MapPin, Mountain, Route, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterNearbyPosts, NEAR_ME_RADIUS_KM, type GeoPoint } from "../geo";
import { loadGoogleMaps } from "../google-maps";

export type JourneyMapPost = {
  id: string;
  authorName: string;
  authorUsername: string;
  caption: string;
  activityType: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number;
  durationMinutes: number;
  elevationMetres: number;
  imageUrl: string;
  isOwner?: boolean;
  distanceFromUserKm?: number;
};

export type UserLocationStatus = "idle" | "pending" | "ready" | "denied" | "unavailable";

export function ExploreMap({
  posts,
  onOpenPost,
  onShareJourney,
  userLocation = null,
  locationStatus = "idle",
  onRequestLocation,
  radiusKm = NEAR_ME_RADIUS_KM,
}: {
  posts: JourneyMapPost[];
  onOpenPost: (postId: string) => void;
  onShareJourney: () => void;
  userLocation?: GeoPoint | null;
  locationStatus?: UserLocationStatus;
  onRequestLocation?: () => void;
  radiusKm?: number;
}) {
  const nearbyPosts = useMemo(
    () => filterNearbyPosts(posts, userLocation, radiusKm),
    [posts, radiusKm, userLocation],
  );
  const activities = useMemo(
    () => Array.from(new Set(nearbyPosts.map((post) => post.activityType))).sort(),
    [nearbyPosts],
  );
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("All activities");
  const [selectedId, setSelectedId] = useState<string | null>(nearbyPosts[0]?.id ?? null);
  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapError, setMapError] = useState("");
  const mapHost = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  useEffect(() => {
    if (!selectedId || !nearbyPosts.some((post) => post.id === selectedId)) {
      setSelectedId(nearbyPosts[0]?.id ?? null);
    }
  }, [nearbyPosts, selectedId]);

  const filteredPosts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return nearbyPosts.filter((post) => {
      const activityMatches = activity === "All activities" || post.activityType === activity;
      const textMatches =
        !term ||
        [post.location, post.caption, post.activityType, post.authorName]
          .join(" ")
          .toLowerCase()
          .includes(term);
      return activityMatches && textMatches;
    });
  }, [activity, nearbyPosts, query]);

  const selectedPost =
    filteredPosts.find((post) => post.id === selectedId) ?? filteredPosts[0] ?? null;

  useEffect(() => {
    if (!mapHost.current) return;
    let cancelled = false;

    async function initialiseMap() {
      setMapStatus("loading");
      setMapError("");
      try {
        const { mapId } = await loadGoogleMaps();
        const { Map } = google.maps;
        if (cancelled || !mapHost.current) return;
        mapRef.current = new Map(mapHost.current, {
          center: userLocation
            ? { lat: userLocation.lat, lng: userLocation.lng }
            : { lat: -37.8136, lng: 144.9631 },
          zoom: userLocation ? 10 : 7,
          mapId,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "cooperative",
        });
        setMapStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setMapStatus("error");
        setMapError(error instanceof Error ? error.message : "The activity map could not load.");
      }
    }

    initialiseMap();
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current) return;
    let cancelled = false;

    async function drawMarkers() {
      const { AdvancedMarkerElement, PinElement } = google.maps.marker;
      if (cancelled || !mapRef.current) return;
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];
      if (!filteredPosts.length) return;

      const bounds = new google.maps.LatLngBounds();
      filteredPosts.forEach((post) => {
        const position = { lat: Number(post.latitude), lng: Number(post.longitude) };
        const pin = new PinElement({
          background: post.id === selectedId ? "#087f5b" : "#55b7e8",
          borderColor: "#ffffff",
          glyphColor: "#ffffff",
          scale: post.id === selectedId ? 1.18 : 1,
        });
        const marker = new AdvancedMarkerElement({
          map: mapRef.current,
          position,
          title: `${post.activityType} at ${post.location} by ${post.authorName}`,
          content: pin.element,
          gmpClickable: true,
        });
        marker.addEventListener("gmp-click", () => {
          setSelectedId(post.id);
          mapRef.current?.panTo(position);
        });
        markersRef.current.push(marker);
        bounds.extend(position);
      });
      if (filteredPosts.length === 1) {
        mapRef.current.setCenter(bounds.getCenter());
        mapRef.current.setZoom(13);
      } else {
        mapRef.current.fitBounds(bounds, 52);
      }
    }

    drawMarkers();
    return () => {
      cancelled = true;
    };
  }, [filteredPosts, mapStatus, selectedId]);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || !userLocation) return;
    mapRef.current.panTo({ lat: userLocation.lat, lng: userLocation.lng });
    if ((mapRef.current.getZoom() ?? 0) < 10) mapRef.current.setZoom(10);
  }, [mapStatus, userLocation]);

  function selectPost(post: JourneyMapPost) {
    setSelectedId(post.id);
    const position = { lat: Number(post.latitude), lng: Number(post.longitude) };
    mapRef.current?.panTo(position);
    if ((mapRef.current?.getZoom() ?? 0) < 11) mapRef.current?.setZoom(11);
  }

  const locationReady = locationStatus === "ready" && Boolean(userLocation);
  const hasNearby = nearbyPosts.length > 0;
  const locationBlocked = locationStatus === "denied" || locationStatus === "unavailable";

  return (
    <section className="explore-screen">
      <div className="explore-intro">
        <div>
          <span className="eyebrow">Near Me · within {radiusKm} km</span>
          <h2>Journeys close to you</h2>
          <p>
            {locationStatus === "pending"
              ? "Finding your location so we can surface adventures within about 50 km…"
              : locationBlocked
                ? "Location is needed to show Near Me journeys. You can enable it anytime."
                : hasNearby
                  ? "Nearby pins are ranked closest first. Select one to see what the community has done there."
                  : locationReady
                    ? "Nothing geotagged within about 50 km yet — be the first to share a local journey."
                    : "Allow location to discover outdoor journeys within about 50 km of you."}
          </p>
        </div>
        <span className="map-count"><LocateFixed size={17} />{hasNearby ? `${nearbyPosts.length} nearby` : locationReady ? "0 nearby" : "Near Me"}</span>
      </div>
      {(locationStatus === "pending" || locationBlocked) && (
        <div className={`near-me-banner ${locationBlocked ? "blocked" : ""}`} role="status">
          <LocateFixed size={18} />
          <div>
            <strong>{locationStatus === "pending" ? "Using your location" : "Location unavailable"}</strong>
            <p>
              {locationStatus === "pending"
                ? "Near Me only shows journeys within about 50 km once your position is ready."
                : locationStatus === "denied"
                  ? "Location permission was denied. Enable it in your browser settings, then try again."
                  : "This device could not provide a location. Near Me needs GPS or network location."}
            </p>
          </div>
          {locationBlocked && onRequestLocation ? (
            <button type="button" onClick={onRequestLocation}>Try again</button>
          ) : null}
        </div>
      )}
      {hasNearby && (
        <>
          <nav className="activity-category-strip" aria-label="Explore activity categories">
            {["All activities", ...activities].map((item) => (
              <button key={item} className={activity === item ? "active" : ""} onClick={() => setActivity(item)}>{item === "All activities" ? "For you" : item}</button>
            ))}
          </nav>
          <section className="visual-discovery" aria-label="Visual journey discovery">
            <header><div><span className="eyebrow">COMMUNITY DISCOVERY</span><h3>Places worth getting outside for</h3></div><small>{filteredPosts.length} real {filteredPosts.length === 1 ? "adventure" : "adventures"}</small></header>
            <div className="explore-masonry">
              {filteredPosts.slice(0, 8).map((post, index) => (
                <button key={post.id} className={index % 3 === 0 ? "feature" : ""} onClick={() => onOpenPost(post.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.imageUrl} alt="" />
                  <span><small>{post.activityType}</small><strong>{post.location}</strong><em>by @{post.authorUsername}</em></span>
                </button>
              ))}
            </div>
          </section>
          <div className="map-filters">
            <label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search locations, activities or people" aria-label="Search mapped journeys" /></label>
            <label><SlidersHorizontal size={17} /><select value={activity} onChange={(event) => setActivity(event.target.value)} aria-label="Filter by activity"><option>All activities</option>{activities.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <p className="map-instructions">Use Tab to reach map pins, arrow keys to move between them, and Enter to select.</p>
        </>
      )}
      <div className="map-stage">
        <div ref={mapHost} className="journey-map" role="region" aria-label="Interactive map of public Waymark journeys" />
        {mapStatus === "loading" && <div className="map-loading"><span className="spin" /><p>Loading activity map…</p></div>}
        {mapStatus === "error" && <div className="map-error" role="alert"><MapPin size={28} /><strong>Map unavailable</strong><p>{mapError}</p><button onClick={() => window.location.reload()}>Try again</button></div>}
        {!hasNearby && mapStatus !== "error" && mapStatus !== "loading" && (
          <div className="map-empty-overlay" role="status">
            <span><MapPin size={34} /></span>
            <h2>
              {locationBlocked
                ? "Turn on location for Near Me"
                : locationStatus === "pending"
                  ? "Finding journeys near you"
                  : "No journeys within 50 km"}
            </h2>
            <p>
              {locationBlocked
                ? "Near Me keeps discovery local. Enable location, or share a geotagged journey so neighbours can find it."
                : locationStatus === "pending"
                  ? "Hang tight — we are waiting for your current position."
                  : "Be the first to drop a pin nearby. Journeys without a map location stay in Community, not Near Me."}
            </p>
            {locationBlocked && onRequestLocation ? (
              <button type="button" onClick={onRequestLocation}>Enable location</button>
            ) : (
              <button type="button" onClick={onShareJourney}>Share a journey</button>
            )}
          </div>
        )}
        {selectedPost && mapStatus !== "error" && (
          <article className="map-preview" aria-live="polite">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedPost.imageUrl} alt="" />
            <div><span>{selectedPost.activityType}</span><strong>{selectedPost.location}</strong><small>@{selectedPost.authorUsername} · {formatDuration(selectedPost.durationMinutes)} outdoors</small></div>
            <button onClick={() => onOpenPost(selectedPost.id)}>View post</button>
          </article>
        )}
      </div>
      {hasNearby && (
        <>
          <div className="map-results-heading"><h3>Journeys in this view</h3><span>{filteredPosts.length} {filteredPosts.length === 1 ? "result" : "results"}</span></div>
          {filteredPosts.length ? (
            <div className="map-result-list">
              {filteredPosts.map((post) => (
                <button key={post.id} className={post.id === selectedPost?.id ? "selected" : ""} onClick={() => selectPost(post)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.imageUrl} alt="" />
                  <span className="map-result-copy"><small>{post.activityType}{typeof post.distanceFromUserKm === "number" ? ` · ${formatAway(post.distanceFromUserKm)} away` : ""}</small><strong>{post.location}</strong><em>{post.caption}</em><i><Route size={14} />{formatDistance(post.distanceKm)} <Clock3 size={14} />{formatDuration(post.durationMinutes)} {post.elevationMetres > 0 && <><Mountain size={14} />{post.elevationMetres} m</>}</i></span>
                  <MapPin size={19} />
                </button>
              ))}
            </div>
          ) : (
            <div className="map-no-results"><Search size={25} /><p>No mapped journeys match those filters.</p></div>
          )}
        </>
      )}
    </section>
  );
}

function formatDistance(distance: number) {
  return distance > 0 ? `${distance.toFixed(distance % 1 ? 1 : 0)} km` : "No distance";
}

function formatAway(distance: number) {
  if (distance < 1) return `${Math.max(0.1, distance).toFixed(1)} km`;
  return `${distance.toFixed(distance < 10 && distance % 1 ? 1 : 0)} km`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
}
