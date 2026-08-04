import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { colors } from "../theme";
import type { Place, Post } from "../types";

const activities = ["Hiking", "Running", "Rock climbing", "Snowboarding", "Cycling", "Walking"];
const difficulties = ["Easy", "Moderate", "Challenging", "Expert"];

type Photo = {
  uri: string;
  previewUri: string;
  name: string;
};

export function ComposerModal({
  visible,
  token,
  onClose,
  onPublished,
  notify,
}: {
  visible: boolean;
  token: string;
  onClose: () => void;
  onPublished: (post: Post) => void;
  notify: (message: string) => void;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [caption, setCaption] = useState("");
  const [activity, setActivity] = useState("Hiking");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [difficulty, setDifficulty] = useState("Moderate");
  const [tips, setTips] = useState("");
  const [privacy, setPrivacy] = useState<"approximate" | "friends" | "exact">("approximate");
  const [place, setPlace] = useState<Place | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify("Allow photo access in iPhone Settings to share a journey.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 1,
      exif: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    try {
      const longEdge = Math.max(asset.width, asset.height);
      const actions: ImageManipulator.Action[] =
        longEdge > 1800
          ? asset.width >= asset.height
            ? [{ resize: { width: 1800 } }]
            : [{ resize: { height: 1800 } }]
          : [];
      const prepared = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setPhoto({
        uri: prepared.uri,
        previewUri: prepared.uri,
        name: `roavly-${Date.now()}.jpg`,
      });
    } catch {
      notify("That photo could not be prepared. Try selecting it once more.");
    }
  }

  function reset() {
    setPhoto(null);
    setCaption("");
    setActivity("Hiking");
    setDuration("");
    setDistance("");
    setElevation("");
    setDifficulty("Moderate");
    setTips("");
    setPrivacy("approximate");
    setPlace(null);
  }

  async function publish() {
    if (!photo) {
      notify("Choose a photo for your journey.");
      return;
    }
    if (!caption.trim()) {
      notify("Write a caption about your journey.");
      return;
    }
    if (!Number(duration) || Number(duration) < 1) {
      notify("Add how many minutes you spent outdoors.");
      return;
    }
    if (!place) {
      notify("Choose a location from Google search.");
      return;
    }

    setPublishing(true);
    try {
      const form = new FormData();
      form.append(
        "photo",
        {
          uri: photo.uri,
          name: photo.name,
          type: "image/jpeg",
        } as unknown as Blob,
      );
      form.append("caption", caption.trim());
      form.append("activityType", activity);
      form.append("location", place.address);
      form.append("latitude", String(place.latitude));
      form.append("longitude", String(place.longitude));
      form.append("placeId", place.id);
      form.append("locationPrivacy", privacy);
      form.append("distanceKm", distance || "0");
      form.append("durationMinutes", duration);
      form.append("elevationMetres", elevation || "0");
      form.append("difficulty", difficulty);
      form.append("tips", tips.trim());
      form.append("conditions", "");
      form.append("parkingInfo", "");
      form.append("phoneSignal", "Unknown");
      form.append("toilets", "Unknown");
      form.append("accessibility", "");
      form.append("dogFriendly", "Unknown");
      form.append("bestTime", "");
      form.append("inspiredByPostId", "");

      const result = await roavlyApi.createPost(token, form);
      onPublished(result.post);
      reset();
      onClose();
      notify("Your journey is live.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "The journey could not be shared.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={25} color={colors.ink} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>NEW JOURNEY</Text>
            <Text style={styles.title}>Share your adventure</Text>
          </View>
          <Pressable
            disabled={publishing}
            onPress={publish}
            style={[styles.publish, publishing && styles.disabled]}
          >
            {publishing ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.publishText}>Share</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable onPress={choosePhoto} style={styles.photoPicker}>
              {photo ? (
                <Image source={{ uri: photo.previewUri }} style={styles.photo} />
              ) : (
                <View style={styles.photoEmpty}>
                  <View style={styles.photoIcon}>
                    <Ionicons name="images-outline" size={30} color={colors.forest} />
                  </View>
                  <Text style={styles.photoTitle}>Choose an iPhone photo</Text>
                  <Text style={styles.photoNote}>
                    HEIF, HEIC and large photos are converted automatically
                  </Text>
                </View>
              )}
            </Pressable>

            <FieldLabel label="What happened?" required />
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Tell people about the journey..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
              style={[styles.input, styles.caption]}
            />

            <FieldLabel label="Activity" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.pills}>
                {activities.map((value) => (
                  <ChoicePill
                    key={value}
                    label={value}
                    selected={activity === value}
                    onPress={() => setActivity(value)}
                  />
                ))}
              </View>
            </ScrollView>

            <FieldLabel label="Location" required />
            <Pressable onPress={() => setLocationOpen(true)} style={styles.locationButton}>
              <Ionicons name="location-outline" size={20} color={colors.forest} />
              <View style={styles.locationCopy}>
                <Text style={place ? styles.locationValue : styles.placeholder}>
                  {place?.name || "Search Google for a place"}
                </Text>
                {place ? <Text style={styles.locationAddress}>{place.address}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>

            <View style={styles.row}>
              <View style={styles.flex}>
                <FieldLabel label="Minutes outdoors" required />
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="90"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.flex}>
                <FieldLabel label="Distance (km)" />
                <TextInput
                  value={distance}
                  onChangeText={setDistance}
                  placeholder="8"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.flex}>
                <FieldLabel label="Elevation (m)" />
                <TextInput
                  value={elevation}
                  onChangeText={setElevation}
                  placeholder="320"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.flex}>
                <FieldLabel label="Difficulty" />
                <View style={styles.compactChoices}>
                  {difficulties.map((value) => (
                    <ChoicePill
                      key={value}
                      label={value}
                      selected={difficulty === value}
                      onPress={() => setDifficulty(value)}
                      compact
                    />
                  ))}
                </View>
              </View>
            </View>

            <FieldLabel label="Helpful tip" />
            <TextInput
              value={tips}
              onChangeText={setTips}
              placeholder="Parking, trail conditions, what to bring..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={400}
              style={[styles.input, styles.tips]}
            />

            <FieldLabel label="Location privacy" />
            <View style={styles.privacyChoices}>
              {([
                ["approximate", "Approximate"],
                ["friends", "Friends"],
                ["exact", "Exact"],
              ] as const).map(([value, label]) => (
                <ChoicePill
                  key={value}
                  label={label}
                  selected={privacy === value}
                  onPress={() => setPrivacy(value)}
                />
              ))}
            </View>
            <Text style={styles.safetyNote}>
              Precise locations are automatically hidden for members under 18.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PlaceSearchModal
        visible={locationOpen}
        token={token}
        onClose={() => setLocationOpen(false)}
        onSelect={(nextPlace) => {
          setPlace(nextPlace);
          setLocationOpen(false);
        }}
        notify={notify}
      />
    </Modal>
  );
}

