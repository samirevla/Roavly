"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  Edit3,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Mountain,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MessageFriend = {
  displayName: string;
  username: string;
};

type ConversationMember = MessageFriend & {
  isViewer: boolean;
};

type ConversationSummary = {
  id: string;
  type: "direct" | "group";
  purpose: "chat" | "journey";
  name: string;
  username: string;
  activityType: string;
  startsAt: string | null;
  location: string;
  planNotes: string;
  adventurePlanId: string | null;
  expiresAt: string | null;
  isCreator: boolean;
  members: ConversationMember[];
  updatedAt: string;
  unreadCount: number;
  lastMessage: {
    body: string;
    createdAt: string;
    isMine: boolean;
  } | null;
};

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorUsername: string;
  isMine: boolean;
};

export function MessagesView({
  friends,
  startUsername,
  startConversationId,
  onStarted,
  onConversationStarted,
  onUnreadChange,
  showToast,
}: {
  friends: MessageFriend[];
  startUsername: string | null;
  startConversationId: string | null;
  onStarted: () => void;
  onConversationStarted: () => void;
  onUnreadChange: (count: number) => void;
  showToast: (message: string) => void;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [newChatMode, setNewChatMode] = useState<"direct" | "journey" | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [journeyActivity, setJourneyActivity] = useState("Hiking");
  const [journeyStartsAt, setJourneyStartsAt] = useState(() => defaultJourneyDate());
  const [journeyLocation, setJourneyLocation] = useState("");
  const [journeyNotes, setJourneyNotes] = useState("");
  const [editingJourney, setEditingJourney] = useState(false);
  const [journeyDraft, setJourneyDraft] = useState({
    name: "",
    activityType: "Hiking",
    startsAt: "",
    location: "",
    planNotes: "",
  });
  const [creating, setCreating] = useState(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  const conversationsRef = useRef<ConversationSummary[]>([]);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const refreshConversations = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/conversations");
      const payload = (await response.json()) as {
        conversations?: ConversationSummary[];
        unreadTotal?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Messages could not load.");
      const nextConversations = payload.conversations ?? [];
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);
      onUnreadChange(payload.unreadTotal ?? 0);
    } catch (error) {
      if (!quiet) showToastRef.current(error instanceof Error ? error.message : "Messages could not load.");
    } finally {
      if (!quiet) setLoadingConversations(false);
    }
  }, [onUnreadChange]);

  const loadMessages = useCallback(async (conversationId: string, quiet = false) => {
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      );
      const payload = (await response.json()) as { messages?: ChatMessage[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Conversation could not load.");
      setMessages(payload.messages ?? []);
      const nextConversations = conversationsRef.current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      );
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);
      onUnreadChange(nextConversations.reduce((total, item) => total + item.unreadCount, 0));
    } catch (error) {
      if (!quiet) showToastRef.current(error instanceof Error ? error.message : "Conversation could not load.");
    } finally {
      if (!quiet) setLoadingMessages(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    const initial = window.setTimeout(() => refreshConversations(), 0);
    const interval = window.setInterval(() => refreshConversations(true), 12000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refreshConversations]);

  useEffect(() => {
    if (!activeId) return;
    const initial = window.setTimeout(() => loadMessages(activeId), 0);
    const interval = window.setInterval(() => loadMessages(activeId, true), 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [activeId, loadMessages]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  useEffect(() => {
    if (!startUsername) return;
    let cancelled = false;
    async function startDirectMessage() {
      try {
        const conversationId = await createConversation("direct", [startUsername!]);
        if (cancelled) return;
        await refreshConversations(true);
        openConversation(conversationId);
      } catch (error) {
        if (!cancelled) {
          showToast(error instanceof Error ? error.message : "Conversation could not start.");
        }
      } finally {
        if (!cancelled) onStarted();
      }
    }
    startDirectMessage();
    return () => {
      cancelled = true;
    };
    // This effect intentionally reacts only to a new friend-message request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startUsername]);

  useEffect(() => {
    if (!startConversationId) return;
    let cancelled = false;
    async function openRequestedConversation() {
      await refreshConversations(true);
      if (cancelled) return;
      const available = conversationsRef.current.some(
        (conversation) => conversation.id === startConversationId,
      );
      if (available) {
        openConversation(startConversationId!);
      } else {
        showToastRef.current("That journey chat is no longer available.");
      }
      onConversationStarted();
    }
    void openRequestedConversation();
    return () => {
      cancelled = true;
    };
    // This effect intentionally reacts only to a journey-chat deep link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startConversationId]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) =>
      [conversation.name, conversation.username, conversation.lastMessage?.body]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [conversations, search]);
  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;

  function openConversation(conversationId: string) {
    setMessages([]);
    setLoadingMessages(true);
    setEditingJourney(false);
    setActiveId(conversationId);
  }

  async function createConversation(
    type: "direct" | "group",
    memberUsernames: string[],
    name = "",
    journey?: {
      activityType: string;
      startsAt: string;
      location: string;
      planNotes: string;
    },
  ) {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        purpose: journey ? "journey" : "chat",
        memberUsernames,
        name,
        ...journey,
      }),
    });
    const payload = (await response.json()) as { conversationId?: string; error?: string };
    if (!response.ok || !payload.conversationId) {
      throw new Error(payload.error || "Conversation could not start.");
    }
    return payload.conversationId;
  }

  async function startDirect(username: string) {
    if (creating) return;
    setCreating(true);
    try {
      const conversationId = await createConversation("direct", [username]);
      await refreshConversations(true);
      openConversation(conversationId);
      setNewChatMode(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Conversation could not start.");
    } finally {
      setCreating(false);
    }
  }

  async function createJourneyTogether(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      creating ||
      groupName.trim().length < 2 ||
      !groupMembers.length ||
      !journeyLocation.trim() ||
      !journeyStartsAt
    ) return;
    setCreating(true);
    try {
      const conversationId = await createConversation("group", groupMembers, groupName, {
        activityType: journeyActivity,
        startsAt: new Date(journeyStartsAt).toISOString(),
        location: journeyLocation,
        planNotes: journeyNotes,
      });
      await refreshConversations(true);
      openConversation(conversationId);
      setGroupName("");
      setGroupMembers([]);
      setJourneyActivity("Hiking");
      setJourneyStartsAt(defaultJourneyDate());
      setJourneyLocation("");
      setJourneyNotes("");
      setNewChatMode(null);
      showToast("Journey Together chat created.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Group could not be created.");
    } finally {
      setCreating(false);
    }
  }

  function beginJourneyEdit() {
    if (!activeConversation || activeConversation.purpose !== "journey") return;
    setJourneyDraft({
      name: activeConversation.name,
      activityType: activeConversation.activityType,
      startsAt: activeConversation.startsAt
        ? toLocalInput(new Date(activeConversation.startsAt))
        : defaultJourneyDate(),
      location: activeConversation.location,
      planNotes: activeConversation.planNotes,
    });
    setEditingJourney(true);
  }

  async function saveJourneyPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation || activeConversation.purpose !== "journey") return;
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(activeConversation.id)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...journeyDraft,
            startsAt: new Date(journeyDraft.startsAt).toISOString(),
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Journey plan could not be updated.");
      setEditingJourney(false);
      await refreshConversations(true);
      showToast("Journey plan updated for everyone.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Journey plan could not be updated.");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!activeId || !body || sending) return;
    setSending(true);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(activeId)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const payload = (await response.json()) as { message?: ChatMessage; error?: string };
      if (!response.ok || !payload.message) {
        throw new Error(payload.error || "Message could not be sent.");
      }
      setMessages((current) => [...current, payload.message!]);
      setDraft("");
      await refreshConversations(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function leaveGroup() {
    if (!activeConversation || activeConversation.type !== "group") return;
    if (!window.confirm(`Leave ${activeConversation.name}?`)) return;
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(activeConversation.id)}`,
      { method: "DELETE" },
    );
    const payload = (await response.json()) as { left?: boolean; error?: string };
    if (!response.ok) {
      showToast(payload.error || "Could not leave the group.");
      return;
    }
    setActiveId(null);
    setMessages([]);
    await refreshConversations(true);
    showToast("You left the group.");
  }

  function toggleGroupMember(username: string) {
    setGroupMembers((current) =>
      current.includes(username)
        ? current.filter((item) => item !== username)
        : [...current, username],
    );
  }

  return (
    <>
      <section className={`messages-layout ${activeId ? "conversation-open" : ""}`}>
        <aside className="conversation-list" aria-label="Your conversations">
          <header>
            <div><strong>Messages</strong><span>Friends and Journey Together chats</span></div>
            <button onClick={() => setNewChatMode("direct")} aria-label="Start a conversation"><Plus size={19} /></button>
          </header>
          <label className="conversation-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" /></label>
          <div className="conversation-scroll">
            {loadingConversations ? (
              <div className="message-loading"><LoaderCircle className="spin" size={23} /><span>Loading messages…</span></div>
            ) : filteredConversations.length ? (
              filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`conversation-row ${conversation.id === activeId ? "active" : ""}`}
                  onClick={() => openConversation(conversation.id)}
                >
                  <ConversationAvatar conversation={conversation} />
                  <span className="conversation-copy">
                    <strong>{conversation.name}{conversation.purpose === "journey" && <i className="journey-label">Journey</i>}</strong>
                    <small>{conversation.lastMessage ? `${conversation.lastMessage.isMine ? "You: " : ""}${conversation.lastMessage.body}` : "Start the conversation"}</small>
                  </span>
                  <span className="conversation-meta">
                    <time>{shortTime(conversation.lastMessage?.createdAt ?? conversation.updatedAt)}</time>
                    {conversation.unreadCount > 0 && <i>{Math.min(99, conversation.unreadCount)}</i>}
                  </span>
                </button>
              ))
            ) : (
              <div className="message-list-empty"><MessageCircle size={28} /><strong>No conversations yet</strong><p>Message a friend or create a Journey Together chat for your next adventure.</p><button onClick={() => setNewChatMode("direct")}>Start chatting</button></div>
            )}
          </div>
        </aside>

        <section className={`chat-panel ${activeConversation?.purpose === "journey" ? "journey-active" : ""}`} aria-label="Conversation">
          {activeConversation ? (
            <>
              <header className="chat-header">
                <button className="chat-back" onClick={() => { setActiveId(null); setMessages([]); }} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
                <ConversationAvatar conversation={activeConversation} />
                <div><strong>{activeConversation.name}</strong><span>{activeConversation.purpose === "journey" ? `${activeConversation.members.length} members · Journey Together` : activeConversation.type === "group" ? `${activeConversation.members.length} members · private group` : `@${activeConversation.username} · friend`}</span></div>
                {activeConversation.type === "group" && <button className="leave-group" onClick={leaveGroup}>Leave</button>}
              </header>
              <div className="chat-safety"><ShieldCheck size={15} /><span>Keep it positive. Only members of this conversation can see these messages.</span></div>
              {activeConversation.purpose === "journey" && (
                <section className={`journey-chat-plan ${editingJourney ? "editing" : ""}`}>
                  {editingJourney ? (
                    <form onSubmit={saveJourneyPlan}>
                      <header><div><span className="eyebrow">SHARED ADVENTURE PLAN</span><strong>Update Journey Together</strong></div><button type="button" onClick={() => setEditingJourney(false)} aria-label="Cancel editing"><X size={18} /></button></header>
                      <div className="journey-plan-form">
                        <label><span>Journey name</span><input required minLength={2} maxLength={60} value={journeyDraft.name} onChange={(event) => setJourneyDraft({ ...journeyDraft, name: event.target.value })} /></label>
                        <label><span>Activity</span><select value={journeyDraft.activityType} onChange={(event) => setJourneyDraft({ ...journeyDraft, activityType: event.target.value })}><JourneyActivityOptions /></select></label>
                        <label><span>Date and time</span><input required type="datetime-local" value={journeyDraft.startsAt} onChange={(event) => setJourneyDraft({ ...journeyDraft, startsAt: event.target.value })} /></label>
                        <label><span>Meeting area</span><input required maxLength={160} value={journeyDraft.location} onChange={(event) => setJourneyDraft({ ...journeyDraft, location: event.target.value })} /></label>
                      </div>
                      <label className="journey-plan-notes"><span>Itinerary & packing notes</span><textarea maxLength={500} value={journeyDraft.planNotes} onChange={(event) => setJourneyDraft({ ...journeyDraft, planNotes: event.target.value })} placeholder="Route, meeting plan, what to bring, transport or food…" /></label>
                      <button className="save-journey-plan">Save for everyone</button>
                    </form>
                  ) : (
                    <>
                      <header>
                        <div>
                          <span className="eyebrow">JOURNEY TOGETHER</span>
                          <strong>{activeConversation.name}</strong>
                          {activeConversation.expiresAt && <small className="chat-closing-note">Closes {chatCloseTime(activeConversation.expiresAt)}</small>}
                        </div>
                        {!activeConversation.adventurePlanId && !activeConversation.expiresAt && <button onClick={beginJourneyEdit}><Edit3 size={15} /> Edit plan</button>}
                      </header>
                      <div className="journey-workspace-strip" aria-label="Journey workspace">
                        <span><Users size={14} /><strong>{activeConversation.members.length}</strong><small>Members</small></span>
                        <span><CalendarDays size={14} /><strong>{activeConversation.startsAt ? "Scheduled" : "Open"}</strong><small>Itinerary</small></span>
                        <span><MapPin size={14} /><strong>{activeConversation.location ? "Shared" : "Add one"}</strong><small>Meeting area</small></span>
                      </div>
                      <div className="journey-plan-summary">
                        <span><Mountain size={16} /><strong>{activeConversation.activityType}</strong><small>Activity</small></span>
                        <span><CalendarDays size={16} /><strong>{activeConversation.startsAt ? journeyDate(activeConversation.startsAt) : "Choose a date"}</strong><small>Date and time</small></span>
                        <span><MapPin size={16} /><strong>{activeConversation.location || "Choose an area"}</strong><small>Meeting area</small></span>
                      </div>
                      {activeConversation.planNotes && <p><strong>Shared itinerary & packing notes</strong>{activeConversation.planNotes}</p>}
                    </>
                  )}
                </section>
              )}
              <div className="message-thread" aria-live="polite">
                {loadingMessages ? (
                  <div className="message-loading"><LoaderCircle className="spin" size={23} /><span>Opening conversation…</span></div>
                ) : messages.length ? (
                  messages.map((message, index) => {
                    const showAuthor =
                      !message.isMine &&
                      (index === 0 || messages[index - 1].authorUsername !== message.authorUsername);
                    return (
                      <div className={`message-line ${message.isMine ? "mine" : ""}`} key={message.id}>
                        {!message.isMine && <span className="message-avatar">{initials(message.authorName)}</span>}
                        <div>
                          {showAuthor && <small>{message.authorName}</small>}
                          <p>{message.body}</p>
                          <time>{messageTime(message.createdAt)}</time>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="thread-empty"><MessageCircle size={31} /><strong>Start something positive</strong><p>Share a plan, organise an activity or motivate your friends to get outdoors.</p></div>
                )}
                <div ref={messageEnd} />
              </div>
              <form className="message-composer" onSubmit={sendMessage}>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="Write a message…" aria-label="Write a message" onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }} />
                <button disabled={!draft.trim() || sending} aria-label="Send message"><Send size={19} /></button>
              </form>
            </>
          ) : (
            <div className="chat-welcome"><span><MessageCircle size={34} /></span><h2>Your outdoor circle</h2><p>Message a friend or create a Journey Together space to organise your next adventure.</p><button onClick={() => setNewChatMode("direct")}><Plus size={17} /> New message</button></div>
          )}
        </section>
      </section>

      {newChatMode && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewChatMode(null)}>
          <section className="new-chat-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="eyebrow">PRIVATE CONVERSATION</span><h2 id="new-chat-title">{newChatMode === "direct" ? "New message" : "Journey Together"}</h2></div><button onClick={() => setNewChatMode(null)} aria-label="Close"><X size={21} /></button></header>
            <div className="new-chat-tabs">
              <button className={newChatMode === "direct" ? "active" : ""} onClick={() => setNewChatMode("direct")}><UserRound size={16} /> Friend</button>
              <button className={newChatMode === "journey" ? "active" : ""} onClick={() => setNewChatMode("journey")}><Mountain size={16} /> Journey Together</button>
            </div>
            {friends.length ? newChatMode === "direct" ? (
              <div className="new-chat-friends">
                {friends.map((friend) => <button key={friend.username} onClick={() => startDirect(friend.username)} disabled={creating}><span className="avatar">{initials(friend.displayName)}</span><span><strong>{friend.displayName}</strong><small>@{friend.username}</small></span><MessageCircle size={18} /></button>)}
              </div>
            ) : (
              <form onSubmit={createJourneyTogether}>
                <div className="journey-create-intro"><Mountain size={22} /><div><strong>Plan it together</strong><p>Name the adventure, add your friends and keep every decision in one private chat.</p></div></div>
                <label className="group-name"><span>Journey name</span><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} placeholder="Sunday at the Grampians" required /></label>
                <div className="journey-create-grid">
                  <label><span>Activity</span><select value={journeyActivity} onChange={(event) => setJourneyActivity(event.target.value)}><JourneyActivityOptions /></select></label>
                  <label><span>Date and time</span><input type="datetime-local" required value={journeyStartsAt} onChange={(event) => setJourneyStartsAt(event.target.value)} /></label>
                  <label className="wide"><span>Meeting area</span><input required maxLength={160} value={journeyLocation} onChange={(event) => setJourneyLocation(event.target.value)} placeholder="Broad meeting area—confirm exact details in chat" /></label>
                  <label className="wide"><span>Itinerary & packing notes <em>optional</em></span><textarea maxLength={500} value={journeyNotes} onChange={(event) => setJourneyNotes(event.target.value)} placeholder="Route, meeting plan, what to bring, transport or food…" /></label>
                </div>
                <span className="member-label">Choose friends · {groupMembers.length} selected</span>
                <div className="group-friend-list">
                  {friends.map((friend) => {
                    const selected = groupMembers.includes(friend.username);
                    return <label key={friend.username} className={selected ? "selected" : ""}><input type="checkbox" checked={selected} onChange={() => toggleGroupMember(friend.username)} /><span className="avatar">{initials(friend.displayName)}</span><span><strong>{friend.displayName}</strong><small>@{friend.username}</small></span><i>{selected && <Check size={14} />}</i></label>;
                  })}
                </div>
                <button className="create-group-button" disabled={creating || groupName.trim().length < 2 || !groupMembers.length || !journeyLocation.trim() || !journeyStartsAt}>{creating ? "Creating…" : "Create Journey Together"}</button>
              </form>
            ) : (
              <div className="no-message-friends"><Users size={30} /><strong>Add a friend first</strong><p>Direct messages and groups are only available between accepted friends.</p></div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function ConversationAvatar({ conversation }: { conversation: ConversationSummary }) {
  return <span className={`conversation-avatar ${conversation.type === "group" ? "group" : ""} ${conversation.purpose === "journey" ? "journey" : ""}`}>{conversation.purpose === "journey" ? <Mountain size={19} /> : conversation.type === "group" ? <Users size={19} /> : initials(conversation.name)}</span>;
}

function JourneyActivityOptions() {
  return <><option>Hiking</option><option>Running</option><option>Rock climbing</option><option>Snowboarding</option><option>Cycling</option><option>Kayaking</option><option>Surfing</option><option>Walking</option><option>Other outdoor activity</option></>;
}

function defaultJourneyDate() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setMinutes(0, 0, 0);
  return toLocalInput(next);
}

function toLocalInput(value: Date) {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function journeyDate(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "R";
}

function shortTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function messageTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function chatCloseTime(value: string) {
  const expiresAt = new Date(value);
  const remaining = expiresAt.getTime() - Date.now();
  const hours = Math.max(1, Math.ceil(remaining / (60 * 60 * 1000)));
  if (hours > 24) return `in ${Math.ceil(hours / 24)} days`;
  return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
}
