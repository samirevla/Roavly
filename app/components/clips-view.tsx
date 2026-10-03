"use client";

import {
  Clapperboard,
  MapPin,
  Share2,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type ClipItem = {
  id: string;
  caption: string;
  activityType: string;
  location: string;
  mediaUrl: string;
  imageUrl: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  motivationCount: number;
  viewerMotivated: boolean;
};

function truncate(text: string, max = 110) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function ClipAvatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const initial = name.charAt(0).toUpperCase() || "W";
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="clip-avatar" src={imageUrl} alt="" />
    );
  }
  return <span className="clip-avatar clip-avatar-fallback" aria-hidden="true">{initial}</span>;
}

function ClipSlide({
  clip,
  active,
  muted,
  onToggleMute,
  onToggleMotivation,
  onShare,
}: {
  clip: ClipItem;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onToggleMotivation: (clip: ClipItem) => void;
  onShare: (clip: ClipItem) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (active && !paused) {
      const playPromise = video.play();
      if (playPromise) playPromise.catch(() => undefined);
    } else {
      video.pause();
    }
  }, [active, muted, paused]);

  useEffect(() => {
    if (!active) setPaused(false);
  }, [active]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setPaused(false);
      video.play().catch(() => undefined);
    } else {
      setPaused(true);
      video.pause();
    }
  }

  return (
    <article className="clip-slide" data-clip-id={clip.id}>
      <video
        ref={videoRef}
        className="clip-video"
        src={clip.mediaUrl}
        playsInline
        loop
        muted={muted}
        preload={active ? "auto" : "metadata"}
        onClick={togglePlay}
        aria-label={`Clip by @${clip.authorUsername}`}
      />
      {paused && active && (
        <button className="clip-play-hint" onClick={togglePlay} aria-label="Play clip">
          <Clapperboard size={28} />
        </button>
      )}
      <div className="clip-gradient" aria-hidden="true" />
      <div className="clip-meta">
        <div className="clip-author">
          <ClipAvatar name={clip.authorName} imageUrl={clip.authorAvatarUrl} />
          <div>
            <strong>@{clip.authorUsername}</strong>
            <small>
              {clip.activityType}
              {clip.location ? (
                <>
                  {" · "}
                  <MapPin size={11} aria-hidden="true" /> {clip.location}
                </>
              ) : null}
            </small>
          </div>
        </div>
        {clip.caption ? <p>{truncate(clip.caption)}</p> : null}
      </div>
      <div className="clip-rail" aria-label="Clip actions">
        <button
          className={clip.viewerMotivated ? "motivated" : ""}
          onClick={() => onToggleMotivation(clip)}
          aria-pressed={clip.viewerMotivated}
          aria-label={clip.viewerMotivated ? "Motivated" : "I’m motivated"}
        >
          <Sparkles size={22} fill={clip.viewerMotivated ? "currentColor" : "none"} />
          <span>{clip.motivationCount || ""}</span>
        </button>
        <button onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          <span>{muted ? "Muted" : "Sound"}</span>
        </button>
        <button onClick={() => onShare(clip)} aria-label="Share clip">
          <Share2 size={22} />
          <span>Share</span>
        </button>
      </div>
    </article>
  );
}

export function ClipsView({
  showToast,
  onShareJourney,
}: {
  showToast: (message: string) => void;
  onShareJourney: () => void;
}) {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const loadClips = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/clips");
      const payload = (await response.json()) as { clips?: ClipItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Clips could not load.");
      const next = payload.clips || [];
      setClips(next);
      setActiveId(next[0]?.id ?? null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Clips could not load.");
      setClips([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadClips();
  }, [loadClips]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !clips.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const id = (visible.target as HTMLElement).dataset.clipId;
        if (id) setActiveId(id);
      },
      { root, threshold: [0.55, 0.75] },
    );

    root.querySelectorAll<HTMLElement>(".clip-slide").forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [clips]);

  async function toggleMotivation(clip: ClipItem) {
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(clip.id)}/motivate`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        motivated?: boolean;
        motivationCount?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not update motivation.");
      setClips((current) =>
        current.map((item) =>
          item.id === clip.id
            ? {
                ...item,
                viewerMotivated: Boolean(payload.motivated),
                motivationCount: Number(payload.motivationCount ?? item.motivationCount),
              }
            : item,
        ),
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update motivation.");
    }
  }

  async function shareClip(clip: ClipItem) {
    const shareData = {
      title: `${clip.authorName} on Waymark`,
      text: clip.caption || `Watch @${clip.authorUsername}'s clip on Waymark`,
      url: typeof window !== "undefined" ? window.location.href : "",
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.url);
        showToast("Waymark link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("Share was cancelled.");
    }
  }

  if (loading) {
    return (
      <div className="clips-feed clips-loading" aria-busy="true" aria-label="Loading clips">
        {[0, 1].map((index) => (
          <div key={index} className="clip-slide clip-skeleton">
            <div className="clip-skeleton-block" />
          </div>
        ))}
      </div>
    );
  }

  if (!clips.length) {
    return (
      <div className="clips-empty">
        <span><Clapperboard size={32} /></span>
        <strong>No clips yet</strong>
        <p>Share a journey video from Create and it will show up here as a vertical clip.</p>
        <button type="button" onClick={onShareJourney}>
          Share a journey video
        </button>
      </div>
    );
  }

  return (
    <div className="clips-feed" ref={scrollerRef} aria-label="Waymark clips">
      {clips.map((clip) => (
        <ClipSlide
          key={clip.id}
          clip={clip}
          active={clip.id === activeId}
          muted={muted}
          onToggleMute={() => setMuted((value) => !value)}
          onToggleMotivation={toggleMotivation}
          onShare={shareClip}
        />
      ))}
    </div>
  );
}
