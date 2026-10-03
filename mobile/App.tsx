import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  ApiError,
  clearStoredToken,
  readStoredToken,
  roavlyApi,
  signInWithRoavly,
} from "./src/api";
import { colors } from "./src/theme";
import type { Person, Post, Profile, Viewer } from "./src/types";
import { AuthScreen } from "./src/screens/AuthScreen";
import { ComposerModal } from "./src/screens/ComposerModal";
import { FeedScreen } from "./src/screens/FeedScreen";
import { FriendsScreen } from "./src/screens/FriendsScreen";
import { MapScreen } from "./src/screens/MapScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";

type Tab = "Feed" | "Map" | "Friends" | "Messages" | "Profile";

const tabs: Array<{
  id: Tab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: "Feed", label: "Home", icon: "home-outline", activeIcon: "home" },
  { id: "Map", label: "Explore", icon: "map-outline", activeIcon: "map" },
  { id: "Friends", label: "Friends", icon: "people-outline", activeIcon: "people" },
  { id: "Messages", label: "Messages", icon: "chatbubbles-outline", activeIcon: "chatbubbles" },
  { id: "Profile", label: "Profile", icon: "person-outline", activeIcon: "person" },
];

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [tab, setTab] = useState<Tab>("Feed");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [messageUsername, setMessageUsername] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 3200);
  }, []);

  const loadAccount = useCallback(async (sessionToken: string, quiet = false) => {
    try {
      const [me, postResult, peopleResult] = await Promise.all([
        roavlyApi.me(sessionToken),
        roavlyApi.posts(sessionToken),
        roavlyApi.people(sessionToken),
      ]);
      if (!me.user || !me.profile) throw new Error("Your Waymark profile could not load.");
      setViewer(me.user);
      setProfile(me.profile);
      setPosts(postResult.posts);
      setPeople(peopleResult.people);
      setToken(sessionToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearStoredToken();
        setToken(null);
        setViewer(null);
        setProfile(null);
      } else if (!quiet) {
        notify(error instanceof Error ? error.message : "Waymark could not load.");
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    let active = true;
    async function restore() {
      const stored = await readStoredToken();
      if (!active) return;
      if (stored) await loadAccount(stored);
      else setLoading(false);
    }
    restore();
    return () => {
      active = false;
    };
  }, [loadAccount]);

  async function signIn() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const result = await signInWithRoavly();
      await loadAccount(result.token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign-in could not complete.";
      if (message !== "Sign-in was cancelled.") notify(message);
    } finally {
      setSigningIn(false);
    }
  }

  async function refresh() {
    if (!token || refreshing) return;
    setRefreshing(true);
    await loadAccount(token, true);
    setRefreshing(false);
  }

  function logout() {
    if (!token) return;
    Alert.alert("Sign out of Waymark?", "You can sign back in at any time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            await roavlyApi.logout(token);
          } catch {
            // Local sign-out still protects the account on this device.
          }
          await clearStoredToken();
          setToken(null);
          setViewer(null);
          setProfile(null);
          setPosts([]);
          setPeople([]);
          setTab("Feed");
        },
      },
    ]);
  }

  const activeScreen = useMemo(() => {
    if (!token || !profile) return null;
    if (tab === "Feed") {
      return (
        <FeedScreen
          token={token}
          posts={posts}
          people={people}
          refreshing={refreshing}
          onRefresh={refresh}
          onCreate={() => setComposerOpen(true)}
          onPostChange={(nextPost) =>
            setPosts((current) =>
              current.map((post) => (post.id === nextPost.id ? nextPost : post)),
            )
          }
          onPostRemove={(postId) =>
            setPosts((current) => current.filter((post) => post.id !== postId))
          }
          notify={notify}
        />
      );
    }
    if (tab === "Map") return <MapScreen token={token} posts={posts} />;
    if (tab === "Friends") {
      return (
        <FriendsScreen
          token={token}
          people={people}
          refreshing={refreshing}
          onRefresh={refresh}
          onPeopleChange={setPeople}
          onMessage={(username) => {
            setMessageUsername(username);
            setTab("Messages");
          }}
          notify={notify}
        />
      );
    }
    if (tab === "Messages") {
      return (
        <MessagesScreen
          token={token}
          people={people}
          startUsername={messageUsername}
          onStartConsumed={() => setMessageUsername(null)}
          onUnreadChange={setUnreadMessages}
          notify={notify}
        />
      );
    }
    return (
      <ProfileScreen
        token={token}
        profile={profile}
        posts={posts}
        onProfileChange={setProfile}
        onLogout={logout}
        notify={notify}
      />
    );
  }, [
    messageUsername,
    notify,
    people,
    posts,
    profile,
    refreshing,
    tab,
    token,
  ]);

  if (loading) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.loading}>
          <View style={styles.loadingMark}>
            <Ionicons name="trail-sign" size={30} color={colors.white} />
          </View>
          <ActivityIndicator color={colors.forest} />
          <Text style={styles.loadingText}>Loading Waymark…</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!token || !viewer || !profile) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthScreen signingIn={signingIn} onSignIn={signIn} />
        {toast ? <Toast message={toast} /> : null}
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.content}>{activeScreen}</View>
        <View style={styles.bottomBar}>
          {tabs.map((item) => {
            const active = item.id === tab;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={item.label}
                onPress={() => setTab(item.id)}
                style={styles.tab}
              >
                <View>
                  <Ionicons
                    name={active ? item.activeIcon : item.icon}
                    size={22}
                    color={active ? colors.forest : colors.muted}
                  />
                  {item.id === "Messages" && unreadMessages ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{Math.min(unreadMessages, 99)}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityLabel="Create a journey"
          onPress={() => setComposerOpen(true)}
          style={styles.createButton}
        >
          <Ionicons name="add" size={28} color={colors.white} />
        </Pressable>
      </SafeAreaView>
      <ComposerModal
        visible={composerOpen}
        token={token}
        onClose={() => setComposerOpen(false)}
        onPublished={(post) => setPosts((current) => [post, ...current])}
        notify={notify}
      />
      {toast ? <Toast message={toast} /> : null}
    </SafeAreaProvider>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <View pointerEvents="none" style={styles.toast}>
      <Ionicons name="checkmark-circle" size={18} color={colors.mint} />
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1 },
  loading: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
  },
  loadingMark: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  loadingText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  bottomBar: {
    height: 68,
    paddingHorizontal: 5,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabLabel: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  tabLabelActive: { color: colors.forest, fontWeight: "900" },
  badge: {
    position: "absolute",
    right: -11,
    top: -7,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.orange,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.white, fontSize: 7, fontWeight: "900" },
  createButton: {
    position: "absolute",
    right: 16,
    bottom: 80,
    width: 58,
    height: 58,
    borderRadius: 21,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.forest,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 13,
    elevation: 7,
  },
  toast: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 88,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.forest,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  toastText: { flexShrink: 1, color: colors.white, fontSize: 12, fontWeight: "800", textAlign: "center" },
});
