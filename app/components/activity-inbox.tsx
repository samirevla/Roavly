"use client";

import { useEffect } from "react";
import { Bell, CalendarDays, Heart, MessageCircle, UserCheck, UserPlus, Users, X } from "lucide-react";

export type InboxItem = {
  id: string;
  type: string;
  postId: string | null;
  planId: string | null;
  body: string;
  read: boolean;
  createdAt: string;
  actorName: string;
  actorUsername: string;
  actorAvatarUrl: string | null;
  postLabel: string | null;
  planTitle: string | null;
};

export type InboxFriendRequest = {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

export function inboxLine(item: InboxItem) {
  const plan = item.planTitle ? `“${item.planTitle}”` : "your journey";
  switch (item.type) {
    case "comment":
      return item.body ? `encouraged your post: “${item.body}”` : "encouraged your post";
    case "motivate":
      return "is motivated by your post";
    case "plan_request":
      return `asked to join ${plan}`;
    case "plan_join":
      return `joined ${plan}`;
    case "plan_accepted":
      return `accepted you on ${plan}`;
    case "plan_update":
      if (item.body.startsWith("cancelled")) return `cancelled ${plan}`;
      return item.body ? `updated ${plan}: ${item.body}` : `updated ${plan}`;
    case "journey_reminder":
      return item.body || `reminder for ${plan}`;
    default:
      return "has new activity for you";
  }
}

function relativeTime(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function TypeIcon({ type }: { type: string }) {
  if (type === "comment") return <MessageCircle size={13} />;
  if (type === "motivate") return <Heart size={13} />;
  if (type === "plan_request") return <UserPlus size={13} />;
  if (type === "plan_join" || type === "plan_accepted") return <Users size={13} />;
  return <CalendarDays size={13} />;
}

function InboxAvatar({ name, url }: { name: string; url: string | null | undefined }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "W";
  return (
    <span className={`avatar inbox-avatar${url ? " has-image" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" /> : initials}
    </span>
  );
}

export function ActivityInbox({
  items,
  loading,
  friendRequests,
  onClose,
  onOpenItem,
  onAcceptFriend,
  onDeclineFriend,
  onOpenFriends,
}: {
  items: InboxItem[];
  loading: boolean;
  friendRequests: InboxFriendRequest[];
  onClose: () => void;
  onOpenItem: (item: InboxItem) => void;
  onAcceptFriend: (username: string) => void;
  onDeclineFriend: (username: string) => void;
  onOpenFriends: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const empty = !loading && !items.length && !friendRequests.length;

  return (
    <div className="inbox-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="activity-inbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-inbox-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="activity-inbox-head">
          <h2 id="activity-inbox-title">Activity</h2>
          <button type="button" onClick={onClose} aria-label="Close activity"><X size={18} /></button>
        </header>
        <div className="activity-inbox-body">
          {friendRequests.length > 0 && (
            <div className="inbox-section">
              <div className="inbox-section-title">
                <span>Friend requests</span>
                <button type="button" onClick={onOpenFriends}>See all</button>
              </div>
              {friendRequests.map((person) => (
                <div className="inbox-row inbox-friend-row unread" key={person.username}>
                  <InboxAvatar name={person.displayName} url={person.avatarUrl} />
                  <div className="inbox-copy">
                    <span className="inbox-line"><strong>{person.displayName}</strong> wants to be friends</span>
                    <small>@{person.username}</small>
                  </div>
                  <div className="inbox-friend-actions">
                    <button type="button" onClick={() => onAcceptFriend(person.username)} aria-label={`Accept ${person.displayName}`}><UserCheck size={15} /></button>
                    <button type="button" className="muted" onClick={() => onDeclineFriend(person.username)} aria-label={`Decline ${person.displayName}`}><X size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {items.length > 0 && (
            <div className="inbox-section">
              {friendRequests.length > 0 && <div className="inbox-section-title"><span>Recent</span></div>}
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`inbox-row${item.read ? "" : " unread"}`}
                  onClick={() => onOpenItem(item)}
                  data-type={item.type}
                >
                  <span className="inbox-avatar-wrap">
                    <InboxAvatar name={item.actorName} url={item.actorAvatarUrl} />
                    <i className="inbox-type-icon" aria-hidden><TypeIcon type={item.type} /></i>
                  </span>
                  <span className="inbox-copy">
                    <span className="inbox-line">
                      {item.type === "journey_reminder" ? (
                        item.body || inboxLine(item)
                      ) : (
                        <><strong>{item.actorName}</strong> {inboxLine(item)}</>
                      )}
                    </span>
                    <small>{[item.type === "journey_reminder" ? null : item.postLabel, relativeTime(item.createdAt)].filter(Boolean).join(" · ")}</small>
                  </span>
                  {!item.read && <i className="inbox-unread-dot" aria-label="Unread" />}
                </button>
              ))}
            </div>
          )}
          {loading && !items.length && <p className="inbox-empty">Loading activity…</p>}
          {empty && (
            <div className="inbox-empty">
              <Bell size={26} />
              <strong>No activity yet</strong>
              <p>Comments, motivations, journey joins and plan changes will show up here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
