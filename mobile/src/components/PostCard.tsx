import { Ionicons } from "@expo/vector-icons";
import {
  ActionSheetIOS,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { mediaSource, roavlyApi } from "../api";
import { colors, shadow } from "../theme";
import type { Post } from "../types";
import { positiveEncouragements } from "../types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function PostCard({
  post,
  token,
  onChange,
  onRemove,
  notify,
}: {
  post: Post;
  token: string;
  onChange: (post: Post) => void;
  onRemove: (postId: string) => void;
  notify: (message: string) => void;
}) {
  async function motivate() {
    try {
      const result = await roavlyApi.motivate(token, post.id);
      onChange({
        ...post,
        viewerMotivated: result.motivated,
        motivationCount: result.motivationCount,
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not motivate this journey.");
    }
  }

  async function addComment(body: string) {
    if (post.comments.some((comment) => comment.body === body && comment.canDelete)) {
      notify("You already left that encouragement.");
      return;
    }
    try {
      const result = await roavlyApi.comment(token, post.id, body);
      onChange({ ...post, comments: [...post.comments, result.comment] });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not add encouragement.");
    }
  }

  function removeComment(commentId: string) {
    Alert.alert(
      "Delete encouragement?",
      "This will remove the comment from the journey.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await roavlyApi.deleteComment(token, post.id, commentId);
              onChange({
                ...post,
                comments: post.comments.filter((comment) => comment.id !== commentId),
              });
            } catch (error) {
              notify(error instanceof Error ? error.message : "Could not delete the comment.");
            }
          },
        },
      ],
    );
  }

  function showPostActions() {
    const options = post.isOwner
      ? ["Cancel", "Delete journey"]
      : ["Cancel", "Report journey"];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
        destructiveButtonIndex: 1,
        title: post.isOwner ? "Manage your journey" : "Community safety",
      },
      async (index) => {
        if (index !== 1) return;
        if (post.isOwner) {
          Alert.alert("Delete journey?", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                try {
                  await roavlyApi.deletePost(token, post.id);
                  onRemove(post.id);
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not delete the journey.");
                }
              },
            },
          ]);
          return;
        }
        try {
          await roavlyApi.reportPost(token, post.id);
          notify("Thanks. Waymark has received your report.");
        } catch (error) {
          notify(error instanceof Error ? error.message : "Could not send the report.");
        }
      },
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(post.authorName)}</Text>
        </View>
        <View style={styles.author}>
          <Text style={styles.authorName}>{post.authorName}</Text>
          <Text style={styles.meta}>
            @{post.authorUsername} · {new Date(post.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Journey options"
          hitSlop={10}
          onPress={showPostActions}
          style={styles.more}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <Image
        source={mediaSource(post.imageUrl, token)}
        style={styles.photo}
        resizeMode="cover"
        accessibilityLabel={`${post.activityType} journey shared by ${post.authorName}`}
      />

      <View style={styles.stats}>
        <Stat icon="navigate-outline" value={`${post.distanceKm || 0} km`} label="DISTANCE" />
        <Stat icon="time-outline" value={durationLabel(post.durationMinutes)} label="OUTDOORS" />
        <Stat icon="trending-up-outline" value={`${post.elevationMetres || 0} m`} label="ELEVATION" />
      </View>

      <View style={styles.body}>
        <View style={styles.chips}>
          <Text style={styles.chip}>{post.activityType}</Text>
          <Text style={styles.chip}>{post.difficulty}</Text>
        </View>
        <View style={styles.location}>
          <Ionicons name="location-outline" size={14} color={colors.muted} />
          <Text style={styles.locationText} numberOfLines={1}>{post.location}</Text>
        </View>
        <Text style={styles.caption}>{post.caption}</Text>
        {post.tips ? (
          <View style={styles.tip}>
            <Ionicons name="bulb-outline" size={16} color={colors.forest} />
            <Text style={styles.tipText}>{post.tips}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.motivationWrap}>
        <Pressable
          onPress={motivate}
          style={[styles.motivate, post.viewerMotivated && styles.motivated]}
        >
          <Ionicons
            name={post.viewerMotivated ? "sparkles" : "sparkles-outline"}
            size={18}
            color={post.viewerMotivated ? colors.white : colors.forest}
          />
          <Text style={[styles.motivateText, post.viewerMotivated && styles.motivatedText]}>
            I’m motivated
          </Text>
        </Pressable>
        <Text style={styles.motivationCount}>
          {post.motivationCount
            ? `You motivated ${post.motivationCount} ${post.motivationCount === 1 ? "person" : "people"}`
            : "Be the first person motivated"}
        </Text>
      </View>

      <View style={styles.comments}>
        {post.comments.map((comment) => (
          <View key={comment.id} style={styles.comment}>
            <Text style={styles.commentCopy}>
              <Text style={styles.commentAuthor}>@{comment.authorUsername} </Text>
              {comment.body}
            </Text>
            {comment.canDelete ? (
              <Pressable
                accessibilityLabel="Delete comment"
                hitSlop={10}
                onPress={() => removeComment(comment.id)}
              >
                <Ionicons name="trash-outline" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        ))}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.encouragements}
        >
          {positiveEncouragements.map((encouragement) => (
            <Pressable
              key={encouragement}
              onPress={() => addComment(encouragement)}
              style={styles.encouragement}
            >
              <Text style={styles.encouragementText}>{encouragement}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={17} color={colors.forest} />
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginBottom: 18,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  header: { minHeight: 70, padding: 14, flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontWeight: "800", fontSize: 12 },
  author: { flex: 1, marginLeft: 11 },
  authorName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  more: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", aspectRatio: 4 / 3, backgroundColor: colors.border },
  stats: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  statValue: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 8, fontWeight: "700", marginTop: 1 },
  body: { padding: 16 },
  chips: { flexDirection: "row", gap: 7, marginBottom: 9 },
  chip: {
    color: colors.forest,
    backgroundColor: colors.mintWash,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "800",
  },
  location: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 10 },
  locationText: { flex: 1, color: colors.muted, fontSize: 11 },
  caption: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  tip: {
    marginTop: 13,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.mintWash,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  tipText: { flex: 1, color: colors.forest, fontSize: 12, lineHeight: 17 },
  motivationWrap: { paddingHorizontal: 16, paddingBottom: 14 },
  motivate: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#84DDB4",
    backgroundColor: colors.mint,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  motivated: { backgroundColor: colors.forest, borderColor: colors.forest },
  motivateText: { color: colors.forest, fontWeight: "800" },
  motivatedText: { color: colors.white },
  motivationCount: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 8 },
  comments: {
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  comment: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 5,
  },
  commentCopy: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 17 },
  commentAuthor: { color: colors.forest, fontWeight: "800" },
  encouragements: { gap: 8, paddingTop: 7, paddingRight: 14 },
  encouragement: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
  },
  encouragementText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
});
