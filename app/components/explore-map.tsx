"use client";

import { Clock3, LocateFixed, MapPin, Mountain, Route, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
};

export function ExploreMap({
  posts,
  onOpenPost,
  onShareJourney,
}: {
  posts: JourneyMapPost[];
  onOpenPost: (postId: string) => void;
  onShareJourney: () => void;
}) {
  const geotaggedPosts = useMemo(
    () => posts.filter((post) => Number.isFinite(post.latitude) && Number.isFinite(post.longitude)),
    [posts],
  );
  const activities = useMemo(
    () => Array.from(new Set(geotaggedPosts.map((post) => post.activityType))).sort(),
    [geotaggedPosts],
  );
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("All activities");
  const [selectedId, setSelectedId] = useState<string | null>(geotaggedPosts[0]?.id ?? null);
  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapError, setMapError] = useState("");
  const mapHost = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const filteredPosts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return geotaggedPosts.filter((post) => {
      const activityMatches = activity === "All activities" || post.activityType === activity;
      const textMatches =
        !term ||
        [post.location, post.caption, post.activityType, post.authorName]
          .join(" ")
          .toLowerCase()
          .includes(term);
      return activityMatches && textMatches;
    });
  }, [activity, geotaggedPosts, query]);

  const selectedPost =
    filteredPosts.find((post) => post.id === selectedId) ?? filteredPosts[0] ?? null;

  useEffect(() => {
    if (!geotaggedPosts.length || !mapHost.current) return;
    let cancelled = false;

    async function initialiseMap() {
      setMapStatus("loading");
      setMapError("");
      try {
        const { mapId } = await loadGoogleMaps();
        const { Map } = google.maps;
        if (cancelled || !mapHost.current) return;
        mapRef.current = new Map(mapHost.current, {
          center: { lat: -37.8136, lng: 144.9631 },
          zoom: 7,
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
  }, [geotaggedPosts.length]);

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

  function selectPost(post: JourneyMapPost) {
    setSelectedId(post.id);
    const position = { lat: Number(post.latitude), lng: Number(post.longitude) };
    mapRef.current?.panTo(position);
    if ((mapRef.current?.getZoom() ?? 0) < 11) mapRef.current?.setZoom(11);
  }

  if (!geotaggedPosts.length) {
    return (
      <section className="explore-empty">
        <span><MapPin size={34} /></span>
        <h2>Your activity map starts here</h2>
        <p>Share the first journey with a Google location and it will appear on this map for the community to discover.</p>
        <button onClick={onShareJourney}>Share a journey</button>
      </section>
    );
  }

  return (
    <section className="explore-screen">
      <div className="explore-intro">
        <div><span className="eyebrow">Discover the outdoors</span><h2>Find real places through real journeys</h2><p>Select a pin to see what the Roavly community has done there.</p></div>
        <span className="map-count"><LocateFixed size={17} />{geotaggedPosts.length} mapped {geotaggedPosts.length === 1 ? "journey" : "journeys"}</span>
      </div>
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
      <div className="map-stage">
        <div ref={mapHost} className="journey-map" role="region" aria-label="Interactive map of public Roavly journeys" />
        {mapStatus === "loading" && <div className="map-loading"><span className="spin" /><p>Loading activity map…</p></div>}
        {mapStatus === "error" && <div className="map-error" role="alert"><MapPin size={28} /><strong>Map unavailable</strong><p>{mapError}</p><button onClick={() => window.location.reload()}>Try again</button></div>}
        {selectedPost && mapStatus !== "error" && (
          <article className="map-preview" aria-live="polite">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedPost.imageUrl} alt="" />
            <div><span>{selectedPost.activityType}</span><strong>{selectedPost.location}</strong><small>@{selectedPost.authorUsername} · {formatDuration(selectedPost.durationMinutes)} outdoors</small></div>
            <button onClick={() => onOpenPost(selectedPost.id)}>View post</button>
          </article>
        )}
      </div>
      <div className="map-results-heading"><h3>Journeys in this view</h3><span>{filteredPosts.length} {filteredPosts.length === 1 ? "result" : "results"}</span></div>
      {filteredPosts.length ? (
        <div className="map-result-list">
          {filteredPosts.map((post) => (
            <button key={post.id} className={post.id === selectedPost?.id ? "selected" : ""} onClick={() => selectPost(post)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.imageUrl} alt="" />
              <span className="map-result-copy"><small>{post.activityType}</small><strong>{post.location}</strong><em>{post.caption}</em><i><Route size={14} />{formatDistance(post.distanceKm)} <Clock3 size={14} />{formatDuration(post.durationMinutes)} {post.elevationMetres > 0 && <><Mountain size={14} />{post.elevationMetres} m</>}</i></span>
              <MapPin size={19} />
            </button>
          ))}
        </div>
      ) : (
        <div className="map-no-results"><Search size={25} /><p>No mapped journeys match those filters.</p></div>
      )}
    </section>
  );
}

function formatDistance(distance: number) {
  return distance > 0 ? `${distance.toFixed(distance % 1 ? 1 : 0)} km` : "No distance";
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
}
