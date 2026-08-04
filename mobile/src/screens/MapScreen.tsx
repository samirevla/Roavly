import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { mediaSource } from "../api";
import { AppHeader } from "../components/AppHeader";
import { colors, shadow } from "../theme";
import type { Post } from "../types";

export function MapScreen({
  token,
  posts,
}: {
  token: string;
  posts: Post[];
}) {
  const mappedPosts = posts.filter(
    (post): post is Post & { latitude: number; longitude: number } =>
      typeof post.latitude === "number" && typeof post.longitude === "number",
  );
  const [selected, setSelected] = useState<Post | null>(null);
  const region = useMemo(() => {
    const first = mappedPosts[0];
    return {
      latitude: first?.latitude ?? -37.8136,
      longitude: first?.longitude ?? 144.9631,
      latitudeDelta: first ? 0.85 : 6,
      longitudeDelta: first ? 0.85 : 6,
    };
  }, [mappedPosts]);

  return (
    <View style={styles.screen}>
      <AppHeader eyebrow="DISCOVER" title="Adventure map" />
      <View style={styles.mapWrap}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton
          loadingEnabled
        >
          {mappedPosts.map((post) => (
            <Marker
              key={post.id}
              coordinate={{ latitude: post.latitude, longitude: post.longitude }}
              pinColor={colors.forest}
              onPress={() => setSelected(post)}
            >
              <Callout tooltip onPress={() => setSelected(post)}>
                <View style={styles.callout}>
                  <Text style={styles.calloutType}>{post.activityType}</Text>
                  <Text style={styles.calloutTitle} numberOfLines={2}>{post.caption}</Text>
                  <Text style={styles.calloutLocation} numberOfLines={1}>{post.location}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
        <View style={styles.mapHint}>
          <Ionicons name="map-outline" size={16} color={colors.forest} />
          <Text style={styles.mapHintText}>
            Tap a marker to see what people did there
          </Text>
        </View>
      </View>

      <Modal
        visible={Boolean(selected)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSelected(null)}>
          {selected ? (
            <Pressable style={styles.sheet} onPress={() => undefined}>
              <View style={styles.grabber} />
              <Image
                source={mediaSource(selected.imageUrl, token)}
                style={styles.preview}
                resizeMode="cover"
              />
              <Text style={styles.sheetType}>{selected.activityType} · {selected.difficulty}</Text>
              <Text style={styles.sheetTitle}>{selected.caption}</Text>
              <View style={styles.sheetLocation}>
                <Ionicons name="location-outline" size={16} color={colors.muted} />
                <Text style={styles.sheetLocationText}>{selected.location}</Text>
              </View>
              <View style={styles.sheetStats}>
                <Text>{selected.distanceKm || 0} km</Text>
                <Text>{selected.durationMinutes} min outdoors</Text>
                <Text>{selected.elevationMetres || 0} m climb</Text>
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  mapWrap: { flex: 1, overflow: "hidden" },
  mapHint: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...shadow,
  },
  mapHintText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  callout: {
    width: 210,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.white,
  },
  calloutType: { color: colors.green, fontSize: 10, fontWeight: "900" },
  calloutTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 4 },
  calloutLocation: { color: colors.muted, fontSize: 10, marginTop: 5 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" },
  sheet: {
    padding: 18,
    paddingBottom: 34,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.white,
  },
  grabber: {
    width: 42,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  preview: { width: "100%", height: 210, borderRadius: 18, backgroundColor: colors.border },
  sheetType: { color: colors.green, fontSize: 11, fontWeight: "900", marginTop: 14 },
  sheetTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", marginTop: 5 },
  sheetLocation: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  sheetLocationText: { flex: 1, color: colors.muted, fontSize: 12 },
  sheetStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 15,
    marginTop: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
