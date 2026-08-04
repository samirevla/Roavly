import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { roavlyApi } from "../api";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";
import { colors } from "../theme";
import type { ChatMessage, Conversation, Person } from "../types";

const activities = ["Hiking", "Running", "Rock climbing", "Snowboarding", "Cycling", "Walking"];

export function MessagesScreen({
  token,
  people,
  startUsername,
  onStartConsumed,
  onUnreadChange,
  notify,
}: {
  token: string;
  people: Person[];
  startUsername: string | null;
  onStartConsumed: () => void;
  onUnreadChange: (count: number) => void;
  notify: (message: string) => void;
}) {
  const friends = useMemo(
    () => people.filter((person) => person.relationship === "friends"),
    [people],
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const endRef = useRef<View>(null);

  const loadConversations = useCallback(async (quiet = false) => {
    try {
      const result = await roavlyApi.conversations(token);
      setConversations(result.conversations);
      onUnreadChange(result.unreadTotal);
      setActive((current) =>
        current
          ? result.conversations.find((item) => item.id === current.id) ?? current
          : current,
      );
    } catch (error) {
      if (!quiet) notify(error instanceof Error ? error.message : "Messages could not load.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [notify, onUnreadChange, token]);

  const loadMessages = useCallback(async (conversationId: string, quiet = false) => {
    try {
      const result = await roavlyApi.messages(token, conversationId);
      setMessages(result.messages);
      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId ? { ...item, unreadCount: 0 } : item,
        ),
      );
    } catch (error) {
      if (!quiet) notify(error instanceof Error ? error.message : "Conversation could not load.");
    } finally {
      if (!quiet) setLoadingMessages(false);
    }
  }, [notify, token]);

  useEffect(() => {
    loadConversations();
    const timer = setInterval(() => loadConversations(true), 12000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!active) return;
    setLoadingMessages(true);
    loadMessages(active.id);
    const timer = setInterval(() => loadMessages(active.id, true), 5000);
    return () => clearInterval(timer);
  }, [active?.id, loadMessages]);

  useEffect(() => {
    if (!startUsername) return;
    let cancelled = false;
    async function start() {
      try {
        const result = await roavlyApi.createConversation(token, {
          type: "direct",
          memberUsernames: [startUsername!],
        });
        const next = await roavlyApi.conversations(token);
        if (cancelled) return;
        setConversations(next.conversations);
        setActive(next.conversations.find((item) => item.id === result.conversationId) ?? null);
      } catch (error) {
        if (!cancelled) notify(error instanceof Error ? error.message : "Chat could not start.");
      } finally {
        if (!cancelled) onStartConsumed();
      }
    }
    start();
    return () => {
      cancelled = true;
    };
  }, [startUsername, token, notify, onStartConsumed]);

  useEffect(() => {
    const timer = setTimeout(
      () => endRef.current?.measure(() => undefined),
      50,
    );
    return () => clearTimeout(timer);
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!active || !body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const result = await roavlyApi.sendMessage(token, active.id, body);
      setMessages((current) => [...current, result.message]);
      await loadConversations(true);
    } catch (error) {
      setDraft(body);
      notify(error instanceof Error ? error.message : "Message could not send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.screen}>
      <AppHeader
        eyebrow="TOGETHER"
        title="Messages"
        action={{
          icon: "add",
          label: "Create Journey Together",
          onPress: () => setCreateOpen(true),
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.forest} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={conversations.length ? styles.list : styles.emptyList}
          renderItem={({ item }) => (
            <Pressable onPress={() => setActive(item)} style={styles.conversation}>
              <View
                style={[
                  styles.conversationIcon,
                  item.purpose === "journey" && styles.journeyIcon,
                ]}
              >
                <Ionicons
                  name={item.purpose === "journey" ? "trail-sign" : item.type === "group" ? "people" : "person"}
                  size={21}
                  color={colors.white}
                />
              </View>
              <View style={styles.conversationCopy}>
                <View style={styles.conversationTitleRow}>
                  <Text style={styles.conversationName} numberOfLines={1}>{item.name}</Text>
                  {item.purpose === "journey" ? (
                    <Text style={styles.journeyBadge}>JOURNEY</Text>
                  ) : null}
                </View>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {item.lastMessage?.body ||
                    (item.purpose === "journey"
                      ? `${item.activityType} · ${item.location}`
                      : "Start the conversation")}
                </Text>
              </View>
              {item.unreadCount ? (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{Math.min(item.unreadCount, 99)}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="Plan something together"
              message="Message an accepted friend or create a Journey Together group for your next adventure."
              action={{ label: "Create Journey Together", onPress: () => setCreateOpen(true) }}
            />
          }
        />
      )}

      <Modal visible={Boolean(active)} animationType="slide" onRequestClose={() => setActive(null)}>
        <SafeAreaView style={styles.chatSafe}>
          {active ? (
            <>
              <View style={styles.chatHeader}>
                <Pressable onPress={() => setActive(null)} style={styles.headerButton}>
                  <Ionicons name="chevron-back" size={27} color={colors.ink} />
                </Pressable>
                <View style={styles.chatHeaderCopy}>
                  <Text style={styles.chatName} numberOfLines={1}>{active.name}</Text>
                  <Text style={styles.chatMembers}>
                    {active.members.map((member) => member.displayName).join(", ")}
                  </Text>
                </View>
                {active.purpose === "journey" ? (
                  <Pressable onPress={() => setEditOpen(true)} style={styles.headerButton}>
                    <Ionicons name="create-outline" size={22} color={colors.forest} />
                  </Pressable>
                ) : (
                  <View style={styles.headerButton} />
                )}
              </View>

              {active.purpose === "journey" ? (
                <View style={styles.plan}>
                  <View style={styles.planTitleRow}>
                    <Ionicons name="trail-sign" size={18} color={colors.forest} />
                    <Text style={styles.planTitle}>Journey Together plan</Text>
                  </View>
                  <View style={styles.planFacts}>
                    <PlanFact icon="fitness-outline" text={active.activityType} />
                    <PlanFact
                      icon="calendar-outline"
                      text={active.startsAt ? new Date(active.startsAt).toLocaleString() : "Date to confirm"}
                    />
                    <PlanFact icon="location-outline" text={active.location} />
                  </View>
                  {active.planNotes ? (
                    <Text style={styles.planNotes}>{active.planNotes}</Text>
                  ) : null}
                </View>
              ) : null}

              <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={8}
              >
                {loadingMessages ? (
                  <View style={styles.center}>
                    <ActivityIndicator color={colors.forest} />
                  </View>
                ) : (
                  <FlatList
                    data={messages}
                    keyExtractor={(message) => message.id}
                    contentContainerStyle={styles.messageList}
                    renderItem={({ item }) => (
                      <View
                        style={[
                          styles.messageRow,
                          item.isMine && styles.messageRowMine,
                        ]}
                      >
                        {!item.isMine ? (
                          <Text style={styles.messageAuthor}>{item.authorName}</Text>
                        ) : null}
                        <View style={[styles.bubble, item.isMine && styles.bubbleMine]}>
                          <Text style={[styles.messageText, item.isMine && styles.messageTextMine]}>
                            {item.body}
                          </Text>
                        </View>
                        <Text style={styles.messageTime}>
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    )}
                    ListFooterComponent={<View ref={endRef} />}
                  />
                )}
                <View style={styles.composer}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Write a message..."
                    placeholderTextColor={colors.muted}
                    multiline
                    maxLength={1000}
                    style={styles.messageInput}
                  />
                  <Pressable
                    disabled={!draft.trim() || sending}
                    onPress={send}
                    style={[styles.send, (!draft.trim() || sending) && styles.disabled]}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Ionicons name="send" size={18} color={colors.white} />
                    )}
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            </>
          ) : null}
        </SafeAreaView>
      </Modal>

      <JourneyModal
        visible={createOpen}
        token={token}
        friends={friends}
        onClose={() => setCreateOpen(false)}
        onCreated={async (conversationId) => {
          setCreateOpen(false);
          const next = await roavlyApi.conversations(token);
          setConversations(next.conversations);
          setActive(next.conversations.find((item) => item.id === conversationId) ?? null);
          notify("Journey Together chat created.");
        }}
        notify={notify}
      />

      {active ? (
        <JourneyEditModal
          visible={editOpen}
          token={token}
          conversation={active}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setActive(updated);
            setConversations((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
            setEditOpen(false);
            notify("Journey plan updated for everyone.");
          }}
          notify={notify}
        />
      ) : null}
    </View>
  );
}

function JourneyModal({
  visible,
  token,
  friends,
  onClose,
  onCreated,
  notify,
}: {
  visible: boolean;
  token: string;
  friends: Person[];
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("Hiking");
  const [date, setDate] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  function toggle(username: string) {
    setMembers((current) =>
      current.includes(username)
        ? current.filter((item) => item !== username)
        : [...current, username],
    );
  }

  async function create() {
    if (name.trim().length < 2 || !location.trim() || !members.length) {
      notify("Add a journey name, meeting area and at least one friend.");
      return;
    }
    setCreating(true);
    try {
      const result = await roavlyApi.createConversation(token, {
        type: "group",
        purpose: "journey",
        name: name.trim(),
        memberUsernames: members,
        activityType: activity,
        startsAt: date.toISOString(),
        location: location.trim(),
        planNotes: notes.trim(),
      });
      onCreated(result.conversationId);
      setName("");
      setLocation("");
      setNotes("");
      setMembers([]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Journey Together could not be created.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <ModalHeader title="Journey Together" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalIntro}>
            Create a private planning chat, invite friends and keep the adventure details together.
          </Text>
          <FormLabel>Name</FormLabel>
          <TextInput value={name} onChangeText={setName} placeholder="Weekend summit crew" style={styles.input} />
          <FormLabel>Activity</FormLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.activityRow}>
              {activities.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setActivity(item)}
                  style={[styles.activity, item === activity && styles.activitySelected]}
                >
                  <Text style={[styles.activityText, item === activity && styles.activityTextSelected]}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <FormLabel>Date and time</FormLabel>
          <DateTimePicker
            value={date}
            mode="datetime"
            minimumDate={new Date()}
            onChange={(_, selected) => selected && setDate(selected)}
            accentColor={colors.forest}
          />
          <FormLabel>Meeting area</FormLabel>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Where will everyone meet?"
            style={styles.input}
          />
          <FormLabel>Starting notes</FormLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Gear, transport, food or route ideas..."
            multiline
            maxLength={500}
            style={[styles.input, styles.notesInput]}
          />
          <FormLabel>Add friends</FormLabel>
          <View style={styles.memberList}>
            {friends.map((friend) => {
              const selected = members.includes(friend.username);
              return (
                <Pressable
                  key={friend.username}
                  onPress={() => toggle(friend.username)}
                  style={[styles.member, selected && styles.memberSelected]}
                >
                  <View>
                    <Text style={styles.memberName}>{friend.displayName}</Text>
                    <Text style={styles.memberUsername}>@{friend.username}</Text>
                  </View>
                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={23}
                    color={selected ? colors.green : colors.muted}
                  />
                </Pressable>
              );
            })}
            {!friends.length ? (
              <Text style={styles.noFriends}>Add and accept friends before creating a group.</Text>
            ) : null}
          </View>
          <Pressable
            disabled={creating}
            onPress={create}
            style={[styles.primary, creating && styles.disabled]}
          >
            {creating ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="people" size={19} color={colors.white} />
                <Text style={styles.primaryText}>Create planning chat</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function JourneyEditModal({
  visible,
  token,
  conversation,
  onClose,
  onSaved,
  notify,
}: {
  visible: boolean;
  token: string;
  conversation: Conversation;
  onClose: () => void;
  onSaved: (conversation: Conversation) => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState(conversation.name);
  const [activity, setActivity] = useState(conversation.activityType);
  const [date, setDate] = useState(
    conversation.startsAt ? new Date(conversation.startsAt) : new Date(Date.now() + 86400000),
  );
  const [location, setLocation] = useState(conversation.location);
  const [notes, setNotes] = useState(conversation.planNotes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(conversation.name);
    setActivity(conversation.activityType);
    setDate(conversation.startsAt ? new Date(conversation.startsAt) : new Date(Date.now() + 86400000));
    setLocation(conversation.location);
    setNotes(conversation.planNotes);
  }, [conversation, visible]);

  async function save() {
    setSaving(true);
    try {
      await roavlyApi.updateJourney(token, conversation.id, {
        name: name.trim(),
        activityType: activity,
        startsAt: date.toISOString(),
        location: location.trim(),
        planNotes: notes.trim(),
      });
      onSaved({
        ...conversation,
        name: name.trim(),
        activityType: activity,
        startsAt: date.toISOString(),
        location: location.trim(),
        planNotes: notes.trim(),
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Journey plan could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <ModalHeader title="Edit journey plan" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <FormLabel>Name</FormLabel>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <FormLabel>Activity</FormLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.activityRow}>
              {activities.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setActivity(item)}
                  style={[styles.activity, item === activity && styles.activitySelected]}
                >
                  <Text style={[styles.activityText, item === activity && styles.activityTextSelected]}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <FormLabel>Date and time</FormLabel>
          <DateTimePicker
            value={date}
            mode="datetime"
            minimumDate={new Date()}
            onChange={(_, selected) => selected && setDate(selected)}
            accentColor={colors.forest}
          />
          <FormLabel>Meeting area</FormLabel>
          <TextInput value={location} onChangeText={setLocation} style={styles.input} />
          <FormLabel>Notes</FormLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={500}
            style={[styles.input, styles.notesInput]}
          />
          <Pressable disabled={saving} onPress={save} style={[styles.primary, saving && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Save for everyone</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.modalHeader}>
      <Pressable onPress={onClose} style={styles.headerButton}>
        <Ionicons name="close" size={25} color={colors.ink} />
      </Pressable>
      <Text style={styles.modalTitle}>{title}</Text>
      <View style={styles.headerButton} />
    </View>
  );
}

function FormLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function PlanFact({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.planFact}>
      <Ionicons name={icon} size={15} color={colors.green} />
      <Text style={styles.planFactText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 14, paddingBottom: 30, gap: 9 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  conversation: {
    minHeight: 76,
    padding: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  conversationIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  journeyIcon: { backgroundColor: colors.orange },
  conversationCopy: { flex: 1 },
  conversationTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  conversationName: { maxWidth: "72%", color: colors.ink, fontSize: 14, fontWeight: "800" },
  journeyBadge: {
    color: "#A64E27",
    backgroundColor: "#FFF0E9",
    fontSize: 8,
    fontWeight: "900",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  lastMessage: { color: colors.muted, fontSize: 11, marginTop: 5 },
  unread: {
    minWidth: 23,
    height: 23,
    paddingHorizontal: 5,
    borderRadius: 12,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: colors.white, fontSize: 9, fontWeight: "900" },
  chatSafe: { flex: 1, backgroundColor: colors.white },
  chatHeader: {
    minHeight: 66,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  chatHeaderCopy: { flex: 1, alignItems: "center" },
  chatName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  chatMembers: { maxWidth: 240, color: colors.muted, fontSize: 9, marginTop: 3 },
  plan: {
    margin: 12,
    padding: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#CDEBDB",
    backgroundColor: colors.mintWash,
  },
  planTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  planTitle: { color: colors.forest, fontSize: 13, fontWeight: "900" },
  planFacts: { gap: 7, marginTop: 10 },
  planFact: { flexDirection: "row", alignItems: "center", gap: 7 },
  planFactText: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "700" },
  planNotes: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#CDEBDB",
  },
  messageList: { padding: 14, paddingBottom: 18 },
  messageRow: { alignSelf: "flex-start", maxWidth: "80%", marginBottom: 11 },
  messageRowMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  messageAuthor: { color: colors.green, fontSize: 9, fontWeight: "800", marginBottom: 3, marginLeft: 5 },
  bubble: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 17, backgroundColor: colors.canvas },
  bubbleMine: { backgroundColor: colors.forest },
  messageText: { color: colors.ink, fontSize: 14, lineHeight: 19 },
  messageTextMine: { color: colors.white },
  messageTime: { color: colors.muted, fontSize: 8, marginTop: 3, marginHorizontal: 5 },
  composer: {
    minHeight: 66,
    padding: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  messageInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 23,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 14,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  modalSafe: { flex: 1, backgroundColor: colors.canvas },
  modalHeader: {
    minHeight: 66,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  modalContent: { padding: 16, paddingBottom: 45 },
  modalIntro: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.mintWash,
  },
  label: { color: colors.ink, fontSize: 12, fontWeight: "800", marginTop: 17, marginBottom: 7 },
  input: {
    minHeight: 49,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 14,
  },
  notesInput: { minHeight: 88, paddingTop: 12, textAlignVertical: "top" },
  activityRow: { flexDirection: "row", gap: 7, paddingRight: 20 },
  activity: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  activitySelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  activityText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  activityTextSelected: { color: colors.white },
  memberList: { gap: 7 },
  member: {
    minHeight: 60,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memberSelected: { borderColor: colors.green, backgroundColor: colors.mintWash },
  memberName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  memberUsername: { color: colors.muted, fontSize: 10, marginTop: 2 },
  noFriends: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  primary: {
    minHeight: 52,
    marginTop: 24,
    borderRadius: 15,
    backgroundColor: colors.forest,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { color: colors.white, fontSize: 14, fontWeight: "900" },
});
