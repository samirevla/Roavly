"use client";

import {
  Award,
  Bell,
  Bookmark,
  Check,
  Clock3,
  Compass,
  Edit3,
  Flag,
  Gem,
  Home,
  ImagePlus,
  Info,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  Maximize2,
  MessageCircle,
  Menu,
  Move,
  Mountain,
  Plus,
  Route,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Timer,
  Trash2,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, FormEvent, PointerEvent as ReactPointerEvent, SetStateAction, WheelEvent as ReactWheelEvent } from "react";
import { DiscoverView } from "./components/discover-view";
import { AdSlot } from "./components/ad-slot";
import { GoogleLocationPicker, SelectedPlace } from "./components/google-location-picker";
import { MessagesView } from "./components/messages-view";
import { RoavlyLogo } from "./components/roavly-logo";
import {
  preparePhotoForUpload,
  reportPhotoPreparationFailure,
  reportPhotoUploadFailure,
} from "./client-photo";
import { friendlyUploadError } from "./photo-upload";
import { POSITIVE_ENCOURAGEMENTS } from "./positive-comments";

type NavKey = "Feed" | "Explore" | "Messages" | "Friends" | "Profile";
type Relationship = "none" | "outgoing" | "incoming" | "friends";

type Viewer = {
  displayName: string;
  email: string;
  fullName: string | null;
};

type Profile = {
  email: string;
  displayName: string;
  username: string;
  bio: string;
  homeBase: string;
  favoriteActivities: string;
  ageBand: string;
  experienceLevel: string;
  pacePreference: string;
  availability: string;
  travelRadiusKm: number;
  groupStyle: string;
  accessibilityNeeds: string;
};

type Comment = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorUsername: string;
  canDelete: boolean;
};

type SavedPost = {
  id: string;
  authorName: string;
  authorUsername: string;
  caption: string;
  activityType: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  locationPrivacy: string;
  locationPrecision: "exact" | "approximate";
  distanceKm: number;
  durationMinutes: number;
  elevationMetres: number;
  difficulty: string;
  tips: string;
  conditions: string;
  parkingInfo: string;
  phoneSignal: string;
  toilets: string;
  accessibility: string;
  dogFriendly: string;
  bestTime: string;
  inspiredByPostId: string | null;
  imageKey: string;
  imageUrl: string;
  createdAt: string;
  motivationCount: number;
  viewerMotivated: boolean;
  saveCount: number;
  viewerSaved: boolean;
  viewerSaveStatus: "none" | "saved" | "planned" | "completed";
  inspiredCount: number;
  inspiredMinutes: number;
  isOwner: boolean;
  comments: Comment[];
  gear?: Array<{ id: string; brand: string; productName: string; outUrl: string }>;
};

type Person = {
  displayName: string;
  username: string;
  bio: string;
  homeBase: string;
  favoriteActivities: string;
  experienceLevel: string;
  pacePreference: string;
  availability: string;
  travelRadiusKm: number;
  groupStyle: string;
  accessibilityNeeds: string;
  relationship: Relationship;
};

type ComposerDraft = {
  caption: string;
  activityType: string;
  location: string;
  latitude: string;
  longitude: string;
  placeId: string;
  locationPrivacy: string;
  distanceKm: string;
  durationMinutes: string;
  elevationMetres: string;
  difficulty: string;
  tips: string;
  conditions: string;
  parkingInfo: string;
  phoneSignal: string;
  toilets: string;
  accessibility: string;
  dogFriendly: string;
  bestTime: string;
  inspiredByPostId: string;
};

const primaryNavigation: {
  label: "Home" | "Explore" | "Journeys" | "Profile";
  nav: NavKey;
  discover?: "Map" | "Plans";
  icon: typeof Home;
}[] = [
  { label: "Home", nav: "Feed", icon: Home },
  { label: "Explore", nav: "Explore", discover: "Map", icon: Compass },
  { label: "Journeys", nav: "Explore", discover: "Plans", icon: Route },
  { label: "Profile", nav: "Profile", icon: User },
];

const blankDraft: ComposerDraft = {
  caption: "",
  activityType: "Hiking",
  location: "",
  latitude: "",
  longitude: "",
  placeId: "",
  locationPrivacy: "approximate",
  distanceKm: "",
  durationMinutes: "",
  elevationMetres: "",
  difficulty: "Moderate",
  tips: "",
  conditions: "",
  parkingInfo: "",
  phoneSignal: "Unknown",
  toilets: "Unknown",
  accessibility: "",
  dogFriendly: "Unknown",
  bestTime: "",
  inspiredByPostId: "",
};

const outdoorAchievements = [
  { minutes: 60, name: "Fresh Air Starter", description: "Spend your first hour outdoors" },
  { minutes: 300, name: "Trail Regular", description: "Reach 5 hours outdoors" },
  { minutes: 600, name: "Outdoor Adventurer", description: "Reach 10 hours outdoors" },
  { minutes: 1500, name: "Wild Spirit", description: "Reach 25 hours outdoors" },
  { minutes: 3000, name: "Roavly Legend", description: "Reach 50 hours outdoors" },
];

