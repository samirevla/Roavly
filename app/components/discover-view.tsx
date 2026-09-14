"use client";

import {
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Compass,
  Flag,
  LockKeyhole,
  Map,
  MapPin,
  MessageCircle,
  Mountain,
  Package,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  BadgeDollarSign,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NEAR_ME_RADIUS_KM, type GeoPoint } from "../geo";
import { ExploreMap, JourneyMapPost, type UserLocationStatus } from "./explore-map";
import { AdSlot } from "./ad-slot";
import { MonetizationView } from "./monetization-view";

type DiscoverTab = "Map" | "Saved" | "Plans" | "Clubs" | "Challenges" | "Tips" | "Gear";

type SavedAdventure = {
  id: string;
  postId: string;
  status: "saved" | "planned" | "completed";
  completedAt: string | null;
  title: string;
  activityType: string;
  location: string;
  durationMinutes: number;
  imageUrl: string;
  authorName: string;
  authorUsername: string;
};

type PlanMember = {
  id: string;
  status: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  isViewer: boolean;
  checkedInAt: string | null;
  safeAt: string | null;
};

type AdventurePlan = {
  id: string;
  sourcePostId: string | null;
  title: string;
  activityType: string;
  startsAt: string;
  startedAt: string | null;
  completedAt: string | null;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  experienceLevel: string;
  pace: string;
  equipment: string;
  capacity: number;
  visibility: string;
  status: string;
  safetyNotes: string;
  hostName: string;
  hostUsername: string;
  hostAvatarUrl?: string | null;
  isHost: boolean;
  viewerStatus: string;
  attendeeCount: number;
  members: PlanMember[];
  conversationId: string | null;
  chatExpiresAt: string | null;
};

type Club = {
  id: string;
  name: string;
  description: string;
  activityType: string;
  homeBase: string;
  visibility: string;
  ownerName: string;
  ownerUsername: string;
  memberCount: number;
  viewerJoined: boolean;
  isOwner: boolean;
};

type Challenge = {
  id: string;
  title: string;
  description: string;
  metric: "minutes" | "activities" | "weekends" | "saves";
  target: number;
  progress: number;
  complete: boolean;
};

type SafetyProfile = {
  contactName: string;
  contactMethod: string;
  defaultCheckInMinutes: number;
};

type JourneyFriend = {
  displayName: string;
  username: string;
};

type HubData = {
  saved: SavedAdventure[];
  plans: AdventurePlan[];
  clubs: Club[];
  challenges: Challenge[];
  safety: SafetyProfile;
  passport: {
    outdoorMinutes: number;
    journeyCount: number;
    activityCount: number;
    completedPlans: number;
    completedChallenges: number;
  };
};

const emptyHub: HubData = {
  saved: [],
  plans: [],
  clubs: [],
  challenges: [],
  safety: { contactName: "", contactMethod: "", defaultCheckInMinutes: 120 },
  passport: {
    outdoorMinutes: 0,
    journeyCount: 0,
    activityCount: 0,
    completedPlans: 0,
    completedChallenges: 0,
  },
};

