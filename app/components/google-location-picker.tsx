"use client";

import { CheckCircle2, LoaderCircle, MapPin, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { loadGoogleMaps } from "../google-maps";

export type SelectedPlace = {
  location: string;
  latitude: string;
  longitude: string;
  placeId: string;
};

type SuggestionItem = {
  id: string;
  mainText: string;
  secondaryText: string;
  prediction: google.maps.places.PlacePrediction;
};

function predictionLabel(prediction: google.maps.places.PlacePrediction) {
  return prediction.text?.toString?.() || prediction.mainText?.toString?.() || prediction.placeId;
}

/**
 * In-page Places autocomplete (not Google's PlaceAutocompleteElement).
 * On iPhone, the element opens a full-screen prediction sheet that fights our
 * full-viewport Share a Journey composer and leaves a white/blank keyboard view.
 */
export function GoogleLocationPicker({
  value,
  onSelect,
}: {
  value: SelectedPlace | null;
  onSelect: (place: SelectedPlace | null) => void;
}) {
  const listId = useId();
  const previewHost = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestSeq = useRef(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    async function initialise() {
      setStatus("loading");
      setError("");
      try {
        await loadGoogleMaps();
        if (cancelled) return;
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
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
    };
  }, [value?.placeId]);

  useEffect(() => {
    if (value) {
      setQuery("");
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
    }
  }, [value?.placeId]);

  useEffect(() => {
    if (value || status !== "ready") return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const seq = ++requestSeq.current;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
        }
        const { suggestions: next } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmed,
            sessionToken: sessionTokenRef.current,
          });
        if (seq !== requestSeq.current) return;
        const items = next
          .map((suggestion, index) => {
            const prediction = suggestion.placePrediction;
            if (!prediction) return null;
            return {
              id: `${prediction.placeId}-${index}`,
              mainText: prediction.mainText?.toString() || predictionLabel(prediction),
              secondaryText: prediction.secondaryText?.toString() || "",
              prediction,
            } satisfies SuggestionItem;
          })
          .filter((item): item is SuggestionItem => Boolean(item));
        setSuggestions(items);
        setOpen(items.length > 0);
        setActiveIndex(items.length ? 0 : -1);
        setError("");
      } catch {
        if (seq !== requestSeq.current) return;
        setSuggestions([]);
        setOpen(false);
        setError("Google location search is temporarily unavailable.");
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, 220);

    return () => window.clearTimeout(handle);
  }, [query, status, value]);

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

  async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
    setSearching(true);
    setError("");
    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ["id", "displayName", "formattedAddress", "location"],
      });
      if (!place.location || !place.id) {
        throw new Error("Choose a place with a mapped location.");
      }
      const location =
        place.formattedAddress || place.displayName || predictionLabel(prediction);
      onSelectRef.current({
        location,
        latitude: String(place.location.lat()),
        longitude: String(place.location.lng()),
        placeId: place.id,
      });
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      setQuery("");
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "That place could not be selected.",
      );
    } finally {
      setSearching(false);
    }
  }

  function onInputFocus() {
    setOpen(suggestions.length > 0);
    // Keep the field visible above the iOS keyboard inside the composer sheet.
    window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      void selectPrediction(suggestions[activeIndex].prediction);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="location-picker" ref={rootRef}>
      <div className="location-picker-label">
        <span>Exact location</span>
        <small>Required · powered by Google</small>
      </div>
      {value ? (
        <div className="selected-place">
          <div className="selected-place-map" ref={previewHost} aria-label={`Map preview of ${value.location}`} />
          <div className="selected-place-copy">
            <CheckCircle2 size={19} aria-hidden="true" />
            <span>
              <strong>Location selected</strong>
              <small>{value.location}</small>
            </span>
            <button type="button" onClick={() => onSelect(null)} aria-label="Choose a different location">
              <RotateCcw size={16} /> Change
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={`google-autocomplete-shell in-page ${status}`}>
            <MapPin size={19} aria-hidden="true" />
            <div className="google-autocomplete-host">
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="search"
                placeholder="Search trail, park, mountain or address"
                aria-label="Search Google Maps location"
                aria-autocomplete="list"
                aria-controls={listId}
                aria-expanded={open}
                aria-activedescendant={
                  activeIndex >= 0 && suggestions[activeIndex]
                    ? `${listId}-option-${activeIndex}`
                    : undefined
                }
                value={query}
                disabled={status !== "ready"}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={onInputFocus}
                onBlur={() => {
                  // Allow click on a suggestion before closing.
                  window.setTimeout(() => setOpen(false), 160);
                }}
                onKeyDown={onKeyDown}
              />
            </div>
            {(status === "loading" || searching) && (
              <LoaderCircle className="spin" size={18} aria-label="Loading location search" />
            )}
          </div>
          {open && suggestions.length > 0 && (
            <ul id={listId} className="location-suggestions" role="listbox" aria-label="Location suggestions">
              {suggestions.map((item, index) => (
                <li key={item.id} role="presentation">
                  <button
                    type="button"
                    id={`${listId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? "active" : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void selectPrediction(item.prediction)}
                  >
                    <strong>{item.mainText}</strong>
                    {item.secondaryText ? <small>{item.secondaryText}</small> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="location-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
      <p className="location-privacy">
        <ShieldCheck size={15} />
        This exact location will be public to signed-in members. Choose a nearby landmark or trailhead if you prefer.
      </p>
    </div>
  );
}
