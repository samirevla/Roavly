import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { roavlyApi } from "../api";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";
import { colors } from "../theme";
import type { Person } from "../types";

export function FriendsScreen({
  token,
  people,
  refreshing,
  onRefresh,
  onPeopleChange,
  onMessage,
  notify,
}: {
  token: string;
  people: Person[];
  refreshing: boolean;
  onRefresh: () => void;
  onPeopleChange: (people: Person[]) => void;
  onMessage: (username: string) => void;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return people;
    return people.filter((person) =>
      [person.displayName, person.username, person.homeBase, person.favoriteActivities]
        .join(" ")
        .toLowerCase()
        .includes(value),
    );
  }, [people, query]);

  async function act(person: Person) {
    const action =
      person.relationship === "incoming"
        ? "accept"
        : person.relationship === "friends"
          ? "remove"
          : person.relationship === "outgoing"
            ? "decline"
            : "request";
    try {
      const result = await roavlyApi.friendAction(token, person.username, action);
      onPeopleChange(
        people.map((candidate) =>
          candidate.username === person.username
            ? { ...candidate, relationship: result.relationship }
            : candidate,
        ),
      );
      notify(
        result.relationship === "friends"
          ? `${person.displayName} is now your friend.`
          : action === "request"
            ? "Friend request sent."
            : "Friendship updated.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update this friendship.");
    }
  }

  return (
    <View style={styles.screen}>
      <AppHeader eyebrow="CONNECT" title="Friends" />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people, places or activities"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={styles.search}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(person) => person.username}
        contentContainerStyle={filtered.length ? styles.list : styles.emptyList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />
        }
        renderItem={({ item }) => (
          <View style={styles.person}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.displayName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("")}
              </Text>
            </View>
            <View style={styles.personCopy}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.username}>@{item.username}</Text>
              <Text style={styles.detail} numberOfLines={2}>
                {[item.homeBase, item.favoriteActivities].filter(Boolean).join(" · ") ||
                  "Ready for a new outdoor journey"}
              </Text>
            </View>
            <View style={styles.actions}>
              {item.relationship === "friends" ? (
                <Pressable
                  accessibilityLabel={`Message ${item.displayName}`}
                  onPress={() => onMessage(item.username)}
                  style={styles.iconButton}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.forest} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => act(item)}
                style={[
                  styles.friendButton,
                  item.relationship === "friends" && styles.friendButtonMuted,
                ]}
              >
                <Text
                  style={[
                    styles.friendButtonText,
                    item.relationship === "friends" && styles.friendButtonTextMuted,
                  ]}
                >
                  {item.relationship === "incoming"
                    ? "Accept"
                    : item.relationship === "outgoing"
                      ? "Requested"
                      : item.relationship === "friends"
                        ? "Friends"
                        : "Add"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="person-add-outline"
            title={query ? "No matching people" : "Add your first friend"}
            message={
              query
                ? "Try searching their display name, username or home area."
                : "When friends join Waymark, search their username here and send a request."
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  searchWrap: {
    height: 48,
    margin: 14,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  search: { flex: 1, color: colors.ink, fontSize: 14 },
  list: { paddingHorizontal: 14, paddingBottom: 30, gap: 10 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  person: {
    minHeight: 92,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  personCopy: { flex: 1, marginLeft: 11, marginRight: 8 },
  name: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  username: { color: colors.green, fontSize: 10, fontWeight: "700", marginTop: 2 },
  detail: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 5 },
  actions: { alignItems: "flex-end", gap: 7 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.mintWash,
    alignItems: "center",
    justifyContent: "center",
  },
  friendButton: {
    minWidth: 68,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.forest,
    alignItems: "center",
  },
  friendButtonMuted: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  friendButtonText: { color: colors.white, fontSize: 10, fontWeight: "800" },
  friendButtonTextMuted: { color: colors.muted },
});
