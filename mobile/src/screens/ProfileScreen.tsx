import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { colors } from "../theme";
import type { Post, Profile } from "../types";

const achievements = [
  { minutes: 60, name: "Fresh Air Starter", icon: "leaf-outline" as const },
  { minutes: 300, name: "Trail Regular", icon: "footsteps-outline" as const },
  { minutes: 600, name: "Outdoor Adventurer", icon: "compass-outline" as const },
  { minutes: 1500, name: "Wild Spirit", icon: "bonfire-outline" as const },
  { minutes: 3000, name: "Roavly Legend", icon: "trophy-outline" as const },
];

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
}

export function ProfileScreen({
  token,
  profile,
  posts,
  onProfileChange,
  onLogout,
  notify,
}: {
  token: string;
  profile: Profile;
  posts: Post[];
  onProfileChange: (profile: Profile) => void;
  onLogout: () => void;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const totalMinutes = useMemo(
    () => posts.filter((post) => post.isOwner).reduce((sum, post) => sum + post.durationMinutes, 0),
    [posts],
  );
  const nextAchievement = achievements.find((achievement) => achievement.minutes > totalMinutes);
  const progress = nextAchievement
    ? Math.min(1, totalMinutes / nextAchievement.minutes)
    : 1;

  return (
    <View style={styles.screen}>
      <AppHeader
        eyebrow="YOUR OUTDOORS"
        title="Profile"
        action={{ icon: "create-outline", label: "Edit profile", onPress: () => setEditing(true) }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile.displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("")}
            </Text>
          </View>
          <Text style={styles.name}>{profile.displayName}</Text>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          <View style={styles.profileFacts}>
            <ProfileFact icon="location-outline" text={profile.homeBase || "Add your home area"} />
            <ProfileFact icon="walk-outline" text={profile.favoriteActivities || "All outdoor activities"} />
            <ProfileFact icon="speedometer-outline" text={profile.experienceLevel} />
          </View>
        </View>

        <View style={styles.tracker}>
          <View style={styles.trackerTop}>
            <View>
              <Text style={styles.eyebrow}>TIME OUTDOORS</Text>
              <Text style={styles.total}>{durationLabel(totalMinutes)}</Text>
            </View>
            <View style={styles.trackerIcon}>
              <Ionicons name="sunny-outline" size={29} color={colors.forest} />
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressCopy}>
            {nextAchievement
              ? `${Math.max(0, nextAchievement.minutes - totalMinutes)} minutes until ${nextAchievement.name}`
              : "You have unlocked every current outdoor achievement."}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Achievements</Text>
        <View style={styles.achievements}>
          {achievements.map((achievement) => {
            const unlocked = totalMinutes >= achievement.minutes;
            return (
              <View key={achievement.name} style={styles.achievement}>
                <View style={[styles.badge, !unlocked && styles.badgeLocked]}>
                  <Ionicons
                    name={achievement.icon}
                    size={22}
                    color={unlocked ? colors.white : colors.muted}
                  />
                </View>
                <View style={styles.achievementCopy}>
                  <Text style={styles.achievementName}>{achievement.name}</Text>
                  <Text style={styles.achievementDetail}>
                    {durationLabel(achievement.minutes)} outdoors
                  </Text>
                </View>
                <Ionicons
                  name={unlocked ? "checkmark-circle" : "lock-closed-outline"}
                  size={21}
                  color={unlocked ? colors.green : colors.muted}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.safetyCard}>
          <Ionicons name="shield-checkmark-outline" size={23} color={colors.forest} />
          <View style={styles.safetyCopy}>
            <Text style={styles.safetyTitle}>Positive community controls</Text>
            <Text style={styles.safetyText}>
              Encouragement-only comments, reporting, blocking and protected youth locations are active.
            </Text>
          </View>
        </View>

        <Pressable onPress={onLogout} style={styles.logout}>
          <Ionicons name="log-out-outline" size={19} color={colors.danger} />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
        <Text style={styles.version}>Roavly iPhone beta · Version 0.1</Text>
      </ScrollView>

      <ProfileEditModal
        visible={editing}
        token={token}
        profile={profile}
        onClose={() => setEditing(false)}
        onSaved={(next) => {
          onProfileChange(next);
          setEditing(false);
          notify("Profile updated.");
        }}
        notify={notify}
      />
    </View>
  );
}

function ProfileEditModal({
  visible,
  token,
  profile,
  onClose,
  onSaved,
  notify,
}: {
  visible: boolean;
  token: string;
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await roavlyApi.updateProfile(token, draft);
      onSaved(result.profile);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={25} color={colors.ink} />
          </Pressable>
          <Text style={styles.modalTitle}>Edit profile</Text>
          <Pressable disabled={saving} onPress={save} style={styles.saveButton}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.form}>
          <FormField
            label="Display name"
            value={draft.displayName}
            onChangeText={(displayName) => setDraft({ ...draft, displayName })}
          />
          <FormField
            label="Username"
            value={draft.username}
            autoCapitalize="none"
            onChangeText={(username) => setDraft({ ...draft, username })}
          />
          <FormField
            label="Bio"
            value={draft.bio}
            multiline
            onChangeText={(bio) => setDraft({ ...draft, bio })}
          />
          <FormField
            label="Home area"
            value={draft.homeBase}
            onChangeText={(homeBase) => setDraft({ ...draft, homeBase })}
          />
          <FormField
            label="Favourite activities"
            value={draft.favoriteActivities}
            onChangeText={(favoriteActivities) => setDraft({ ...draft, favoriteActivities })}
          />
          <FormField
            label="Experience level"
            value={draft.experienceLevel}
            onChangeText={(experienceLevel) => setDraft({ ...draft, experienceLevel })}
          />
          <FormField
            label="Availability"
            value={draft.availability}
            onChangeText={(availability) => setDraft({ ...draft, availability })}
          />
          <FormField
            label="Accessibility needs"
            value={draft.accessibilityNeeds}
            multiline
            onChangeText={(accessibilityNeeds) => setDraft({ ...draft, accessibilityNeeds })}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function FormField({
  label,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  autoCapitalize?: "none";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function ProfileFact({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.profileFact}>
      <Ionicons name={icon} size={15} color={colors.green} />
      <Text style={styles.profileFactText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 14, paddingBottom: 38 },
  profileCard: {
    padding: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontSize: 21, fontWeight: "900" },
  name: { color: colors.ink, fontSize: 22, fontWeight: "900", marginTop: 13 },
  username: { color: colors.green, fontSize: 12, fontWeight: "800", marginTop: 3 },
  bio: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 11 },
  profileFacts: { width: "100%", gap: 8, marginTop: 18 },
  profileFact: {
    minHeight: 35,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: colors.canvas,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileFactText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  tracker: {
    marginTop: 13,
    padding: 20,
    borderRadius: 22,
    backgroundColor: colors.forest,
  },
  trackerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  total: { color: colors.white, fontSize: 31, fontWeight: "900", marginTop: 4 },
  trackerIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 8,
    marginTop: 18,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.mint },
  progressCopy: { color: "#D6E8DF", fontSize: 10, marginTop: 8 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "900", marginTop: 24, marginBottom: 10 },
  achievements: { gap: 8 },
  achievement: {
    minHeight: 70,
    padding: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    width: 45,
    height: 45,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLocked: { backgroundColor: colors.canvas },
  achievementCopy: { flex: 1, marginLeft: 10 },
  achievementName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  achievementDetail: { color: colors.muted, fontSize: 10, marginTop: 3 },
  safetyCard: {
    marginTop: 18,
    padding: 15,
    borderRadius: 17,
    backgroundColor: colors.mintWash,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  safetyCopy: { flex: 1 },
  safetyTitle: { color: colors.forest, fontSize: 12, fontWeight: "900" },
  safetyText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  logout: {
    minHeight: 50,
    marginTop: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F1CCCC",
    backgroundColor: "#FFF7F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutText: { color: colors.danger, fontSize: 13, fontWeight: "800" },
  version: { color: colors.muted, fontSize: 9, textAlign: "center", marginTop: 12 },
  modalSafe: { flex: 1, backgroundColor: colors.canvas },
  modalHeader: {
    minHeight: 66,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerButton: { width: 54, height: 44, alignItems: "center", justifyContent: "center" },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  saveButton: {
    minWidth: 54,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { color: colors.white, fontSize: 11, fontWeight: "900" },
  form: { padding: 16, paddingBottom: 40 },
  field: { marginBottom: 14 },
  fieldLabel: { color: colors.ink, fontSize: 11, fontWeight: "800", marginBottom: 6 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 82, paddingTop: 12, textAlignVertical: "top" },
});