function PlaceSearchModal({
  visible,
  token,
  onClose,
  onSelect,
  notify,
}: {
  visible: boolean;
  token: string;
  onClose: () => void;
  onSelect: (place: Place) => void;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const result = await roavlyApi.places(token, query);
      setPlaces(result.places);
      if (!result.places.length) notify("No matching locations were found.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Location search could not load.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.placeHeader}>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.placeHeaderTitle}>Choose a location</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.placeSearch}>
          <Ionicons name="search" size={19} color={colors.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            placeholder="Trail, park, mountain or address"
            placeholderTextColor={colors.muted}
            style={styles.placeInput}
          />
          <Pressable onPress={search} style={styles.searchButton}>
            {searching ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.placeList}>
          {places.map((item) => (
            <Pressable key={item.id} onPress={() => onSelect(item)} style={styles.place}>
              <View style={styles.placeIcon}>
                <Ionicons name="location" size={18} color={colors.forest} />
              </View>
              <View style={styles.locationCopy}>
                <Text style={styles.placeName}>{item.name}</Text>
                <Text style={styles.placeAddress}>{item.address}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

function ChoicePill({
  label,
  selected,
  onPress,
  compact,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        compact && styles.pillCompact,
        selected && styles.pillSelected,
      ]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: {
    minHeight: 68,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, alignItems: "center" },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800", marginTop: 2 },
  publish: {
    minWidth: 64,
    height: 40,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.55 },
  publishText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  content: { padding: 16, paddingBottom: 50 },
  photoPicker: {
    aspectRatio: 4 / 3,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  photo: { width: "100%", height: "100%" },
  photoEmpty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  photoIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.mintWash,
    alignItems: "center",
    justifyContent: "center",
  },
  photoTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 13 },
  photoNote: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 5 },
  label: { color: colors.ink, fontSize: 12, fontWeight: "800", marginTop: 18, marginBottom: 7 },
  required: { color: colors.orange },
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
  caption: { minHeight: 98, paddingTop: 13, textAlignVertical: "top" },
  tips: { minHeight: 82, paddingTop: 13, textAlignVertical: "top" },
  pills: { flexDirection: "row", gap: 8, paddingRight: 20 },
  pill: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pillCompact: { minHeight: 31, paddingHorizontal: 9, marginBottom: 5 },
  pillSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  pillText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  pillTextSelected: { color: colors.white },
  locationButton: {
    minHeight: 58,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  locationCopy: { flex: 1 },
  locationValue: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  placeholder: { color: colors.muted, fontSize: 13 },
  locationAddress: { color: colors.muted, fontSize: 10, marginTop: 3 },
  row: { flexDirection: "row", gap: 12 },
  compactChoices: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  privacyChoices: { flexDirection: "row", gap: 8 },
  safetyNote: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  placeHeader: {
    minHeight: 64,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  placeHeaderTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  placeSearch: {
    minHeight: 54,
    margin: 14,
    paddingLeft: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  placeInput: { flex: 1, color: colors.ink, fontSize: 14 },
  searchButton: {
    height: 42,
    minWidth: 72,
    marginRight: 5,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonText: { color: colors.white, fontSize: 11, fontWeight: "800" },
  placeList: { paddingHorizontal: 14, paddingBottom: 30, gap: 8 },
  place: {
    minHeight: 70,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  placeIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.mintWash,
    alignItems: "center",
    justifyContent: "center",
  },
  placeName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  placeAddress: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
});
