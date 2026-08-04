import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";
import { PostCard } from "../components/PostCard";
import { colors } from "../theme";
import type { Person, Post } from "../types";

export function FeedScreen({
  token,
  posts,
  people,
  refreshing,
  onRefresh,
  onCreate,
  onPostChange,
  onPostRemove,
  notify,
}: {
  token: string;
  posts: Post[];
  people: Person[];
  refreshing: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onPostChange: (post: Post) => void;
  onPostRemove: (postId: string) => void;
  notify: (message: string) => void;
}) {
  const [mode, setMode] = useState<"Community" | "Friends">("Community");
  const friendUsernames = useMemo(
    () =>
      new Set(
        people
          .filter((person) => person.relationship === "friends")
          .map((person) => person.username),
      ),
    [people],
  );
  const visiblePosts =
    mode === "Community"
      ? posts
      : posts.filter((post) => post.isOwner || friendUsernames.has(post.authorUsername));

  return (
    <View style={styles.screen}>
      <AppHeader
        eyebrow="FRESH SUMMIT"
        title="Your journeys"
        action={{ icon: "add", label: "Create journey", onPress: onCreate }}
      />
      <View style={styles.tabs}>
        {(["Community", "Friends"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setMode(tab)}
            style={[styles.tab, mode === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, mode === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={visiblePosts}
        keyExtractor={(post) => post.id}
        contentContainerStyle={visiblePosts.length ? styles.list : styles.emptyList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.forest}
          />
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            token={token}
            onChange={onPostChange}
            onRemove={onPostRemove}
            notify={notify}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={mode === "Friends" ? "people-outline" : "camera-outline"}
            title={mode === "Friends" ? "Your friends feed is ready" : "Share the first journey"}
            message={
              mode === "Friends"
                ? "Add friends to see their outdoor journeys here."
                : "Roavly is intentionally empty until real people share real adventures."
            }
            action={{
              label: mode === "Friends" ? "View community" : "Share a journey",
              onPress: mode === "Friends" ? () => setMode("Community") : onCreate,
            }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  tabs: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.forest },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: colors.forest, fontWeight: "900" },
  list: { paddingTop: 16, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
});