export function DiscoverView({
  initialTab = "Map",
  posts,
  onOpenPost,
  onShareJourney,
  onInspiredJourney,
  onTabChange,
  friends,
  onOpenConversation,
  showToast,
  userLocation = null,
  locationStatus = "idle",
  onRequestLocation,
  nearMeRadiusKm = NEAR_ME_RADIUS_KM,
}: {
  initialTab?: DiscoverTab;
  posts: JourneyMapPost[];
  onOpenPost: (postId: string) => void;
  onShareJourney: () => void;
  onInspiredJourney: (postId: string) => void;
  onTabChange: (tab: DiscoverTab) => void;
  friends: JourneyFriend[];
  onOpenConversation: (conversationId: string) => void;
  showToast: (message: string) => void;
  userLocation?: GeoPoint | null;
  locationStatus?: UserLocationStatus;
  onRequestLocation?: () => void;
  nearMeRadiusKm?: number;
}) {
  const tab = initialTab;
  const [hub, setHub] = useState<HubData>(emptyHub);
  const [loading, setLoading] = useState(true);
  const [planOpen, setPlanOpen] = useState(false);
  const [clubOpen, setClubOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [planSource, setPlanSource] = useState<SavedAdventure | null>(null);
  const [editingPlan, setEditingPlan] = useState<AdventurePlan | null>(null);

  async function loadHub() {
    setLoading(true);
    try {
      const response = await fetch("/api/action-hub");
      const payload = (await response.json()) as HubData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your adventure hub could not load.");
      setHub(payload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Your adventure hub could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialHub() {
      try {
        const response = await fetch("/api/action-hub");
        const payload = (await response.json()) as HubData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Your adventure hub could not load.");
        if (active) setHub(payload);
      } catch (error) {
        if (active) showToast(error instanceof Error ? error.message : "Your adventure hub could not load.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitialHub();
    return () => {
      active = false;
    };
    // The hub refreshes each time Discover mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(url: string, body: object, success: string) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      showToast(payload.error || "That update could not be saved.");
      return false;
    }
    showToast(success);
    await loadHub();
    return true;
  }

  function openPlan(source: SavedAdventure | null = null) {
    setPlanSource(source);
    setPlanOpen(true);
  }

  async function openPlanChat(plan: AdventurePlan) {
    if (plan.conversationId) {
      onOpenConversation(plan.conversationId);
      return;
    }
    try {
      const response = await fetch(`/api/plans/${encodeURIComponent(plan.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_chat" }),
      });
      const payload = (await response.json()) as {
        conversationId?: string;
        error?: string;
      };
      if (!response.ok || !payload.conversationId) {
        throw new Error(payload.error || "The journey chat could not be created.");
      }
      await loadHub();
      showToast("Journey chat is ready.");
      onOpenConversation(payload.conversationId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The journey chat could not be created.");
    }
  }

  const tabCounts: Partial<Record<DiscoverTab, number>> = {
    Saved: hub.saved.length,
    Plans: hub.plans.filter((plan) => !["cancelled", "completed"].includes(plan.status)).length,
    Clubs: hub.clubs.length,
  };

  return (
    <section className="discover-shell">
      <article className="discover-hero">
        <div>
          <span className="eyebrow">FROM INSPIRATION TO ACTION</span>
          <h2>Find it. Plan it. Get outside.</h2>
          <p>Discover real journeys, save the ones that spark something, then turn them into safe plans with people who match your pace.</p>
        </div>
        <button onClick={onShareJourney}><Plus size={18} /> Share a journey</button>
      </article>
      <nav className="discover-tabs" aria-label="Discover tools">
        {([
          ["Map", Map],
          ["Saved", Bookmark],
          ["Plans", CalendarDays],
          ["Clubs", Users],
          ["Challenges", Trophy],
          ["Tips", BadgeDollarSign],
          ["Gear", Package],
        ] as const).map(([label, Icon]) => (
          <button key={label} className={tab === label ? "active" : ""} onClick={() => onTabChange(label)}>
            <Icon size={17} /><span>{label === "Plans" ? "Journeys" : label}</span>
            {tabCounts[label] ? <i>{tabCounts[label]}</i> : null}
          </button>
        ))}
      </nav>

      {tab === "Map" && (
        <ExploreMap
          posts={posts}
          onOpenPost={onOpenPost}
          onShareJourney={onShareJourney}
          userLocation={userLocation}
          locationStatus={locationStatus}
          onRequestLocation={onRequestLocation}
          radiusKm={nearMeRadiusKm}
        />
      )}
      {tab === "Saved" && (
        <SavedView
          items={hub.saved}
          loading={loading}
          onOpenPost={onOpenPost}
          onPlan={openPlan}
          onInspiredJourney={onInspiredJourney}
          onComplete={(postId) => act("/api/saves", { postId, action: "complete" }, "Added to your Motivation Chain.")}
        />
      )}
      {tab === "Plans" && (
        <PlansView
          plans={hub.plans}
          safety={hub.safety}
          friends={friends}
          loading={loading}
          onCreate={() => openPlan()}
          onSafety={() => setSafetyOpen(true)}
          onOpenChat={openPlanChat}
          onEdit={(plan) => setEditingPlan(plan)}
          onAction={(id, action, username) =>
            act(
              `/api/plans/${encodeURIComponent(id)}`,
              { action, username },
              action === "request"
                ? "Your request was sent to the host."
                : action === "invite"
                  ? "Friend invited to the journey."
                  : action === "accept_invite"
                    ? "Journey invitation accepted."
                    : action === "decline_invite"
                      ? "Journey invitation declined."
                      : action === "start"
                        ? "Journey started. Safety check-ins are now available."
                        : action === "complete"
                          ? "Journey completed. The group chat stays open for 48 hours."
                : action === "checkin"
                  ? "Checked in. Have a brilliant adventure."
                  : action === "safe"
                    ? "Marked safe. Your check-in is complete."
                    : "Plan updated.",
            )
          }
        />
      )}
      {tab === "Gear" && (
        <GearExploreView showToast={showToast} />
      )}
      {tab === "Clubs" && (
        <ClubsView
          clubs={hub.clubs}
          loading={loading}
          onCreate={() => setClubOpen(true)}
          onAction={(id, action) =>
            act(
              `/api/clubs/${encodeURIComponent(id)}`,
              { action },
              action === "join" ? "Welcome to the club." : "You left the club.",
            )
          }
        />
      )}
      {tab === "Challenges" && (
        <ChallengesView hub={hub} loading={loading} />
      )}
      {tab === "Tips" && (
        <MonetizationView posts={posts} showToast={showToast} />
      )}

      {planOpen && (
        <PlanModal
          source={planSource}
          close={() => setPlanOpen(false)}
          submit={async (payload) => {
            const saved = await act("/api/plans", payload, "Adventure plan created.");
            if (saved) {
              setPlanOpen(false);
              onTabChange("Plans");
            }
          }}
        />
      )}
      {editingPlan && (
        <EditPlanModal
          plan={editingPlan}
          close={() => setEditingPlan(null)}
          submit={async (payload) => {
            const response = await fetch(`/api/plans/${encodeURIComponent(editingPlan.id)}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "update", ...payload }),
            });
            const result = (await response.json()) as { error?: string; notified?: boolean };
            if (!response.ok) {
              showToast(result.error || "That plan could not be updated.");
              return false;
            }
            showToast(result.notified === false
              ? "Plan updated. No journey chat yet — create chat to notify the group."
              : "Plan updated and the group was notified in chat.");
            setEditingPlan(null);
            await loadHub();
            return true;
          }}
        />
      )}
      {clubOpen && (
        <ClubModal
          close={() => setClubOpen(false)}
          submit={async (payload) => {
            const saved = await act("/api/clubs", payload, "Club created.");
            if (saved) setClubOpen(false);
          }}
        />
      )}
      {safetyOpen && (
        <SafetyModal
          safety={hub.safety}
          close={() => setSafetyOpen(false)}
          submit={async (payload) => {
            const response = await fetch("/api/safety", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok) {
              showToast(result.error || "Your safety circle could not be saved.");
              return;
            }
            showToast("Safety circle saved.");
            setSafetyOpen(false);
            await loadHub();
          }}
        />
      )}
    </section>
  );
}

