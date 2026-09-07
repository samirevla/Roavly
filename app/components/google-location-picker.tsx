"use client";

import { CheckCircle2, LoaderCircle, MapPin, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "../google-maps";

export type SelectedPlace = {
  location: string;
  latitude: string;
  longitude: string;
  placeId: string;
};

export function GoogleLocationPicker({
  value,
  onSelect,
}: {
  value: SelectedPlace | null;
  onSelect: (place: SelectedPlace | null) => void;
}) {
  const autocompleteHost = useRef<HTMLDivElement>(null);
  const previewHost = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let autocomplete: google.maps.places.PlaceAutocompleteElement | null = null;

    async function initialise() {
      setStatus("loading");
      setError("");
      try {
        await loadGoogleMaps();
        const PlaceAutocompleteElement = google.maps.places.PlaceAutocompleteElement;
        if (cancelled || !autocompleteHost.current) return;

        autocomplete = new PlaceAutocompleteElement({
          placeholder: "Search trail, park, mountain or address",
        });
        // Google's mobile autocomplete follows the device theme by default.
        // Waymark uses a light composer, so force the widget and its iPhone
        // full-screen prediction surface to stay light and readable.
        autocomplete.style.colorScheme = "light";
        autocomplete.style.backgroundColor = "#ffffff";
        autocomplete.style.color = "#102019";
        autocomplete.style.border = "0";
        autocomplete.style.borderRadius = "8px";
        autocomplete.style.fontFamily = "inherit";
        autocomplete.style.fontSize = "16px";
        autocomplete.description =
          "Search Google Maps and select the exact place for this public journey.";
        autocomplete.value = value?.location ?? "";
        autocomplete.addEventListener("gmp-select", async (event) => {
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({
              fields: ["id", "displayName", "formattedAddress", "location"],
            });
            if (!place.location || !place.id) {
              throw new Error("Choose a place with a mapped location.");
            }
            const location =
              place.formattedAddress || place.displayName || event.placePrediction.text.toString();
            onSelectRef.current({
              location,
              latitude: String(place.location.lat()),
              longitude: String(place.location.lng()),
              placeId: place.id,
            });
          } catch (selectionError) {
            setError(
              selectionError instanceof Error
                ? selectionError.message
                : "That place could not be selected.",
            );
          }
        });
        autocomplete.addEventListener("gmp-error", () => {
          setError("Google location search is temporarily unavailable.");
        });
        autocompleteHost.current.replaceChildren(autocomplete);
        setStatus("ready");
      } catch (loadError) {
        if (cancelled) return;
        setStatus("error");
        setError(loadError instanceof Error ? loadError.message : "Location search could not load.");
      }
    }

    initialise();
    return () => {
      cancelled = true;
      autocomplete?.remove();
    };
    // The autocomplete is recreated only when an existing selection is cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.placeId]);

  useEffect(() => {
    if (!value || !previewHost.current) return;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    let cancelled = false;

    async function drawPreview() {
      try {
        const { mapId } = await loadGoogleMaps();
        const { Map } = google.maps;
        const { AdvancedMarkerElement } = google.maps.marker;
        if (cancelled || !previewHost.current) return;
        const position = {
          lat: Number(value!.latitude),
          lng: Number(value!.longitude),
        };
        const map = new Map(previewHost.current, {
          center: position,
          zoom: 14,
          mapId,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });
        marker = new AdvancedMarkerElement({
          map,
          position,
          title: value!.location,
        });
      } catch {
        // The selected address remains usable if the optional preview cannot render.
      }
    }

    drawPreview();
    return () => {
      cancelled = true;
      if (marker) marker.map = null;
    };
  }, [value]);

  return (
    <div className="location-picker">
      <div className="location-picker-label">
        <span>Exact location</span>
        <small>Required · powered by Google</small>
      </div>
      {value ? (
        <div className="selected-place">
          <div className="selected-place-map" ref={previewHost} aria-label={`Map preview of ${value.location}`} />
          <div className="selected-place-copy">
            <CheckCircle2 size={19} aria-hidden="true" />
            <span><strong>Location selected</strong><small>{value.location}</small></span>
            <button type="button" onClick={() => onSelect(null)} aria-label="Choose a different location">
              <RotateCcw size={16} /> Change
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={`google-autocomplete-shell ${status}`}>
            <MapPin size={19} aria-hidden="true" />
            <div ref={autocompleteHost} className="google-autocomplete-host" />
            {status === "loading" && <LoaderCircle className="spin" size={18} aria-label="Loading location search" />}
          </div>
          {error && <p className="location-error" role="alert">{error}</p>}
        </>
      )}
      <p className="location-privacy"><ShieldCheck size={15} />This exact location will be public to signed-in members. Choose a nearby landmark or trailhead if you prefer.</p>
    </div>
  );
}