export default function HomePage() {
  const [activeNav, setActiveNav] = useState<NavKey>("Feed");
  const [feedMode, setFeedMode] = useState<"Community" | "Friends">("Community");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [draft, setDraft] = useState<ComposerDraft>(blankDraft);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [composerError, setComposerError] = useState("");
  const photoReadId = useRef(0);
  const [publishing, setPublishing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState("");
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [messageTarget, setMessageTarget] = useState<string | null>(null);
  const [conversationTarget, setConversationTarget] = useState<string | null>(null);
  const [discoverStart, setDiscoverStart] = useState<"Map" | "Saved" | "Plans" | "Clubs" | "Challenges" | "Tips">("Map");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const meResponse = await fetch("/api/me");
        const mePayload = (await meResponse.json()) as { user?: Viewer | null; profile?: Profile | null };
        if (!active) return;
        setViewer(mePayload.user ?? null);
        setProfile(mePayload.profile ?? null);
        if (!mePayload.user) return;
        const [postResponse, friendResponse] = await Promise.all([
          fetch("/api/posts"),
          fetch("/api/friends"),
        ]);
        const [postPayload, friendPayload] = await Promise.all([
          postResponse.json() as Promise<{ posts?: SavedPost[]; error?: string }>,
          friendResponse.json() as Promise<{ people?: Person[]; error?: string }>,
        ]);
        if (!postResponse.ok) throw new Error(postPayload.error || "Could not load the feed.");
        if (!friendResponse.ok) throw new Error(friendPayload.error || "Could not load members.");
        if (!active) return;
        setPosts(postPayload.posts ?? []);
        setPeople(friendPayload.people ?? []);
      } catch (error) {
        if (active) {
          setToast(error instanceof Error ? error.message : "Roavly could not load.");
          window.setTimeout(() => setToast(""), 3000);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      photoReadId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!viewer) return;
    let active = true;
    async function refreshUnread() {
      try {
        const response = await fetch("/api/conversations");
        const payload = (await response.json()) as { unreadTotal?: number };
        if (active && response.ok) setUnreadMessages(payload.unreadTotal ?? 0);
      } catch {
        // Messages will show a full error if the user opens that screen.
      }
    }
    refreshUnread();
    const interval = window.setInterval(refreshUnread, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [viewer]);

  const friendUsernames = useMemo(
    () => new Set(people.filter((person) => person.relationship === "friends").map((person) => person.username)),
    [people],
  );
  const visiblePosts = useMemo(() => {
    if (feedMode === "Community") return posts;
    return posts.filter((post) => post.isOwner || friendUsernames.has(post.authorUsername));
  }, [feedMode, friendUsernames, posts]);
  const myPosts = useMemo(() => posts.filter((post) => post.isOwner), [posts]);
  const outdoorMinutes = useMemo(
    () => myPosts.reduce((total, post) => total + post.durationMinutes, 0),
    [myPosts],
  );
  const friends = people.filter((person) => person.relationship === "friends");
  const incomingRequests = people.filter((person) => person.relationship === "incoming");
  const profileName = profile?.displayName || viewer?.displayName || "Roavly member";
  const profileUsername = profile?.username ? `@${profile.username}` : "";
  const initial = profileName.charAt(0).toUpperCase() || "R";
  const firstName = profileName.split(" ")[0] || "adventurer";

  function navigatePrimary(nav: NavKey, discover?: "Map" | "Plans") {
    if (discover) setDiscoverStart(discover);
    setActiveNav(nav);
  }

  function primaryIsActive(nav: NavKey, discover?: "Map" | "Plans") {
    if (nav !== activeNav) return false;
    if (nav !== "Explore") return true;
    return discover === "Plans" ? discoverStart === "Plans" : discoverStart !== "Plans";
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  function signIn() {
    window.location.href = "/login?return_to=%2F";
  }

  async function choosePhoto(file: File | null) {
    const readId = photoReadId.current + 1;
    photoReadId.current = readId;
    setPhoto(null);
    setPhotoPreview("");
    setComposerError("");
    if (!file) return;
    setPreparingPhoto(true);
    try {
      const prepared = await preparePhotoForUpload(file);
      if (photoReadId.current !== readId) return;
      setPhoto(prepared.file);
      setPhotoPreview(prepared.preview);
      if (prepared.optimised) showToast("Photo optimised and ready to share.");
    } catch (error) {
      if (photoReadId.current !== readId) return;
      const message = friendlyUploadError(error);
      setComposerError(message);
      void reportPhotoPreparationFailure(error, file);
    } finally {
      if (photoReadId.current === readId) setPreparingPhoto(false);
    }
  }

  function closeComposer() {
    choosePhoto(null);
    setComposerError("");
    setComposerOpen(false);
  }

  async function publishJourney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !photo ||
      !draft.caption.trim() ||
      !Number(draft.durationMinutes) ||
      !draft.placeId ||
      !draft.latitude ||
      !draft.longitude ||
      publishing
    ) return;
    setPublishing(true);
    setComposerError("");
    try {
      const form = new FormData();
      Object.entries(draft).forEach(([key, value]) => form.append(key, value));
      form.append("photo", photo);
      const response = await fetch("/api/posts", {
        method: "POST",
        body: form,
        headers: { "X-Roavly-Photo-Bytes": String(photo.size) },
      });
      const payload = (await response.json()) as { post?: SavedPost; error?: string };
      if (!response.ok || !payload.post) throw new Error(payload.error || "Your journey could not be shared.");
      setPosts((current) => [payload.post!, ...current]);
      setDraft(blankDraft);
      closeComposer();
      setActiveNav("Feed");
      setFeedMode("Community");
      showToast("Your journey is live in the community feed.");
    } catch (error) {
      const message = friendlyUploadError(error);
      setComposerError(message);
      if (photo) void reportPhotoUploadFailure(error, photo);
      showToast(message);
    } finally {
      setPublishing(false);
    }
  }

  async function toggleMotivation(post: SavedPost) {
    const previous = { ...post };
    const optimistic = {
      ...post,
      viewerMotivated: !post.viewerMotivated,
      motivationCount: Math.max(0, post.motivationCount + (post.viewerMotivated ? -1 : 1)),
    };
    setPosts((current) => upsertPost(current, optimistic));
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/motivate`, { method: "POST" });
      const payload = (await response.json()) as { motivated?: boolean; motivationCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save your motivation.");
      setPosts((current) =>
        upsertPost(current, {
          ...post,
          viewerMotivated: Boolean(payload.motivated),
          motivationCount: Number(payload.motivationCount) || 0,
        }),
      );
    } catch (error) {
      setPosts((current) => upsertPost(current, previous));
      showToast(error instanceof Error ? error.message : "Please try again.");
    }
  }

  async function saveJourney(post: SavedPost, action: "toggle" | "plan" = "toggle") {
    const previous = { ...post };
    const optimistic = {
      ...post,
      viewerSaved: action === "toggle" ? !post.viewerSaved : true,
      viewerSaveStatus:
        action === "plan"
          ? "planned" as const
          : post.viewerSaved
            ? "none" as const
            : "saved" as const,
      saveCount: Math.max(0, post.saveCount + (action === "toggle" ? (post.viewerSaved ? -1 : 1) : post.viewerSaved ? 0 : 1)),
    };
    setPosts((current) => upsertPost(current, optimistic));
    try {
      const response = await fetch("/api/saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId: post.id, action }),
      });
      const payload = (await response.json()) as { saved?: boolean; status?: SavedPost["viewerSaveStatus"]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update your saved adventures.");
      setPosts((current) =>
        upsertPost(current, {
          ...optimistic,
          viewerSaved: Boolean(payload.saved),
          viewerSaveStatus: payload.status || "none",
        }),
      );
      if (action === "plan") {
        setDiscoverStart("Saved");
        setActiveNav("Explore");
        showToast("Saved to your shortlist. Choose “Plan it” to add a date and group.");
      } else {
        showToast(payload.saved ? "Saved for your next adventure." : "Removed from saved adventures.");
      }
    } catch (error) {
      setPosts((current) => upsertPost(current, previous));
      showToast(error instanceof Error ? error.message : "Please try again.");
    }
  }

  async function addComment(postId: string, body: string) {
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = (await response.json()) as { comment?: Comment; error?: string };
      if (!response.ok || !payload.comment) throw new Error(payload.error || "Could not add your comment.");
      setPosts((current) =>
        current.map((post) =>
          post.id === postId ? { ...post, comments: [...post.comments, payload.comment!] } : post,
        ),
      );
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add your comment.");
      return false;
    }
  }

  async function deleteComment(postId: string, commentId: string) {
    if (!window.confirm("Delete this encouragement?")) return;
    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error || "Could not delete this encouragement.");
      }
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? { ...post, comments: post.comments.filter((comment) => comment.id !== commentId) }
            : post,
        ),
      );
      showToast("Encouragement deleted.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete this encouragement.");
    }
  }

  async function deletePost(post: SavedPost) {
    if (!window.confirm("Delete this journey permanently?")) return;
    const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}`, { method: "DELETE" });
    const payload = (await response.json()) as { deleted?: boolean; error?: string };
    if (!response.ok) {
      showToast(payload.error || "Could not delete this journey.");
      return;
    }
    setPosts((current) => current.filter((item) => item.id !== post.id));
    showToast("Journey deleted.");
  }

  async function reportPost(post: SavedPost) {
    if (!window.confirm("Report this post for a community safety review?")) return;
    const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Community safety concern" }),
    });
    const payload = (await response.json()) as { reported?: boolean; error?: string };
    showToast(response.ok ? "Report received. Thank you for protecting the community." : payload.error || "Could not submit the report.");
  }

  async function sharePost(post: SavedPost) {
    const shareData = { title: `${post.authorName} on Roavly`, text: post.caption, url: window.location.href };
    try {
      const recap = await createJourneyRecap(post);
      if (recap && navigator.share && navigator.canShare?.({ files: [recap] })) {
        await navigator.share({ ...shareData, files: [recap] });
      }
      else if (navigator.share) await navigator.share(shareData);
      else {
        if (recap) {
          const downloadUrl = URL.createObjectURL(recap);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = recap.name;
          link.click();
          URL.revokeObjectURL(downloadUrl);
          showToast("Journey recap downloaded.");
        } else {
          await navigator.clipboard.writeText(window.location.href);
          showToast("Roavly link copied.");
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("The share card could not open. Please try again.");
    }
  }

  function openPostFromMap(postId: string) {
    setFeedMode("Community");
    setActiveNav("Feed");
    window.setTimeout(() => {
      const post = document.getElementById(`post-${postId}`);
      post?.scrollIntoView({ behavior: "smooth", block: "center" });
      post?.focus({ preventScroll: true });
    }, 80);
  }

  function startInspiredJourney(postId: string) {
    setDraft({ ...blankDraft, inspiredByPostId: postId });
    setComposerOpen(true);
  }

  function openMessage(username: string) {
    setMessageTarget(username);
    setActiveNav("Messages");
  }

  async function manageFriend(targetUsername: string, action: "request" | "accept" | "decline" | "remove" | "block") {
    if (action === "block" && !window.confirm(`Block @${targetUsername}? You will stop seeing each other’s posts and direct messages.`)) return;
    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetUsername, action }),
    });
    const payload = (await response.json()) as { relationship?: Relationship; error?: string };
    if (!response.ok || !payload.relationship) {
      showToast(payload.error || "Could not update this friendship.");
      return;
    }
    setPeople((current) =>
      action === "block"
        ? current.filter((person) => person.username !== targetUsername)
        : current.map((person) =>
            person.username === targetUsername ? { ...person, relationship: payload.relationship! } : person,
          ),
    );
    const messages: Record<typeof action, string> = {
      request: payload.relationship === "friends" ? "You are now friends." : "Friend request sent.",
      accept: "Friend request accepted.",
      decline: "Friend request declined.",
      remove: "Friend removed.",
      block: "Member blocked. You will no longer see each other.",
    };
    showToast(messages[action]);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || savingProfile) return;
    setSavingProfile(true);
    try {
      const response = await fetch("/api/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const payload = (await response.json()) as { profile?: Profile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Profile could not be saved.");
      setProfile(payload.profile);
      setProfileOpen(false);
      showToast("Profile updated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (!viewer || !profile) return <WelcomeScreen signIn={signIn} />;

  return (
    <main className={`app-shell ${activeNav === "Messages" ? "messages-active" : ""}`}>
      <header className="desktop-topbar">
        <button className="kinetic-brand" onClick={() => setActiveNav("Feed")} aria-label="Roavly home">
          <RoavlyLogo />
        </button>
        <nav className="desktop-primary-nav" aria-label="Primary navigation">
          {primaryNavigation.map(({ label, nav, discover, icon: Icon }) => (
            <button key={label} className={primaryIsActive(nav, discover) ? "active" : ""} onClick={() => navigatePrimary(nav, discover)} aria-current={primaryIsActive(nav, discover) ? "page" : undefined}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
          <button className="desktop-create-action" onClick={() => setComposerOpen(true)}><Plus size={19} /><span>Create</span></button>
        </nav>
        <div className="desktop-social-actions">
          <button onClick={() => { setDiscoverStart("Map"); setActiveNav("Explore"); }} aria-label="Search and explore"><Search size={20} /></button>
          <button onClick={() => setActiveNav("Friends")} aria-label="Friends and notifications" className="header-notifications"><Bell size={20} />{incomingRequests.length > 0 && <i />}</button>
          <button onClick={() => setActiveNav("Messages")} aria-label="Messages" className="header-notifications"><MessageCircle size={20} />{unreadMessages > 0 && <i />}</button>
          <button className="desktop-avatar-button" onClick={() => setActiveNav("Profile")} aria-label="Open profile"><span className="avatar">{initial}</span></button>
        </div>
      </header>
      <aside className="side-nav" aria-label="Primary navigation">
        <button className="brand" onClick={() => setActiveNav("Feed")} aria-label="Roavly home">
          <RoavlyLogo />
        </button>
        <nav className="nav-list">
          {primaryNavigation.map(({ label, nav, discover, icon: Icon }) => (
            <button key={label} className={`nav-item ${primaryIsActive(nav, discover) ? "active" : ""}`} onClick={() => navigatePrimary(nav, discover)} aria-current={primaryIsActive(nav, discover) ? "page" : undefined}>
              <Icon size={22} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="side-create" onClick={() => setComposerOpen(true)}>
          <span><Mountain size={20} /></span> Share journey
        </button>
        <div className="safety-note"><ShieldCheck size={20} /><div><strong>Positive by design</strong><span>No dislikes. Encourage, support and inspire.</span></div></div>
        <div className="side-trail-mark" aria-hidden="true"><Mountain size={74} strokeWidth={1.25} /></div>
        <button className="profile-switcher" onClick={() => setActiveNav("Profile")}>
          <span className="avatar">{initial}</span><span><strong>{profileName}</strong><small>{profileUsername}</small></span><Menu size={18} />
        </button>
      </aside>

      <section className="main-column">
        <header className="mobile-header">
          <button className="brand compact" onClick={() => setActiveNav("Feed")} aria-label="Roavly home"><RoavlyLogo /></button>
          <div className="mobile-header-actions">
            <button onClick={() => { setDiscoverStart("Map"); setActiveNav("Explore"); }} aria-label="Search and explore"><Search size={20} /></button>
            <button onClick={() => setActiveNav("Friends")} aria-label="Friends and notifications"><Bell size={20} />{incomingRequests.length > 0 && <i>{incomingRequests.length}</i>}</button>
            <button onClick={() => setActiveNav("Messages")} aria-label="Messages"><MessageCircle size={20} />{unreadMessages > 0 && <i>{Math.min(99, unreadMessages)}</i>}</button>
          </div>
        </header>

        <div className="feed-heading">
          <div>
            <h1>{activeNav === "Feed" ? `Good to see you, ${firstName}` : activeNav}</h1>
            <span className="page-kicker">
              {activeNav === "Feed"
                ? "See what’s inspiring the community today."
                : activeNav === "Explore"
                  ? "Find your next place to get outside."
                  : activeNav === "Messages"
                    ? "Plan the next adventure together."
                    : activeNav === "Friends"
                      ? "Grow your outdoor circle."
                      : "Your journeys, progress and achievements."}
            </span>
          </div>
          <div className="header-actions">
            <button onClick={() => { setDiscoverStart("Map"); setActiveNav("Explore"); }} aria-label="Search journeys"><Search size={21} /></button>
            <button onClick={() => setActiveNav("Friends")} aria-label="Open friends and notifications" className="header-notifications"><Bell size={21} />{incomingRequests.length > 0 && <i />}</button>
            <button onClick={() => setActiveNav("Messages")} aria-label="Open messages" className="header-notifications"><MessageCircle size={21} />{unreadMessages > 0 && <i />}</button>
            <button onClick={() => setActiveNav("Profile")} aria-label="Open profile"><span className="avatar">{initial}</span></button>
          </div>
        </div>

        {activeNav === "Feed" && (
          <Feed
            posts={visiblePosts}
            feedMode={feedMode}
            setFeedMode={setFeedMode}
            initial={initial}
            profileName={profileName}
            openComposer={() => setComposerOpen(true)}
            toggleMotivation={toggleMotivation}
            addComment={addComment}
            deleteComment={deleteComment}
            deletePost={deletePost}
            reportPost={reportPost}
            sharePost={sharePost}
            saveJourney={saveJourney}
          />
        )}
        {activeNav === "Explore" && (
          <DiscoverView
            initialTab={discoverStart}
            posts={posts}
            onTabChange={setDiscoverStart}
            onOpenPost={openPostFromMap}
            onShareJourney={() => setComposerOpen(true)}
            onInspiredJourney={startInspiredJourney}
            friends={friends}
            onOpenConversation={(conversationId) => {
              setConversationTarget(conversationId);
              setActiveNav("Messages");
            }}
            showToast={showToast}
          />
        )}
        {activeNav === "Messages" && (
          <MessagesView
            friends={friends}
            startUsername={messageTarget}
            startConversationId={conversationTarget}
            onStarted={() => setMessageTarget(null)}
            onConversationStarted={() => setConversationTarget(null)}
            onUnreadChange={setUnreadMessages}
            showToast={showToast}
          />
        )}
        {activeNav === "Friends" && (
          <Friends
            people={people}
            posts={posts.filter((post) => !post.isOwner && friendUsernames.has(post.authorUsername))}
            query={searchQuery}
            setQuery={setSearchQuery}
            manageFriend={manageFriend}
            openMessage={openMessage}
            inviteFriends={async () => {
              const shareData = {
                title: "Join me on Roavly",
                text: "Join my outdoor circle on Roavly so we can share journeys and motivate each other.",
                url: window.location.origin,
              };
              try {
                if (navigator.share) await navigator.share(shareData);
                else {
                  await navigator.clipboard.writeText(window.location.origin);
                  showToast("Roavly invite link copied.");
                }
              } catch {
                // Closing the native share sheet is not an error.
              }
            }}
            toggleMotivation={toggleMotivation}
            addComment={addComment}
            deleteComment={deleteComment}
            deletePost={deletePost}
            reportPost={reportPost}
            sharePost={sharePost}
            saveJourney={saveJourney}
          />
        )}
        {activeNav === "Profile" && (
          <ProfileView
            profile={profile}
            initial={initial}
            posts={myPosts}
            friendsCount={friends.length}
            outdoorMinutes={outdoorMinutes}
            openEdit={() => setProfileOpen(true)}
            openComposer={() => setComposerOpen(true)}
            openMap={() => { setDiscoverStart("Map"); setActiveNav("Explore"); }}
            toggleMotivation={toggleMotivation}
            addComment={addComment}
            deleteComment={deleteComment}
            deletePost={deletePost}
            reportPost={reportPost}
            sharePost={sharePost}
            saveJourney={saveJourney}
          />
        )}
      </section>

      <aside className="right-rail">
        <OutdoorTracker minutes={outdoorMinutes} compact />
        <section className="rail-card explore-rail">
          <span><Compass size={22} /></span>
          <div><strong>Explore nearby</strong><p>Discover routes and outdoor spots through real community journeys.</p></div>
          <button onClick={() => { setDiscoverStart("Map"); setActiveNav("Explore"); }}>Open map</button>
        </section>
        <section className="rail-card">
          <div className="rail-title"><h2>Your friends</h2><button onClick={() => setActiveNav("Friends")}>View all</button></div>
          {friends.length ? (
            <div className="friend-mini-list">{friends.slice(0, 4).map((friend) => <button key={friend.username} onClick={() => openMessage(friend.username)}><Avatar name={friend.displayName} /><span><strong>{friend.displayName}</strong><small>Message @{friend.username}</small></span></button>)}</div>
          ) : (
            <div className="rail-empty"><Users size={24} /><p>Find friends and build your outdoor circle.</p><button onClick={() => setActiveNav("Friends")}>Find friends</button></div>
          )}
        </section>
        <section className="rail-card community-note"><ShieldCheck size={22} /><div><strong>Community safety</strong><p>Only share locations you are comfortable making public. Report anything that breaks Roavly’s positive spirit.</p></div></section>
      </aside>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={activeNav === "Feed" ? "active" : ""} onClick={() => navigatePrimary("Feed")}><Home size={21} /><span>Home</span></button>
        <button className={activeNav === "Explore" && discoverStart !== "Plans" ? "active" : ""} onClick={() => navigatePrimary("Explore", "Map")}><Compass size={21} /><span>Explore</span></button>
        <button className="mobile-nav-create" onClick={() => setComposerOpen(true)} aria-label="Create a journey"><span><Plus size={24} /></span><em>Create</em></button>
        <button className={activeNav === "Explore" && discoverStart === "Plans" ? "active" : ""} onClick={() => navigatePrimary("Explore", "Plans")}><Route size={21} /><span>Journeys</span></button>
        <button className={activeNav === "Profile" ? "active" : ""} onClick={() => navigatePrimary("Profile")}><User size={21} /><span>Profile</span></button>
      </nav>

      {composerOpen && (
        <ComposerModal
          draft={draft}
          setDraft={setDraft}
          photo={photo}
          photoPreview={photoPreview}
          preparingPhoto={preparingPhoto}
          composerError={composerError}
          choosePhoto={choosePhoto}
          publishing={publishing}
          profileName={profileName}
          initial={initial}
          ageBand={profile.ageBand}
          close={closeComposer}
          submit={publishJourney}
        />
      )}
      {profileOpen && (
        <ProfileModal profile={profile} setProfile={setProfile} saving={savingProfile} close={() => setProfileOpen(false)} submit={saveProfile} />
      )}
      {toast && <div className="toast" role="status"><Sparkles size={18} /> {toast}</div>}
    </main>
  );
}

function WelcomeScreen({ signIn }: { signIn: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not authenticate.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcome-screen">
      <section className="welcome-card auth-card">
        <RoavlyLogo className="welcome-logo" />
        <span className="eyebrow">Welcome to Roavly</span>
        <h1>Share the outdoors.<br />Motivate your people.</h1>
        <p>Roavly is a positive social community for real outdoor journeys. Create your account with email and password — no third-party login required.</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Display name
              <input
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Alex Ridge"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            <LogIn size={19} />
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" className="linkish" onClick={() => setMode("login")}>Sign in</button>
            </>
          ) : (
            <>
              New here?{" "}
              <button type="button" className="linkish" onClick={() => setMode("signup")}>Create an account</button>
              {" · "}
              <button type="button" className="linkish" onClick={signIn}>Open login page</button>
            </>
          )}
        </p>
        <small>By continuing, you confirm you are at least 16 and agree to keep Roavly safe and positive.</small>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="fresh-loading-shell" aria-live="polite" aria-label="Opening Roavly">
      <aside>
        <div className="loading-brand"><RoavlyLogo /></div>
        <div className="loading-nav">{[Home, Compass, MessageCircle, Users, User].map((Icon, index) => <span key={index}><Icon size={21} /><i /></span>)}</div>
      </aside>
      <section>
        <div className="loading-heading"><i /><i /></div>
        <div className="loading-composer"><span /><div><i /><i /></div></div>
        <div className="loading-post"><header><span /><i /></header><div /><footer><i /><i /><i /></footer></div>
      </section>
      <aside><div className="loading-rail-card"><i /><strong /><span /><span /><span /></div><div className="loading-rail-card short"><i /><strong /><span /></div></aside>
      <p>Opening Roavly…</p>
    </main>
  );
}

function Feed({
  posts,
  feedMode,
  setFeedMode,
  initial,
  profileName,
  openComposer,
  toggleMotivation,
  addComment,
  deleteComment,
  deletePost,
  reportPost,
  sharePost,
  saveJourney,
}: {
  posts: SavedPost[];
  feedMode: "Community" | "Friends";
  setFeedMode: (mode: "Community" | "Friends") => void;
  initial: string;
  profileName: string;
  openComposer: () => void;
  toggleMotivation: (post: SavedPost) => void;
  addComment: (postId: string, body: string) => Promise<boolean>;
  deleteComment: (postId: string, commentId: string) => void;
  deletePost: (post: SavedPost) => void;
  reportPost: (post: SavedPost) => void;
  sharePost: (post: SavedPost) => void;
  saveJourney: (post: SavedPost, action?: "toggle" | "plan") => void;
}) {
  return (
    <div className="social-feed">
      <TodayAdventures posts={posts} openComposer={openComposer} />
      <section className="composer" aria-label="Create a journey post">
        <div className="composer-top">
          <span className="avatar">{initial}</span>
          <button className="composer-prompt" onClick={openComposer}>Share an outdoor moment, {profileName.split(" ")[0]}…</button>
        </div>
        <div className="composer-quick-actions">
          <button onClick={openComposer}><ImagePlus size={18} /> Photo</button>
          <button onClick={openComposer}><Mountain size={18} /> Log journey</button>
          <button onClick={openComposer}><MapPin size={18} /> Location</button>
          <button className="composer-share" onClick={openComposer}>Create</button>
        </div>
      </section>
      <div className="feed-tabs" role="tablist" aria-label="Feed filters">
        {(["Community", "Friends"] as const).map((mode) => <button key={mode} role="tab" aria-selected={feedMode === mode} className={feedMode === mode ? "selected" : ""} onClick={() => setFeedMode(mode)}>{mode}</button>)}
      </div>
      <CommunityPulse posts={posts} />
      <AdSlot placement="feed" />
      {posts.length ? posts.map((post) => (
        <JourneyPost key={post.id} post={post} toggleMotivation={toggleMotivation} addComment={addComment} deleteComment={deleteComment} deletePost={deletePost} reportPost={reportPost} sharePost={sharePost} saveJourney={saveJourney} />
      )) : (
        <EmptyState
          icon={feedMode === "Community" ? ImagePlus : Users}
          title={feedMode === "Community" ? "Your next adventure starts here" : "Adventures are better together"}
          copy={feedMode === "Community" ? "Roavly is empty by design. Share a real outdoor photo to start the community." : "Add friends or be the first in your group to share an adventure."}
          action={feedMode === "Community" ? "Share first journey" : "Share a journey"}
          onAction={openComposer}
        />
      )}
    </div>
  );
}

function TodayAdventures({ posts, openComposer }: { posts: SavedPost[]; openComposer: () => void }) {
  const today = new Date().toDateString();
  const adventures = posts
    .filter((post, index, all) =>
      new Date(post.createdAt).toDateString() === today &&
      all.findIndex((item) => item.authorUsername === post.authorUsername) === index,
    )
    .slice(0, 10);

  function openPost(postId: string) {
    document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <section className="today-adventures" aria-label="Today's Adventures">
      <header><div><span className="live-pulse" aria-hidden="true" /><h2>Today’s Adventures</h2></div><small>See who’s outside</small></header>
      <div className="adventure-reel">
        <button className="adventure-reel-create" onClick={openComposer}>
          <span><Plus size={20} /></span><strong>Your adventure</strong><small>Share today</small>
        </button>
        {adventures.map((post) => (
          <button key={post.id} className="adventure-reel-item" onClick={() => openPost(post.id)}>
            <span className="adventure-ring">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.imageUrl} alt="" />
              <i>LIVE</i>
            </span>
            <strong>{post.authorName.split(" ")[0]}</strong>
            <small>{post.activityType}</small>
          </button>
        ))}
        {!adventures.length && (
          <div className="adventure-reel-empty">
            <Mountain size={21} /><span><strong>The day is yours</strong><small>Be the first person to share an adventure today.</small></span>
          </div>
        )}
      </div>
    </section>
  );
}

function CommunityPulse({ posts }: { posts: SavedPost[] }) {
  if (!posts.length) return null;
  return (
    <section className="community-pulse" aria-label="Community activity">
      <header><span><Sparkles size={15} /></span><strong>Community pulse</strong></header>
      <div>
        {posts.slice(0, 4).map((post) => (
          <button key={post.id} onClick={() => document.getElementById(`post-${post.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <Avatar name={post.authorName} />
            <span><strong>{post.authorName}</strong><small>{post.motivationCount > 0 ? `motivated ${post.motivationCount} ${post.motivationCount === 1 ? "person" : "people"} with ${post.activityType.toLowerCase()}` : `shared ${post.activityType.toLowerCase()} from ${post.location}`}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function JourneyPost({
  post,
  toggleMotivation,
  addComment,
  deleteComment,
  deletePost,
  reportPost,
  sharePost,
  saveJourney,
}: {
  post: SavedPost;
  toggleMotivation: (post: SavedPost) => void;
  addComment: (postId: string, body: string) => Promise<boolean>;
  deleteComment: (postId: string, commentId: string) => void;
  deletePost: (post: SavedPost) => void;
  reportPost: (post: SavedPost) => void;
  sharePost: (post: SavedPost) => void;
  saveJourney: (post: SavedPost, action?: "toggle" | "plan") => void;
}) {
  const [commenting, setCommenting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  async function submitEncouragement(body: string) {
    if (commenting) return;
    setCommenting(true);
    try {
      const saved = await addComment(post.id, body);
      if (saved) setCommentsOpen(false);
    } finally {
      setCommenting(false);
    }
  }

  return (
    <article className="post-card" id={`post-${post.id}`} tabIndex={-1}>
      <header className="post-header">
        <Avatar name={post.authorName} />
        <span className="post-author"><strong>{post.authorName}</strong><small>@{post.authorUsername} · {timeAgo(post.createdAt)}</small></span>
        <button className={post.isOwner ? "danger-icon" : ""} onClick={() => post.isOwner ? deletePost(post) : reportPost(post)} aria-label={post.isOwner ? "Delete post" : "Report post"}>
          {post.isOwner ? <Trash2 size={19} /> : <Flag size={18} />}
        </button>
      </header>
      <div
        className="post-media"
        role="button"
        tabIndex={0}
        aria-label={`Open and zoom ${post.activityType} photo from ${post.location || "this journey"}`}
        onClick={() => setImageOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setImageOpen(true);
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="post-image" src={post.imageUrl} alt={`${post.activityType} journey shared by ${post.authorName}`} />
        <div className="post-image-overlay">
          <span>{post.activityType}</span>
          {post.location && <strong><MapPin size={14} /> {post.location}</strong>}
        </div>
        <span className="post-zoom-hint" aria-hidden="true"><Maximize2 size={15} /> View</span>
      </div>
      <div className="post-social-counts">
        <span>{post.motivationCount ? `${post.motivationCount} ${post.motivationCount === 1 ? "person" : "people"} motivated` : "Be the first to motivate them"}</span>
        {post.saveCount > 0 && <span>{post.saveCount} saved</span>}
        {post.inspiredCount > 0 && <span className="impact-count"><Sparkles size={13} /> Inspired {post.inspiredCount} {post.inspiredCount === 1 ? "journey" : "journeys"} · {formatOutdoorTime(post.inspiredMinutes)} outside</span>}
        {post.comments.length > 0 && <button onClick={() => setCommentsOpen(true)}>{post.comments.length} {post.comments.length === 1 ? "encouragement" : "encouragements"}</button>}
      </div>
      <div className="post-actions">
        <button className={`motivate-button ${post.viewerMotivated ? "motivated" : ""}`} onClick={() => toggleMotivation(post)} aria-pressed={post.viewerMotivated}>
          <Sparkles size={19} fill={post.viewerMotivated ? "currentColor" : "none"} /> {post.viewerMotivated ? "Motivated" : "I’m motivated"}
        </button>
        <button onClick={() => setCommentsOpen((open) => !open)} aria-expanded={commentsOpen}><MessageCircle size={19} /> Comment</button>
        <button onClick={() => sharePost(post)}><Share2 size={19} /> Share</button>
        <button className={post.viewerSaved ? "saved-action" : ""} onClick={() => saveJourney(post)} aria-pressed={post.viewerSaved}><Bookmark size={19} fill={post.viewerSaved ? "currentColor" : "none"} /> {post.viewerSaved ? "Saved" : "Save"}</button>
        <button onClick={() => saveJourney(post, "plan")}><Route size={19} /> Plan it</button>
      </div>
      <div className="post-copy">
        <p><strong>{post.authorName}</strong> {post.caption}</p>
        <div className="post-tags">
          {post.location && <span className="privacy-chip"><ShieldCheck size={13} /> {post.locationPrecision === "exact" ? "Exact pin shared" : "Approximate area"}</span>}
          {post.gear?.map((item) => <a className="gear-pill" key={item.id} href={item.outUrl} target="_blank" rel="noreferrer sponsored"><ShoppingBag size={13} /> {item.brand} · {item.productName}<small>affiliate</small></a>)}
        </div>
      </div>
      <div className="activity-stats journey-snapshot">
        <span><Route size={19} /><strong>{formatDistance(post.distanceKm)}</strong><small>Distance</small></span>
        <span><Clock3 size={19} /><strong>{formatDuration(post.durationMinutes)}</strong><small>Outdoors</small></span>
        <span><Mountain size={19} /><strong>{post.elevationMetres ? `${post.elevationMetres} m` : "—"}</strong><small>Elevation</small></span>
      </div>
      {(post.tips || post.conditions || post.parkingInfo || post.accessibility || post.bestTime || post.phoneSignal !== "Unknown" || post.toilets !== "Unknown" || post.dogFriendly !== "Unknown") && (
        <details className="spot-facts">
          <summary><Info size={17} /> Adventure details · Know before you go <span>{post.difficulty}</span></summary>
          <div>
            {post.tips && <p><strong>Highlight</strong>{post.tips}</p>}
            {post.conditions && <p><strong>Conditions</strong>{post.conditions}</p>}
            {post.parkingInfo && <p><strong>Getting there</strong>{post.parkingInfo}</p>}
            {post.bestTime && <p><strong>Best time</strong>{post.bestTime}</p>}
            {post.accessibility && <p><strong>Accessibility</strong>{post.accessibility}</p>}
            {post.phoneSignal !== "Unknown" && <p><strong>Phone signal</strong>{post.phoneSignal}</p>}
            {post.toilets !== "Unknown" && <p><strong>Toilets</strong>{post.toilets}</p>}
            {post.dogFriendly !== "Unknown" && <p><strong>Dogs</strong>{post.dogFriendly}</p>}
          </div>
        </details>
      )}
      <div className="comment-section">
        {post.comments.length > 2 && !showAllComments && <button className="view-comments" onClick={() => { setCommentsOpen(true); setShowAllComments(true); }}>View all {post.comments.length} encouragements</button>}
        {(showAllComments ? post.comments : post.comments.slice(-2)).map((item) => (
          <div className="comment-row" key={item.id}>
            <p className="comment"><strong>{item.authorName}</strong><span>{item.body}</span></p>
            {item.canDelete && <button className="delete-comment" onClick={() => deleteComment(post.id, item.id)} aria-label={`Delete encouragement from ${item.authorName}`}><Trash2 size={14} /></button>}
          </div>
        ))}
        {commentsOpen ? (
          <div className="encouragement-picker" role="group" aria-label="Choose a positive encouragement">
            <div><strong>Send some encouragement</strong><span>Choose a positive reply—free-text public comments are switched off.</span></div>
            <div className="encouragement-options">
              {POSITIVE_ENCOURAGEMENTS.map((encouragement) => (
                <button key={encouragement} type="button" disabled={commenting} onClick={() => submitEncouragement(encouragement)}>
                  {encouragement}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button className="quick-comment" onClick={() => setCommentsOpen(true)}>Send positive encouragement…</button>
        )}
      </div>
      {imageOpen && (
        <ImageLightbox
          src={post.imageUrl}
          alt={`${post.activityType} journey shared by ${post.authorName}`}
          caption={`${post.authorName} · ${post.activityType}${post.location ? ` · ${post.location}` : ""}`}
          onClose={() => setImageOpen(false)}
        />
      )}
    </article>
  );
}

type LightboxView = { scale: number; x: number; y: number };
type LightboxPoint = { x: number; y: number; startX: number; startY: number };
type LightboxGesture = {
  mode: "pan" | "pinch";
  startX: number;
  startY: number;
  startDistance: number;
  startScale: number;
  startViewX: number;
  startViewY: number;
};

function ImageLightbox({ src, alt, caption, onClose }: { src: string; alt: string; caption: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, LightboxPoint>());
  const gesture = useRef<LightboxGesture | null>(null);
  const lastTap = useRef(0);
  const [view, setView] = useState<LightboxView>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);

  function commitView(next: LightboxView) {
    const scale = Math.min(5, Math.max(1, next.scale));
    if (scale === 1) {
      viewRef.current = { scale: 1, x: 0, y: 0 };
      setView(viewRef.current);
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    const maxX = rect ? (rect.width * (scale - 1)) / 2 + 36 : 1200;
    const maxY = rect ? (rect.height * (scale - 1)) / 2 + 36 : 1200;
    viewRef.current = {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
    setView(viewRef.current);
  }

  function zoomTo(nextScale: number, clientX?: number, clientY?: number) {
    const current = viewRef.current;
    const scale = Math.min(5, Math.max(1, nextScale));
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || clientX === undefined || clientY === undefined || scale === 1) {
      commitView({ scale, x: scale === 1 ? 0 : current.x, y: scale === 1 ? 0 : current.y });
      return;
    }
    const relativeX = clientX - rect.left - rect.width / 2;
    const relativeY = clientY - rect.top - rect.height / 2;
    const ratio = scale / current.scale;
    commitView({
      scale,
      x: relativeX - (relativeX - current.x) * ratio,
      y: relativeY - (relativeY - current.y) * ratio,
    });
  }

  function distanceBetween(points: LightboxPoint[]) {
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  function midpoint(points: LightboxPoint[]) {
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  }

  function beginGesture() {
    const active = Array.from(pointers.current.values());
    const current = viewRef.current;
    if (active.length === 1) {
      gesture.current = {
        mode: "pan",
        startX: active[0].x,
        startY: active[0].y,
        startDistance: 0,
        startScale: current.scale,
        startViewX: current.x,
        startViewY: current.y,
      };
    } else if (active.length >= 2) {
      const pair = active.slice(0, 2);
      const center = midpoint(pair);
      gesture.current = {
        mode: "pinch",
        startX: center.x,
        startY: center.y,
        startDistance: Math.max(1, distanceBetween(pair)),
        startScale: current.scale,
        startViewX: current.x,
        startViewY: current.y,
      };
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    beginGesture();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const point = pointers.current.get(event.pointerId);
    if (!point) return;
    pointers.current.set(event.pointerId, { ...point, x: event.clientX, y: event.clientY });
    const active = Array.from(pointers.current.values());
    const currentGesture = gesture.current;
    if (!currentGesture) return;

    if (active.length === 1 && currentGesture.mode === "pan" && viewRef.current.scale > 1) {
      commitView({
        scale: viewRef.current.scale,
        x: currentGesture.startViewX + active[0].x - currentGesture.startX,
        y: currentGesture.startViewY + active[0].y - currentGesture.startY,
      });
    } else if (active.length >= 2) {
      if (currentGesture.mode !== "pinch") {
        beginGesture();
        return;
      }
      const pair = active.slice(0, 2);
      const center = midpoint(pair);
      commitView({
        scale: currentGesture.startScale * (distanceBetween(pair) / currentGesture.startDistance),
        x: currentGesture.startViewX + center.x - currentGesture.startX,
        y: currentGesture.startViewY + center.y - currentGesture.startY,
      });
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const point = pointers.current.get(event.pointerId);
    const wasSinglePointer = pointers.current.size === 1;
    const wasTap = Boolean(point && Math.hypot(event.clientX - point.startX, event.clientY - point.startY) < 9);
    pointers.current.delete(event.pointerId);

    if (event.pointerType === "touch" && wasSinglePointer && wasTap) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        zoomTo(viewRef.current.scale > 1 ? 1 : 2.5, event.clientX, event.clientY);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
    beginGesture();
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomTo(viewRef.current.scale * (event.deltaY < 0 ? 1.18 : .84), event.clientX, event.clientY);
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Journey photo viewer">
      <header className="image-lightbox-header">
        <span><Move size={17} /><strong>Pinch to zoom · drag to move</strong></span>
        <button type="button" onClick={onClose} aria-label="Close photo viewer" autoFocus><X size={23} /></button>
      </header>
      <div
        className={`image-lightbox-stage ${view.scale > 1 ? "zoomed" : ""}`}
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
        onDoubleClick={(event) => zoomTo(view.scale > 1 ? 1 : 2.5, event.clientX, event.clientY)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
        />
      </div>
      <div className="image-lightbox-controls" aria-label="Photo zoom controls">
        <button type="button" onClick={() => zoomTo(view.scale - .5)} aria-label="Zoom out" disabled={view.scale <= 1}><ZoomOut size={20} /></button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button type="button" onClick={() => zoomTo(view.scale + .5)} aria-label="Zoom in" disabled={view.scale >= 5}><ZoomIn size={20} /></button>
        <button type="button" className="image-lightbox-fit" onClick={() => zoomTo(1)}>Fit</button>
      </div>
      <p className="image-lightbox-caption">{caption}</p>
    </div>
  );
}

function Friends({
  people,
  posts,
  query,
  setQuery,
  manageFriend,
  openMessage,
  inviteFriends,
  toggleMotivation,
  addComment,
  deleteComment,
  deletePost,
  reportPost,
  sharePost,
  saveJourney,
}: {
  people: Person[];
  posts: SavedPost[];
  query: string;
  setQuery: (value: string) => void;
  manageFriend: (username: string, action: "request" | "accept" | "decline" | "remove" | "block") => void;
  openMessage: (username: string) => void;
  inviteFriends: () => void;
  toggleMotivation: (post: SavedPost) => void;
  addComment: (postId: string, body: string) => Promise<boolean>;
  deleteComment: (postId: string, commentId: string) => void;
  deletePost: (post: SavedPost) => void;
  reportPost: (post: SavedPost) => void;
  sharePost: (post: SavedPost) => void;
  saveJourney: (post: SavedPost, action?: "toggle" | "plan") => void;
}) {
  const matches = people.filter((person) =>
    [person.displayName, person.username, person.homeBase, person.favoriteActivities].join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const incoming = matches.filter((person) => person.relationship === "incoming");
  const friends = matches.filter((person) => person.relationship === "friends");
  const allFriends = people.filter((person) => person.relationship === "friends");
  const discover = matches.filter((person) => person.relationship === "none" || person.relationship === "outgoing");

  return (
    <section className="screen-stack friends-screen">
      {allFriends.length === 0 && (
        <section className="friends-empty">
          <span><Users size={34} /></span>
          <div><span className="eyebrow">YOUR OUTDOOR CIRCLE</span><h2>Adventures are better together</h2><p>Invite friends to Roavly, then add each other here. Their outdoor journeys will appear on this page once you are connected.</p></div>
          <button onClick={inviteFriends}><Share2 size={17} /> Invite friends</button>
        </section>
      )}
      <div className="member-search"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members by name, username or activity" aria-label="Search Roavly members" /></div>
      {incoming.length > 0 && <MemberSection title="Friend requests" people={incoming} manageFriend={manageFriend} openMessage={openMessage} />}
      {friends.length > 0 && <MemberSection title="Your friends" people={friends} manageFriend={manageFriend} openMessage={openMessage} />}
      <MemberSection title={people.length ? "Find more people" : "No other members yet"} people={discover} manageFriend={manageFriend} openMessage={openMessage} emptyCopy={people.length ? "No members match your search." : "Share your invite link. New members appear here after they create their account."} />
      {allFriends.length > 0 && (
        <section className="friends-journeys">
          <div className="friends-journeys-heading"><span className="eyebrow">FRIENDS FEED</span><h2>Your friends’ journeys</h2><p>Posts from accepted friends appear here automatically.</p></div>
          {posts.length ? posts.map((post) => (
            <JourneyPost key={post.id} post={post} toggleMotivation={toggleMotivation} addComment={addComment} deleteComment={deleteComment} deletePost={deletePost} reportPost={reportPost} sharePost={sharePost} saveJourney={saveJourney} />
          )) : (
            <div className="friend-posts-empty"><ImagePlus size={28} /><strong>No friend journeys yet</strong><p>Your friends’ first shared adventures will show up here.</p></div>
          )}
        </section>
      )}
    </section>
  );
}

function MemberSection({
  title,
  people,
  manageFriend,
  openMessage,
  emptyCopy,
}: {
  title: string;
  people: Person[];
  manageFriend: (username: string, action: "request" | "accept" | "decline" | "remove" | "block") => void;
  openMessage: (username: string) => void;
  emptyCopy?: string;
}) {
  return (
    <section className="member-section">
      <h2>{title}</h2>
      {people.length ? <div className="member-grid">{people.map((person) => <MemberCard key={person.username} person={person} manageFriend={manageFriend} openMessage={openMessage} />)}</div> : emptyCopy && <p className="member-empty">{emptyCopy}</p>}
    </section>
  );
}

function MemberCard({ person, manageFriend, openMessage }: { person: Person; manageFriend: (username: string, action: "request" | "accept" | "decline" | "remove" | "block") => void; openMessage: (username: string) => void }) {
  return (
    <article className="member-card">
      <Avatar name={person.displayName} large />
      <div className="member-copy"><h3>{person.displayName}</h3><span>@{person.username}</span>{person.bio && <p>{person.bio}</p>}<small>{[person.homeBase, person.favoriteActivities].filter(Boolean).join(" · ") || "New to Roavly"}</small><div className="match-tags"><span>{person.experienceLevel}</span><span>{person.pacePreference} pace</span><span>{person.groupStyle}</span></div></div>
      <div className="friend-actions">
        {person.relationship === "none" && <button onClick={() => manageFriend(person.username, "request")}><UserPlus size={16} /> Add friend</button>}
        {person.relationship === "outgoing" && <button className="muted" disabled><Check size={16} /> Requested</button>}
        {person.relationship === "incoming" && <><button onClick={() => manageFriend(person.username, "accept")}><UserCheck size={16} /> Accept</button><button className="muted" onClick={() => manageFriend(person.username, "decline")}><X size={16} /> Decline</button></>}
        {person.relationship === "friends" && <><button onClick={() => openMessage(person.username)}><MessageCircle size={16} /> Message</button><button className="muted" onClick={() => manageFriend(person.username, "remove")}><UserMinus size={16} /> Friends</button><button className="danger-text" onClick={() => manageFriend(person.username, "block")}><ShieldCheck size={16} /> Block</button></>}
      </div>
    </article>
  );
}

function ProfileView({
  profile,
  initial,
  posts,
  friendsCount,
  outdoorMinutes,
  openEdit,
  openComposer,
  openMap,
  toggleMotivation,
  addComment,
  deleteComment,
  deletePost,
  reportPost,
  sharePost,
  saveJourney,
}: {
  profile: Profile;
  initial: string;
  posts: SavedPost[];
  friendsCount: number;
  outdoorMinutes: number;
  openEdit: () => void;
  openComposer: () => void;
  openMap: () => void;
  toggleMotivation: (post: SavedPost) => void;
  addComment: (postId: string, body: string) => Promise<boolean>;
  deleteComment: (postId: string, commentId: string) => void;
  deletePost: (post: SavedPost) => void;
  reportPost: (post: SavedPost) => void;
  sharePost: (post: SavedPost) => void;
  saveJourney: (post: SavedPost, action?: "toggle" | "plan") => void;
}) {
  const [plusActive, setPlusActive] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/monetization").then((response) => response.json()).then((payload) => {
      if (active) setPlusActive(payload.entitlements?.features?.profile_badge === true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const totalDistance = posts.reduce((total, post) => total + post.distanceKm, 0);
  const highestElevation = posts.reduce((highest, post) => Math.max(highest, post.elevationMetres), 0);
  const explorerLevel = outdoorAchievements.filter((achievement) => outdoorMinutes >= achievement.minutes).at(-1)?.name ?? "New Explorer";
  const coverStyle = posts[0]?.imageUrl
    ? { backgroundImage: `linear-gradient(180deg, rgba(8, 29, 22, .08), rgba(8, 29, 22, .62)), url("${posts[0].imageUrl}")` }
    : undefined;

  return (
    <section className="screen-stack explorer-profile">
      <article className="profile-card explorer-identity">
        <div className="profile-cover" style={coverStyle}>
          {!posts[0] && <Mountain size={46} />}
          <span className="cover-label"><Compass size={15} /> Explorer passport</span>
        </div>
        <div className="profile-body">
          <div className="profile-identity-row">
            <span className="profile-avatar">{initial}</span>
            <button className="edit-profile" onClick={openEdit}><Edit3 size={16} /> Edit profile</button>
          </div>
          <span className="explorer-level"><Award size={14} /> {explorerLevel}</span>
          {plusActive && <span className="roavly-plus-badge"><Gem size={14} /> Roavly+ Explorer</span>}
          <h2>{profile.displayName}</h2><span className="profile-handle">@{profile.username}</span>
          <p>{profile.bio || "Tell your outdoor story—what gets you moving, wandering and looking for the next trail."}</p>
          <div className="profile-meta">{profile.homeBase && <span><MapPin size={16} /> {profile.homeBase}</span>}{profile.favoriteActivities && <span><Compass size={16} /> {profile.favoriteActivities}</span>}</div>
          <div className="profile-social-row"><span><strong>{friendsCount}</strong><small>Friends</small></span><span><strong>{posts.length}</strong><small>Journeys</small></span><button onClick={openMap}><MapPin size={15} /> Personal map</button></div>
          <div className="explorer-metrics" aria-label="Explorer statistics">
            <span><Timer size={19} /><strong>{formatOutdoorTime(outdoorMinutes)}</strong><small>Hours outside</small></span>
            <span><Route size={19} /><strong>{totalDistance ? `${totalDistance.toFixed(1)} km` : "—"}</strong><small>Total distance</small></span>
            <span><Mountain size={19} /><strong>{highestElevation ? `${highestElevation} m` : "—"}</strong><small>Highest elevation</small></span>
          </div>
          <div className="compatibility-row" aria-label="Adventure preferences">
            <span><Mountain size={15} /> {profile.experienceLevel}</span>
            <span><Route size={15} /> {profile.pacePreference} pace</span>
            <span><Clock3 size={15} /> {profile.availability}</span>
            <span><Users size={15} /> {profile.groupStyle}</span>
            <span><Compass size={15} /> Up to {profile.travelRadiusKm} km</span>
          </div>
          {profile.accessibilityNeeds && <p className="accessibility-note"><ShieldCheck size={16} /> <span><strong>Accessibility preferences</strong>{profile.accessibilityNeeds}</span></p>}
        </div>
      </article>
      <section className="passport-summary">
        <div><span className="eyebrow">ADVENTURE PASSPORT</span><h2>Your outdoor identity</h2><p>Every real journey adds another stamp to your story.</p></div>
        <div className="passport-stamps"><span><Mountain size={19} /><strong>{new Set(posts.map((post) => post.activityType)).size}</strong><small>Activities</small></span><span><MapPin size={19} /><strong>{new Set(posts.map((post) => post.location).filter(Boolean)).size}</strong><small>Places</small></span></div>
      </section>
      <OutdoorTracker minutes={outdoorMinutes} />
      {posts.length > 0 && (
        <section className="profile-gallery-section">
          <div className="section-title"><div><span className="eyebrow">GALLERY</span><h2>Favourite adventures</h2></div><button onClick={openMap}><MapPin size={17} /> View map</button></div>
          <div className="profile-gallery">
            {posts.slice(0, 6).map((post) => (
              <button key={post.id} onClick={() => document.getElementById(`post-${post.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} aria-label={`Open ${post.activityType} at ${post.location}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.imageUrl} alt="" /><span>{post.activityType}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="section-title recent-journeys-title"><div><span className="eyebrow">RECENT JOURNEYS</span><h2>Your trail so far</h2></div><button onClick={openComposer}><Plus size={17} /> New journey</button></div>
      {posts.length ? posts.map((post) => <JourneyPost key={post.id} post={post} toggleMotivation={toggleMotivation} addComment={addComment} deleteComment={deleteComment} deletePost={deletePost} reportPost={reportPost} sharePost={sharePost} saveJourney={saveJourney} />) : <EmptyState icon={ImagePlus} title="Your explorer passport is waiting" copy="Share your first real outdoor moment and start building a trail of places, hours and achievements." action="Share journey" onAction={openComposer} />}
    </section>
  );
}

function ComposerModal({
  draft,
  setDraft,
  photo,
  photoPreview,
  preparingPhoto,
  composerError,
  choosePhoto,
  publishing,
  profileName,
  initial,
  ageBand,
  close,
  submit,
}: {
  draft: ComposerDraft;
  setDraft: Dispatch<SetStateAction<ComposerDraft>>;
  photo: File | null;
  photoPreview: string;
  preparingPhoto: boolean;
  composerError: string;
  choosePhoto: (file: File | null) => void;
  publishing: boolean;
  profileName: string;
  initial: string;
  ageBand: string;
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function update<K extends keyof ComposerDraft>(key: K, value: ComposerDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  const [gpxStatus, setGpxStatus] = useState("");
  async function importGpx(file: File | null) {
    if (!file) return;
    try {
      const xml = new DOMParser().parseFromString(await file.text(), "application/xml");
      if (xml.querySelector("parsererror")) throw new Error("That GPX file could not be read.");
      const points = Array.from(xml.querySelectorAll("trkpt, rtept")).map((point) => ({
        lat: Number(point.getAttribute("lat")),
        lng: Number(point.getAttribute("lon")),
        elevation: Number(point.querySelector("ele")?.textContent || 0),
        time: point.querySelector("time")?.textContent || "",
      })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      if (points.length < 2) throw new Error("That GPX file does not contain a usable route.");
      let distance = 0;
      let ascent = 0;
      for (let index = 1; index < points.length; index += 1) {
        distance += haversineKm(points[index - 1], points[index]);
        ascent += Math.max(0, points[index].elevation - points[index - 1].elevation);
      }
      const firstTime = Date.parse(points.find((point) => point.time)?.time || "");
      const lastTime = Date.parse([...points].reverse().find((point) => point.time)?.time || "");
      const duration = Number.isFinite(firstTime) && Number.isFinite(lastTime) && lastTime > firstTime
        ? Math.max(1, Math.round((lastTime - firstTime) / 60000))
        : 0;
      setDraft((current) => ({
        ...current,
        distanceKm: distance ? distance.toFixed(1) : current.distanceKm,
        elevationMetres: ascent ? String(Math.round(ascent)) : current.elevationMetres,
        durationMinutes: duration ? String(duration) : current.durationMinutes,
      }));
      setGpxStatus(`Route imported: ${distance.toFixed(1)} km${duration ? ` · ${formatDuration(duration)}` : ""}. Choose a Google location to finish.`);
    } catch (error) {
      setGpxStatus(error instanceof Error ? error.message : "That GPX route could not be imported.");
    }
  }
  const missingRequirements = [
    !photo ? "a photo" : "",
    !draft.caption.trim() ? "a caption" : "",
    !Number(draft.durationMinutes) ? "time outdoors" : "",
    !draft.placeId || !draft.latitude || !draft.longitude ? "a Google Maps location" : "",
  ].filter(Boolean);
  const canShare = !missingRequirements.length && !preparingPhoto && !publishing;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="composer-modal wide" role="dialog" aria-modal="true" aria-labelledby="composer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eyebrow">Public community post</span><h2 id="composer-title">Share a journey</h2></div><button onClick={close} aria-label="Close composer"><X size={22} /></button></header>
        <form onSubmit={submit}>
          <div className="modal-author"><span className="avatar">{initial}</span><span><strong>{profileName}</strong><small>Visible to signed-in Roavly members</small></span></div>
          {draft.inspiredByPostId && <div className="motivation-chain-banner"><Sparkles size={19} /><div><strong>You were motivated by another journey</strong><span>Sharing this will add your outdoor time to that post’s positive impact.</span></div></div>}
          <label className={`real-photo-picker ${photoPreview ? "has-photo" : ""} ${composerError && !photo ? "has-error" : ""}`}>
            {preparingPhoto ? (
              <span className="photo-preparing"><LoaderCircle className="spin" size={30} /><strong>Preparing your photo…</strong><small>iPhone photos are converted and resized automatically.</small></span>
            ) : photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="photo-preview" src={photoPreview} alt="Selected journey upload preview" />
            ) : <span><ImagePlus size={30} /><strong>Choose from your iPhone</strong><small>HEIC, HEIF, JPG, PNG or WebP · automatically optimised</small></span>}
            <input
              type="file"
              accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp"
              disabled={preparingPhoto}
              onChange={(event) => {
                void choosePhoto(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            {photoPreview && !preparingPhoto && <em>Change photo</em>}
          </label>
          <div className="photo-upload-status" aria-live="polite">
            {composerError ? (
              <p className="photo-upload-error" role="alert"><strong>Upload needs attention</strong><span>{composerError}</span></p>
            ) : photo && !preparingPhoto ? (
              <p className="photo-upload-ready"><Check size={16} /><span><strong>Photo ready</strong> You can keep filling in the post.</span></p>
            ) : null}
          </div>
          <textarea value={draft.caption} onChange={(event) => update("caption", event.target.value)} placeholder="What made this adventure worth sharing?" maxLength={500} />
          <div className="form-grid">
            <label><span>Activity</span><select value={draft.activityType} onChange={(event) => update("activityType", event.target.value)}><option>Hiking</option><option>Running</option><option>Rock climbing</option><option>Snowboarding</option><option>Cycling</option><option>Kayaking</option><option>Surfing</option><option>Walking</option><option>Other outdoor activity</option></select></label>
            <label><span>Distance (km) <em>optional</em></span><input type="number" min="0" max="500" step="0.1" value={draft.distanceKm} onChange={(event) => update("distanceKm", event.target.value)} /></label>
            <label><span>Time outdoors (minutes)</span><input type="number" min="1" max="10080" required value={draft.durationMinutes} onChange={(event) => update("durationMinutes", event.target.value)} /><small>Added to your Time Outdoors tracker.</small></label>
            <label><span>Elevation (metres) <em>optional</em></span><input type="number" min="0" max="10000" value={draft.elevationMetres} onChange={(event) => update("elevationMetres", event.target.value)} /></label>
          </div>
          <label className="gpx-import"><Route size={18} /><span><strong>Import activity file</strong><small>Optional GPX import fills distance, time and elevation. Garmin exports work here without connecting your account.</small></span><em>Choose GPX</em><input type="file" accept=".gpx,application/gpx+xml" onChange={(event) => { void importGpx(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /></label>
          {gpxStatus && <p className="gpx-status">{gpxStatus}</p>}
          <GoogleLocationPicker
            value={draft.placeId ? {
              location: draft.location,
              latitude: draft.latitude,
              longitude: draft.longitude,
              placeId: draft.placeId,
            } satisfies SelectedPlace : null}
            onSelect={(place) => setDraft((current) => ({
              ...current,
              location: place?.location ?? "",
              latitude: place?.latitude ?? "",
              longitude: place?.longitude ?? "",
              placeId: place?.placeId ?? "",
            }))}
          />
          <section className="location-privacy-control">
            <div><ShieldCheck size={20} /><span><strong>Protect the exact spot</strong><small>Approximate is the safest default for public discovery.</small></span></div>
            <select value={draft.locationPrivacy} onChange={(event) => update("locationPrivacy", event.target.value)}>
              <option value="approximate">Approximate area for everyone</option>
              <option value="friends" disabled={ageBand !== "18+"}>Exact for friends, approximate for others</option>
              <option value="exact" disabled={ageBand !== "18+"}>Exact pin for everyone</option>
            </select>
            {ageBand !== "18+" && <p>Precise sharing is only available to profiles confirmed as 18+. Your post will use an approximate area.</p>}
          </section>
          <details className="journey-details-form">
            <summary><Info size={18} /> Add useful spot details <span>optional</span></summary>
            <div className="form-grid">
              <label><span>Difficulty</span><select value={draft.difficulty} onChange={(event) => update("difficulty", event.target.value)}><option>Easy</option><option>Moderate</option><option>Hard</option><option>Expert</option></select></label>
              <label><span>Conditions</span><input maxLength={200} value={draft.conditions} onChange={(event) => update("conditions", event.target.value)} placeholder="Dry, muddy, icy, exposed…" /></label>
              <label><span>Phone signal</span><select value={draft.phoneSignal} onChange={(event) => update("phoneSignal", event.target.value)}><option>Unknown</option><option>Good</option><option>Patchy</option><option>None</option></select></label>
              <label><span>Toilets</span><select value={draft.toilets} onChange={(event) => update("toilets", event.target.value)}><option>Unknown</option><option>Available</option><option>Not available</option></select></label>
              <label><span>Dog friendly</span><select value={draft.dogFriendly} onChange={(event) => update("dogFriendly", event.target.value)}><option>Unknown</option><option>Yes, on lead</option><option>Yes, off-lead areas</option><option>No dogs</option></select></label>
              <label><span>Best time</span><input maxLength={120} value={draft.bestTime} onChange={(event) => update("bestTime", event.target.value)} placeholder="Early morning, winter, after rain…" /></label>
            </div>
            <label><span>Useful tip</span><textarea maxLength={400} value={draft.tips} onChange={(event) => update("tips", event.target.value)} placeholder="What would you tell a friend before they go?" /></label>
            <label><span>Parking or transport</span><input maxLength={200} value={draft.parkingInfo} onChange={(event) => update("parkingInfo", event.target.value)} placeholder="Trailhead parking, nearest station, access road…" /></label>
            <label><span>Accessibility</span><input maxLength={240} value={draft.accessibility} onChange={(event) => update("accessibility", event.target.value)} placeholder="Surface, steps, gradients, accessible facilities…" /></label>
          </details>
          <div className="modal-footer">
            <span className="share-readiness">
              <small>{draft.caption.length}/500 characters</small>
              <strong>{publishing ? "Uploading your journey…" : missingRequirements.length ? `Still needed: ${missingRequirements.join(", ")}` : "Everything is ready to share"}</strong>
            </span>
            <button className="publish-button" type="submit" disabled={!canShare}>{publishing ? "Uploading…" : preparingPhoto ? "Preparing photo…" : "Share journey"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProfileModal({ profile, setProfile, saving, close, submit }: { profile: Profile; setProfile: (profile: Profile) => void; saving: boolean; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile({ ...profile, [key]: value });
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="composer-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eyebrow">Your Roavly identity</span><h2 id="profile-title">Edit profile</h2></div><button onClick={close} aria-label="Close profile editor"><X size={22} /></button></header>
        <form onSubmit={submit}>
          <div className="form-grid single">
            <label><span>Display name</span><input required value={profile.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
            <label><span>Username</span><input required value={profile.username} onChange={(event) => update("username", event.target.value)} /><small>Letters, numbers, dots and underscores only.</small></label>
            <label><span>Home base <em>optional</em></span><input value={profile.homeBase} onChange={(event) => update("homeBase", event.target.value)} /></label>
            <label><span>Favourite activities <em>optional</em></span><input value={profile.favoriteActivities} onChange={(event) => update("favoriteActivities", event.target.value)} /></label>
            <label><span>Age range</span><select value={profile.ageBand} onChange={(event) => update("ageBand", event.target.value)}><option>Prefer not to say</option><option>16–17</option><option>18+</option></select><small>Profiles under 18 can only share approximate post locations. Your age range is not shown publicly.</small></label>
            <label><span>Bio <em>optional</em></span><textarea value={profile.bio} onChange={(event) => update("bio", event.target.value)} maxLength={180} /></label>
          </div>
          <div className="profile-preferences-heading"><span className="eyebrow">ADVENTURE COMPATIBILITY</span><h3>Help people find the right fit</h3><p>These are matching signals, not performance rankings.</p></div>
          <div className="form-grid">
            <label><span>Experience</span><select value={profile.experienceLevel} onChange={(event) => update("experienceLevel", event.target.value)}><option>New to outdoors</option><option>Beginner</option><option>All levels</option><option>Intermediate</option><option>Experienced</option></select></label>
            <label><span>Preferred pace</span><select value={profile.pacePreference} onChange={(event) => update("pacePreference", event.target.value)}><option>Relaxed</option><option>Flexible</option><option>Steady</option><option>Fast</option></select></label>
            <label><span>Usually available</span><select value={profile.availability} onChange={(event) => update("availability", event.target.value)}><option>Weekday mornings</option><option>Weekday evenings</option><option>Weekends</option><option>Flexible</option></select></label>
            <label><span>Group style</span><select value={profile.groupStyle} onChange={(event) => update("groupStyle", event.target.value)}><option>One-to-one</option><option>Small group</option><option>Social</option><option>Focused</option><option>Flexible</option></select></label>
            <label><span>Travel radius</span><input type="number" min={5} max={500} value={profile.travelRadiusKm} onChange={(event) => update("travelRadiusKm", Number(event.target.value))} /><small>Maximum kilometres you would usually travel.</small></label>
          </div>
          <label><span>Accessibility preferences <em>optional</em></span><textarea maxLength={240} value={profile.accessibilityNeeds} onChange={(event) => update("accessibilityNeeds", event.target.value)} placeholder="Share anything that would help others plan a suitable activity." /></label>
          <div className="modal-footer"><a href="/api/auth/logout?return_to=%2F"><LogOut size={16} /> Sign out</a><button className="publish-button" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></div>
        </form>
      </section>
    </div>
  );
}

function OutdoorTracker({ minutes, compact = false }: { minutes: number; compact?: boolean }) {
  const unlocked = outdoorAchievements.filter((achievement) => minutes >= achievement.minutes);
  const next = outdoorAchievements.find((achievement) => minutes < achievement.minutes);
  const previousTarget = unlocked.at(-1)?.minutes ?? 0;
  const progress = next ? Math.min(100, Math.round(((minutes - previousTarget) / (next.minutes - previousTarget)) * 100)) : 100;
  if (compact) {
    return (
      <section className="rail-card outdoor-tracker compact">
        <div className="tracker-heading"><div><small>Time outdoors</small><strong>{formatOutdoorTime(minutes)}</strong><span>Across your shared journeys</span></div><span className="tracker-icon sun"><Sparkles size={23} /></span></div>
        <div className="progress-copy"><span>{next ? `${formatOutdoorTime(next.minutes - minutes)} to ${next.name}` : "Every achievement unlocked"}</span><strong>{progress}%</strong></div>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
        <div className="compact-achievement">
          <span><Award size={23} /></span>
          <div><small>Next achievement</small><strong>{next?.name ?? "Roavly Legend"}</strong><em>{next ? `${formatOutdoorTime(next.minutes - minutes)} remaining` : "Every milestone unlocked"}</em></div>
        </div>
      </section>
    );
  }
  return (
    <section className="outdoor-tracker">
      <div className="tracker-summary"><span className="tracker-icon large"><Timer size={29} /></span><div><span className="eyebrow">Your time outdoors</span><h2>{formatOutdoorTime(minutes)}</h2><p>Calculated from every journey you share.</p></div><div className="tracker-next"><small>Next achievement</small><strong>{next?.name ?? "All unlocked!"}</strong><span>{next ? `${formatOutdoorTime(next.minutes - minutes)} remaining` : "You’re a Roavly Legend"}</span></div></div>
      <div className="tracker-progress"><div><i style={{ width: `${progress}%` }} /></div><span>{progress}% to your next achievement</span></div>
      <div className="achievement-list">{outdoorAchievements.map((achievement) => {
        const achieved = minutes >= achievement.minutes;
        return <article className={achieved ? "unlocked" : ""} key={achievement.name}><span><Award size={20} /></span><div><strong>{achievement.name}</strong><small>{achievement.description}</small></div><em>{achieved ? "Unlocked" : formatOutdoorTime(achievement.minutes)}</em></article>;
      })}</div>
    </section>
  );
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "R";
  return <span className={`avatar ${large ? "large" : ""}`}>{initials}</span>;
}

function EmptyState({ icon: Icon, title, copy, action, onAction }: { icon: typeof Compass; title: string; copy: string; action: string; onAction: () => void }) {
  return <section className="empty-state"><span><Icon size={34} /></span><h2>{title}</h2><p>{copy}</p><button onClick={onAction}>{action}</button></section>;
}

function formatDistance(distance: number) {
  return distance > 0 ? `${distance.toFixed(distance % 1 ? 1 : 0)} km` : "—";
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder ? `${remainder}m` : ""}`.trim() : `${remainder}m`;
}

function formatOutdoorTime(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function timeAgo(value: string) {
  const milliseconds = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function upsertPost(posts: SavedPost[], next: SavedPost) {
  return posts.map((post) => (post.id === next.id ? next : post));
}

function haversineKm(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
) {
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

async function createJourneyRecap(post: SavedPost) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = post.imageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Journey photo could not load."));
    });

    context.fillStyle = "#0f3d2e";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const targetHeight = 760;
    const imageRatio = image.width / image.height;
    const targetRatio = canvas.width / targetHeight;
    const sourceWidth = imageRatio > targetRatio ? image.height * targetRatio : image.width;
    const sourceHeight = imageRatio > targetRatio ? image.height : image.width / targetRatio;
    context.drawImage(
      image,
      (image.width - sourceWidth) / 2,
      (image.height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      targetHeight,
    );
    const gradient = context.createLinearGradient(0, 650, 0, 900);
    gradient.addColorStop(0, "rgba(15,61,46,0)");
    gradient.addColorStop(1, "#0f3d2e");
    context.fillStyle = gradient;
    context.fillRect(0, 610, canvas.width, 310);

    context.fillStyle = "#a7f3d0";
    context.font = "700 28px Arial";
    context.fillText(post.activityType.toUpperCase(), 72, 840);
    context.fillStyle = "#ffffff";
    context.font = "700 52px Arial";
    drawWrappedText(context, post.caption, 72, 915, 936, 64, 2);
    context.fillStyle = "rgba(255,255,255,.75)";
    context.font = "32px Arial";
    context.fillText(post.location, 72, 1070);

    const metrics = [
      formatDistance(post.distanceKm),
      formatDuration(post.durationMinutes),
      post.elevationMetres ? `${post.elevationMetres} m` : "—",
    ];
    const labels = ["DISTANCE", "OUTDOORS", "ELEVATION"];
    metrics.forEach((metric, index) => {
      const x = 72 + index * 305;
      context.fillStyle = "#ffffff";
      context.font = "700 34px Arial";
      context.fillText(metric, x, 1162);
      context.fillStyle = "rgba(255,255,255,.58)";
      context.font = "700 18px Arial";
      context.fillText(labels[index], x, 1196);
    });
    context.fillStyle = "#a7f3d0";
    context.font = "700 34px Arial";
    context.fillText("ROAVLY", 72, 1282);
    context.fillStyle = "rgba(255,255,255,.7)";
    context.font = "24px Arial";
    context.fillText("Share the outdoors. Motivate your people.", 245, 1282);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new File([blob], `roavly-${post.id.slice(0, 8)}-recap.png`, { type: "image/png" }) : null;
  } catch {
    return null;
  }
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
}