function SavedView({
  items,
  loading,
  onOpenPost,
  onPlan,
  onInspiredJourney,
  onComplete,
}: {
  items: SavedAdventure[];
  loading: boolean;
  onOpenPost: (postId: string) => void;
  onPlan: (item: SavedAdventure) => void;
  onInspiredJourney: (postId: string) => void;
  onComplete: (postId: string) => void;
}) {
  if (loading) return <HubLoading />;
  if (!items.length) {
    return <HubEmpty icon={Bookmark} title="Your adventure shortlist is empty" copy="Save a journey from the feed and it will wait here for when you are ready." />;
  }
  return (
    <div className="saved-grid">
      {items.map((item) => (
        <article className="saved-card" key={item.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="" />
          <div>
            <span className={`status-pill ${item.status}`}>{item.status}</span>
            <small>{item.activityType} · {formatDuration(item.durationMinutes)}</small>
            <h3>{item.title}</h3>
            <p><MapPin size={14} /> {item.location}</p>
            <em>Shared by @{item.authorUsername}</em>
          </div>
          <footer>
            <button onClick={() => onOpenPost(item.postId)}>View</button>
            <button onClick={() => onPlan(item)}><CalendarDays size={15} /> Plan it</button>
            {item.status === "completed"
              ? <button onClick={() => onInspiredJourney(item.postId)}><Sparkles size={15} /> Share mine</button>
              : <button onClick={() => onComplete(item.postId)}><Check size={15} /> I did it</button>}
          </footer>
        </article>
      ))}
    </div>
  );
}

function PlansView({
  plans,
  safety,
  friends,
  loading,
  onCreate,
  onSafety,
  onAction,
  onOpenChat,
  onEdit,
}: {
  plans: AdventurePlan[];
  safety: SafetyProfile;
  friends: JourneyFriend[];
  loading: boolean;
  onCreate: () => void;
  onSafety: () => void;
  onAction: (id: string, action: string, username?: string) => void;
  onOpenChat: (plan: AdventurePlan) => void;
  onEdit: (plan: AdventurePlan) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);
  if (loading) return <HubLoading />;
  return (
    <div className="hub-stack">
      <div className="hub-toolbar">
        <div><h3>Journey Together</h3><p>Plan the next adventure with your people. Exact meeting coordinates stay hidden until a host accepts someone.</p></div>
        <div><button className="secondary-action" onClick={onSafety}><ShieldCheck size={16} /> Safety circle</button><button onClick={onCreate}><Plus size={16} /> New plan</button></div>
      </div>
      {!safety.contactName && (
        <article className="safety-nudge"><ShieldCheck size={23} /><div><strong>Set up your safety circle</strong><p>Add the person you normally tell before heading outside. Check-in and “I’m safe” unlock only after a journey starts.</p></div><button onClick={onSafety}>Set up</button></article>
      )}
      {plans.length ? plans.map((plan) => {
        const terminal = plan.status === "cancelled" || plan.status === "completed";
        const completed = plan.status === "completed";
        const started =
          !terminal &&
          (plan.status === "started" ||
            Boolean(plan.startedAt) ||
            new Date(plan.startsAt).getTime() <= now);
        const scheduled = !terminal && !started;
        const participant = plan.isHost || plan.viewerStatus === "accepted";
        const existingUsernames = new Set(plan.members.map((member) => member.username));
        const availableFriends = friends.filter(
          (friend) => !existingUsernames.has(friend.username),
        );
        const pendingRequests = plan.members.filter((member) => member.status === "requested");
        const invitedMembers = plan.members.filter((member) => member.status === "invited");
        const acceptedMembers = plan.members.filter((member) => member.status === "accepted");
        const canOpenChat = Boolean(
          plan.conversationId &&
          participant &&
          (!plan.chatExpiresAt || new Date(plan.chatExpiresAt).getTime() > now),
        );
        const canCreateChat = plan.isHost && !terminal && !plan.conversationId;
        const displayedStatus = completed
          ? "completed"
          : plan.status === "cancelled"
            ? "cancelled"
            : started
              ? "started"
              : "scheduled";
        const packList = plan.equipment
          ? plan.equipment.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)
          : [];

        return (
          <article className={`plan-card journey-${displayedStatus}`} key={plan.id}>
            <header className="plan-card-hero">
              <span className="plan-activity-icon" aria-hidden><CalendarDays size={20} /></span>
              <div className="plan-hero-copy">
                <small className="plan-activity-label">{plan.activityType}</small>
                <h3>{plan.title}</h3>
                <p>Hosted by @{plan.hostUsername}</p>
              </div>
              <div className="plan-hero-aside">
                <i className={`plan-state ${displayedStatus}`}>{displayedStatus}</i>
                {plan.isHost && scheduled && (
                  <button type="button" className="plan-edit-btn" onClick={() => onEdit(plan)}>
                    <Pencil size={14} /> Edit
                  </button>
                )}
              </div>
            </header>

            <div className="plan-details">
              <span><Clock3 size={16} /><strong>{formatPlanDate(plan.startsAt)}</strong><small>{started ? "Journey started" : completed ? "Original start time" : "Starts automatically"}</small></span>
              <span><MapPin size={16} /><strong>{plan.location}</strong><small>{plan.viewerStatus === "accepted" || plan.isHost ? "Meeting area" : "Exact pin hidden until accepted"}</small></span>
              <span><Mountain size={16} /><strong>{plan.experienceLevel}</strong><small>{plan.pace} pace</small></span>
              <span><Users size={16} /><strong>{plan.attendeeCount}/{plan.capacity}</strong><small>Places</small></span>
            </div>

            <div className="plan-who">
              <div className="plan-who-head">
                <strong>Who’s coming</strong>
                <small>{plan.attendeeCount} of {plan.capacity} places</small>
              </div>
              <div className="plan-who-strip" aria-label="Accepted members">
                {acceptedMembers.length ? acceptedMembers.map((member) => (
                  <span className="plan-who-chip" key={member.id} title={`@${member.username}`}>
                    {member.avatarUrl
                      ? <img src={member.avatarUrl} alt="" />
                      : <em>{member.displayName.slice(0, 1).toUpperCase()}</em>}
                    <span>{member.displayName.split(" ")[0]}</span>
                  </span>
                )) : (
                  <span className="plan-who-empty">{plan.isHost ? "Invite friends or accept join requests." : "Spots are filling as the host accepts people."}</span>
                )}
              </div>
            </div>

            {packList.length > 0 && (
              <div className="plan-bring">
                <strong>What to bring</strong>
                <ul>
                  {packList.map((item) => (
                    <li key={item}><Check size={14} /><span>{item}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {plan.safetyNotes && <p className="plan-note"><strong>Host safety note:</strong> {plan.safetyNotes}</p>}

            {scheduled && (
              <div className="journey-lifecycle-note">
                <Clock3 size={17} />
                <span><strong>Not started yet</strong><small>Safety check-ins unlock at the scheduled time, or when the host starts the journey early.</small></span>
              </div>
            )}
            {completed && plan.chatExpiresAt && canOpenChat && (
              <div className="journey-lifecycle-note complete">
                <MessageCircle size={17} />
                <span><strong>Journey complete</strong><small>The group chat closes {relativeCloseTime(plan.chatExpiresAt, now)}.</small></span>
              </div>
            )}

            {plan.isHost && scheduled && pendingRequests.length > 0 && (
              <div className="join-requests">
                <strong>Join requests</strong>
                {pendingRequests.map((member) => (
                  <div key={member.id}><span>{member.displayName} <small>@{member.username}</small></span><button onClick={() => onAction(plan.id, "accept", member.username)}>Accept</button><button className="muted" onClick={() => onAction(plan.id, "decline", member.username)}>Decline</button></div>
                ))}
              </div>
            )}
            {plan.isHost && scheduled && (
              <details className="invite-friends-panel">
                <summary><span><UserPlus size={16} /><strong>Invite friends</strong></span><small>{invitedMembers.length ? `${invitedMembers.length} waiting` : "Choose from your friends"}</small></summary>
                {invitedMembers.length > 0 && (
                  <div className="invited-members">
                    {invitedMembers.map((member) => <span key={member.id}>{member.displayName}<small>Invited</small></span>)}
                  </div>
                )}
                <div className="invite-friend-list">
                  {availableFriends.length ? availableFriends.map((friend) => (
                    <div key={friend.username}>
                      <span><strong>{friend.displayName}</strong><small>@{friend.username}</small></span>
                      <button onClick={() => onAction(plan.id, "invite", friend.username)}>Invite</button>
                    </div>
                  )) : (
                    <p>{friends.length ? "Every friend is already included or invited." : "Add friends to Waymark, then invite them directly from here."}</p>
                  )}
                </div>
              </details>
            )}

            <footer className="plan-card-actions">
              <div className="plan-primary-actions">
                {scheduled && !plan.isHost && plan.viewerStatus === "none" && (
                  <button className="plan-cta" onClick={() => onAction(plan.id, "request")}><Users size={16} /> Ask to join</button>
                )}
                {scheduled && !plan.isHost && plan.viewerStatus === "requested" && (
                  <button className="plan-cta" disabled><Clock3 size={16} /> Request pending</button>
                )}
                {scheduled && !plan.isHost && plan.viewerStatus === "invited" && (
                  <button className="plan-cta" onClick={() => onAction(plan.id, "accept_invite")}><Check size={16} /> Join journey</button>
                )}
                {scheduled && plan.isHost && (
                  <button className="plan-cta start-journey" onClick={() => onAction(plan.id, "start")}><Play size={16} /> Start journey</button>
                )}
                {(canCreateChat || canOpenChat) && (
                  <button className="plan-cta journey-chat-action" onClick={() => onOpenChat(plan)}>
                    <MessageCircle size={16} /> {canOpenChat ? "Open chat" : "Create chat"}
                  </button>
                )}
                {started && participant && (
                  <button className="plan-cta safe-action" onClick={() => onAction(plan.id, "safe")}><CheckCircle2 size={16} /> I’m safe</button>
                )}
                {started && plan.isHost && (
                  <button className="plan-cta complete-journey" onClick={() => onAction(plan.id, "complete")}><CheckCircle2 size={16} /> Complete</button>
                )}
              </div>
              <div className="plan-secondary-actions">
                {scheduled && !plan.isHost && plan.viewerStatus === "invited" && (
                  <button className="muted" onClick={() => onAction(plan.id, "decline_invite")}><X size={16} /> Decline invite</button>
                )}
                {started && participant && (
                  <button onClick={() => onAction(plan.id, "checkin")}><Flag size={16} /> Check-in</button>
                )}
                {plan.isHost && scheduled && (
                  <button className="muted" onClick={onSafety}><ShieldCheck size={16} /> Safety</button>
                )}
              </div>
            </footer>
          </article>
        );
      }) : <HubEmpty icon={CalendarDays} title="No adventure plans yet" copy="Create a date, meeting area, pace and capacity—then invite the right people." action="Create a plan" onAction={onCreate} />}
    </div>
  );
}

function ClubsView({
  clubs,
  loading,
  onCreate,
  onAction,
}: {
  clubs: Club[];
  loading: boolean;
  onCreate: () => void;
  onAction: (id: string, action: "join" | "leave") => void;
}) {
  if (loading) return <HubLoading />;
  return (
    <div className="hub-stack">
      <div className="hub-toolbar"><div><h3>Outdoor clubs</h3><p>Small communities around an activity, location or shared rhythm.</p></div><button onClick={onCreate}><Plus size={16} /> Start a club</button></div>
      {clubs.length ? <div className="club-grid">{clubs.map((club) => (
        <article className="club-card" key={club.id}>
          <span className="club-badge"><Mountain size={24} /></span>
          <small>{club.activityType}</small>
          <h3>{club.name}</h3>
          <p>{club.description || "A new Waymark outdoor community."}</p>
          <div><span><MapPin size={14} /> {club.homeBase || "Worldwide"}</span><span><Users size={14} /> {club.memberCount} {club.memberCount === 1 ? "member" : "members"}</span></div>
          <em>Started by @{club.ownerUsername}</em>
          {club.isOwner
            ? <button disabled><ShieldCheck size={16} /> You run this club</button>
            : club.viewerJoined
              ? <button className="joined" onClick={() => onAction(club.id, "leave")}><Check size={16} /> Joined</button>
              : <button onClick={() => onAction(club.id, "join")}><Plus size={16} /> Join club</button>}
        </article>
      ))}</div> : <HubEmpty icon={Users} title="Be the first club starter" copy="Create a welcoming home for a local trail, activity or regular weekend crew." action="Start a club" onAction={onCreate} />}
    </div>
  );
}

function ChallengesView({ hub, loading }: { hub: HubData; loading: boolean }) {
  if (loading) return <HubLoading />;
  return (
    <div className="hub-stack">
      <article className="passport-card">
        <div><span><Mountain size={27} /></span><small>YOUR OUTDOOR PASSPORT</small><h3>Progress that celebrates showing up</h3><p>No leaderboards. Your passport grows through time, variety and community action.</p></div>
        <div className="passport-stats">
          <span><strong>{formatDuration(hub.passport.outdoorMinutes)}</strong><small>outdoors</small></span>
          <span><strong>{hub.passport.journeyCount}</strong><small>journeys</small></span>
          <span><strong>{hub.passport.activityCount}</strong><small>activities</small></span>
          <span><strong>{hub.passport.completedChallenges}</strong><small>challenges</small></span>
        </div>
      </article>
      <div className="challenge-grid">
        {hub.challenges.map((challenge) => {
          const percent = Math.min(100, Math.round((challenge.progress / challenge.target) * 100));
          return (
            <article className={`challenge-card ${challenge.complete ? "complete" : ""}`} key={challenge.id}>
              <span>{challenge.complete ? <CheckCircle2 size={22} /> : <Trophy size={22} />}</span>
              <small>{challenge.complete ? "ACHIEVED" : "PERSONAL CHALLENGE"}</small>
              <h3>{challenge.title}</h3><p>{challenge.description}</p>
              <div className="challenge-track"><i style={{ width: `${percent}%` }} /></div>
              <strong>{formatChallengeProgress(challenge)}</strong>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function EditPlanModal({
  plan,
  close,
  submit,
}: {
  plan: AdventurePlan;
  close: () => void;
  submit: (payload: object) => Promise<boolean | void> | boolean | void;
}) {
  const [form, setForm] = useState(() => ({
    title: plan.title,
    activityType: plan.activityType,
    startsAt: toLocalInput(new Date(plan.startsAt)),
    location: plan.location,
    latitude: (plan.latitude ?? null) as number | null,
    longitude: (plan.longitude ?? null) as number | null,
    experienceLevel: plan.experienceLevel,
    pace: plan.pace,
    equipment: plan.equipment || "",
    capacity: plan.capacity,
    visibility: plan.visibility || "public",
    safetyNotes: plan.safetyNotes || "",
  }));
  const [saving, setSaving] = useState(false);
  function update(key: string, value: string | number | null) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  return (
    <Modal title="Edit plan" eyebrow="HOST CONTROLS" close={close}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        try {
          await submit({
            ...form,
            startsAt: new Date(form.startsAt).toISOString(),
            latitude: form.latitude,
            longitude: form.longitude,
          });
        } finally {
          setSaving(false);
        }
      }}>
        <div className="form-grid single">
          <label><span>Plan title</span><input required maxLength={80} value={form.title} onChange={(event) => update("title", event.target.value)} /></label>
          <label><span>Date and time</span><input required type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></label>
          <label><span>Meeting area</span><input required maxLength={160} value={form.location} onChange={(event) => update("location", event.target.value)} /><small>Exact coordinates stay private until people are accepted.</small></label>
        </div>
        <div className="form-grid">
          <label><span>Activity</span><select value={form.activityType} onChange={(event) => update("activityType", event.target.value)}><ActivityOptions /></select></label>
          <label><span>Experience</span><select value={form.experienceLevel} onChange={(event) => update("experienceLevel", event.target.value)}><option>Beginner friendly</option><option>All levels</option><option>Intermediate</option><option>Experienced</option></select></label>
          <label><span>Pace</span><select value={form.pace} onChange={(event) => update("pace", event.target.value)}><option>Relaxed</option><option>Flexible</option><option>Steady</option><option>Fast</option></select></label>
          <label><span>Group capacity</span><input type="number" min={2} max={50} value={form.capacity} onChange={(event) => update("capacity", Number(event.target.value))} /></label>
          <label><span>Visibility</span><select value={form.visibility} onChange={(event) => update("visibility", event.target.value)}><option value="public">Public</option><option value="friends">Friends</option></select></label>
        </div>
        <label><span>Equipment <em>optional</em></span><input maxLength={240} value={form.equipment} onChange={(event) => update("equipment", event.target.value)} placeholder="Water, head torch, waterproof layer…" /></label>
        <label><span>Safety note <em>optional</em></span><textarea maxLength={300} value={form.safetyNotes} onChange={(event) => update("safetyNotes", event.target.value)} placeholder="Conditions, turnaround time, emergency considerations…" /></label>
        <footer className="modal-footer"><span><LockKeyhole size={16} /> Accepted members are notified in the journey chat.</span><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></footer>
      </form>
    </Modal>
  );
}

function GearExploreView({ showToast }: { showToast: (message: string) => void }) {
  type CatalogProduct = { id: string; brand: string; productName: string };
  type GearReview = {
    id: string;
    catalogId: string;
    rating: number;
    body: string;
    postId: string | null;
    createdAt: string;
    authorName: string;
    authorUsername: string;
  };
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [reviews, setReviews] = useState<GearReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [postId, setPostId] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadGear() {
    setLoading(true);
    try {
      const [catalogRes, reviewRes] = await Promise.all([
        fetch("/api/gear-tags"),
        fetch("/api/gear-reviews"),
      ]);
      const catalogPayload = (await catalogRes.json()) as { catalog?: CatalogProduct[] };
      const reviewPayload = (await reviewRes.json()) as { reviews?: GearReview[]; error?: string };
      setCatalog(catalogPayload.catalog || []);
      setReviews(reviewPayload.reviews || []);
      if (!selectedId && catalogPayload.catalog?.length) setSelectedId(catalogPayload.catalog[0].id);
    } catch {
      showToast("Gear catalog could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedReviews = reviews.filter((review) => review.catalogId === selectedId);
  const average = selectedReviews.length
    ? selectedReviews.reduce((sum, review) => sum + review.rating, 0) / selectedReviews.length
    : 0;

  return (
    <div className="hub-stack gear-explore">
      <div className="hub-toolbar">
        <div>
          <h3>Outdoor gear</h3>
          <p>Browse curated kit, leave community star reviews, and see disclosed sponsored placements from outdoor brands.</p>
        </div>
      </div>
      <AdSlot placement="explore_gear" />
      {loading ? <HubLoading /> : (
        <>
          <div className="gear-catalog-grid">
            {catalog.map((product) => {
              const productReviews = reviews.filter((review) => review.catalogId === product.id);
              const avg = productReviews.length
                ? productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length
                : 0;
              return (
                <button
                  key={product.id}
                  type="button"
                  className={`gear-product-card ${selectedId === product.id ? "active" : ""}`}
                  onClick={() => setSelectedId(product.id)}
                >
                  <span className="gear-product-icon"><Package size={22} /></span>
                  <small>{product.brand}</small>
                  <strong>{product.productName}</strong>
                  <em>{productReviews.length ? `${avg.toFixed(1)} ★ · ${productReviews.length} reviews` : "No reviews yet"}</em>
                </button>
              );
            })}
          </div>
          {selectedId && (
            <article className="gear-review-panel">
              <header>
                <div>
                  <small>COMMUNITY REVIEWS</small>
                  <h3>{catalog.find((item) => item.id === selectedId)?.productName}</h3>
                  <p>{selectedReviews.length ? `${average.toFixed(1)} average from ${selectedReviews.length} reviews` : "Be the first to review this kit."}</p>
                </div>
              </header>
              <form className="gear-review-form" onSubmit={async (event) => {
                event.preventDefault();
                if (saving) return;
                setSaving(true);
                try {
                  const response = await fetch("/api/gear-reviews", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      catalogId: selectedId,
                      rating,
                      body,
                      postId: postId.trim() || null,
                    }),
                  });
                  const payload = (await response.json()) as { error?: string };
                  if (!response.ok) {
                    showToast(payload.error || "Review could not be saved.");
                    return;
                  }
                  showToast("Thanks — your gear review is live.");
                  setBody("");
                  setPostId("");
                  setRating(5);
                  await loadGear();
                } finally {
                  setSaving(false);
                }
              }}>
                <label><span>Your rating</span>
                  <div className="gear-star-row">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" className={value <= rating ? "on" : ""} onClick={() => setRating(value)} aria-label={`${value} stars`}>
                        <Star size={18} fill={value <= rating ? "currentColor" : "none"} />
                      </button>
                    ))}
                  </div>
                </label>
                <label><span>Short review</span><textarea required maxLength={280} value={body} onChange={(event) => setBody(event.target.value)} placeholder="How did this hold up on trail?" /></label>
                <label><span>I used this on a journey <em>optional post id</em></span><input maxLength={80} value={postId} onChange={(event) => setPostId(event.target.value)} placeholder="Paste a journey post id if you tagged it" /></label>
                <button type="submit" disabled={saving}>{saving ? "Posting…" : "Post review"}</button>
              </form>
              <div className="gear-review-list">
                {selectedReviews.length ? selectedReviews.map((review) => (
                  <article key={review.id}>
                    <header>
                      <strong>{review.authorName}</strong>
                      <small>@{review.authorUsername} · {review.rating}★</small>
                    </header>
                    <p>{review.body}</p>
                    {review.postId && <em>Used on a journey · {review.postId.slice(0, 8)}…</em>}
                  </article>
                )) : <p className="gear-review-empty">No community reviews for this product yet.</p>}
              </div>
            </article>
          )}
          <p className="gear-monetization-note">Sponsored placements use existing ad campaigns from monetization admin / partner paths. Brands do not pay through this Explore surface — disclosed “Sponsored” labels appear when a live campaign is available.</p>
        </>
      )}
    </div>
  );
}

function PlanModal({
  source,
  close,
  submit,
}: {
  source: SavedAdventure | null;
  close: () => void;
  submit: (payload: object) => void;
}) {
  const [form, setForm] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setMinutes(0, 0, 0);
    return {
      sourcePostId: source?.postId || "",
      title: source ? `${source.activityType} at ${source.location}` : "",
      activityType: source?.activityType || "Hiking",
      startsAt: toLocalInput(tomorrow),
      location: source?.location || "",
      experienceLevel: "All levels",
      pace: "Flexible",
      equipment: "",
      capacity: 8,
      visibility: "public",
      safetyNotes: "",
    };
  });
  function update(key: string, value: string | number) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  return (
    <Modal title="Plan an adventure" eyebrow={source ? "INSPIRED BY A SAVED JOURNEY" : "GET PEOPLE OUTSIDE"} close={close}>
      <form onSubmit={(event) => { event.preventDefault(); submit({ ...form, startsAt: new Date(form.startsAt).toISOString() }); }}>
        <div className="form-grid single">
          <label><span>Plan title</span><input required maxLength={80} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Saturday sunrise hike" /></label>
          <label><span>Date and time</span><input required type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></label>
          <label><span>Meeting area</span><input required maxLength={160} value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="Share a broad area; send exact details after accepting people" /><small>Waymark hides exact coordinates from people who have not been accepted.</small></label>
        </div>
        <div className="form-grid">
          <label><span>Activity</span><select value={form.activityType} onChange={(event) => update("activityType", event.target.value)}><ActivityOptions /></select></label>
          <label><span>Experience</span><select value={form.experienceLevel} onChange={(event) => update("experienceLevel", event.target.value)}><option>Beginner friendly</option><option>All levels</option><option>Intermediate</option><option>Experienced</option></select></label>
          <label><span>Pace</span><select value={form.pace} onChange={(event) => update("pace", event.target.value)}><option>Relaxed</option><option>Flexible</option><option>Steady</option><option>Fast</option></select></label>
          <label><span>Group capacity</span><input type="number" min={2} max={50} value={form.capacity} onChange={(event) => update("capacity", Number(event.target.value))} /></label>
        </div>
        <label><span>Equipment <em>optional</em></span><input maxLength={240} value={form.equipment} onChange={(event) => update("equipment", event.target.value)} placeholder="Water, head torch, waterproof layer…" /></label>
        <label><span>Safety note <em>optional</em></span><textarea maxLength={300} value={form.safetyNotes} onChange={(event) => update("safetyNotes", event.target.value)} placeholder="Conditions, turnaround time, emergency considerations…" /></label>
        <footer className="modal-footer"><span><LockKeyhole size={16} /> Hosts approve people before exact meeting details are revealed.</span><button type="submit">Create plan</button></footer>
      </form>
    </Modal>
  );
}

function ClubModal({ close, submit }: { close: () => void; submit: (payload: object) => void }) {
  const [form, setForm] = useState({ name: "", description: "", activityType: "All outdoor activities", homeBase: "", visibility: "public" });
  return (
    <Modal title="Start a club" eyebrow="BUILD YOUR OUTDOOR CIRCLE" close={close}>
      <form onSubmit={(event) => { event.preventDefault(); submit(form); }}>
        <div className="form-grid single">
          <label><span>Club name</span><input required minLength={3} maxLength={60} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Melbourne Sunday Wanderers" /></label>
          <label><span>What is it for?</span><textarea maxLength={240} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="A welcoming weekly crew for relaxed local adventures." /></label>
          <label><span>Main activity</span><select value={form.activityType} onChange={(event) => setForm({ ...form, activityType: event.target.value })}><option>All outdoor activities</option><ActivityOptions /></select></label>
          <label><span>Home base</span><input maxLength={100} value={form.homeBase} onChange={(event) => setForm({ ...form, homeBase: event.target.value })} placeholder="Melbourne, Victoria" /></label>
        </div>
        <footer className="modal-footer"><span>Keep your club inclusive, clear and encouragement-first.</span><button type="submit">Create club</button></footer>
      </form>
    </Modal>
  );
}

function SafetyModal({
  safety,
  close,
  submit,
}: {
  safety: SafetyProfile;
  close: () => void;
  submit: (payload: SafetyProfile) => void;
}) {
  const [form, setForm] = useState(safety);
  return (
    <Modal title="Your safety circle" eyebrow="PRIVATE CHECK-IN SETUP" close={close}>
      <form onSubmit={(event) => { event.preventDefault(); submit(form); }}>
        <div className="safety-explainer"><ShieldCheck size={24} /><p>This gives you a consistent safety contact and check-in rhythm inside Waymark. Automated SMS alerts are not enabled yet, so still tell your contact directly before leaving.</p></div>
        <div className="form-grid single">
          <label><span>Contact name</span><input maxLength={80} value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} placeholder="Who should know your plans?" /></label>
          <label><span>Phone or email</span><input maxLength={120} value={form.contactMethod} onChange={(event) => setForm({ ...form, contactMethod: event.target.value })} placeholder="Stored privately with your account" /></label>
          <label><span>Default check-in window</span><select value={form.defaultCheckInMinutes} onChange={(event) => setForm({ ...form, defaultCheckInMinutes: Number(event.target.value) })}><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={240}>4 hours</option><option value={480}>8 hours</option><option value={720}>12 hours</option></select></label>
        </div>
        <footer className="modal-footer"><span><LockKeyhole size={16} /> This information is not shown on your public profile.</span><button type="submit">Save safety circle</button></footer>
      </form>
    </Modal>
  );
}

function Modal({ title, eyebrow, close, children }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="composer-modal action-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button onClick={close} aria-label={`Close ${title}`}><X size={22} /></button></header>
        {children}
      </section>
    </div>
  );
}

function HubLoading() {
  return <div className="hub-loading" aria-label="Loading your adventure hub">{[0, 1, 2].map((item) => <span key={item} />)}</div>;
}

function HubEmpty({ icon: Icon, title, copy, action, onAction }: { icon: typeof Compass; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className="hub-empty"><span><Icon size={29} /></span><h3>{title}</h3><p>{copy}</p>{action && onAction && <button onClick={onAction}>{action}</button>}</div>;
}

function ActivityOptions() {
  return <><option>Hiking</option><option>Running</option><option>Rock climbing</option><option>Snowboarding</option><option>Cycling</option><option>Kayaking</option><option>Surfing</option><option>Walking</option><option>Other outdoor activity</option></>;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
}

function formatPlanDate(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function relativeCloseTime(value: string, now: number) {
  const remaining = Math.max(0, new Date(value).getTime() - now);
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours > 24) return `in ${Math.ceil(hours / 24)} days`;
  if (hours > 1) return `in ${hours} hours`;
  return "within the next hour";
}

function toLocalInput(value: Date) {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function formatChallengeProgress(challenge: Challenge) {
  if (challenge.metric === "minutes") return `${formatDuration(challenge.progress)} of ${formatDuration(challenge.target)}`;
  return `${Math.min(challenge.progress, challenge.target)} of ${challenge.target}`;
}
