import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme";

export function AuthScreen({
  signingIn,
  onSignIn,
}: {
  signingIn: boolean;
  onSignIn: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <View style={styles.brandMark}>
          <Ionicons name="trail-sign" size={38} color={colors.white} />
        </View>
        <Text style={styles.brand}>ROAVLY</Text>
        <Text style={styles.title}>The outdoors feels better together.</Text>
        <Text style={styles.copy}>
          Share your journey, motivate other people and plan your next adventure
          with friends.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.promise}>
          <Ionicons name="sparkles" size={18} color={colors.green} />
          <Text style={styles.promiseText}>Encouragement, not comparison</Text>
        </View>
        <View style={styles.promise}>
          <Ionicons name="shield-checkmark" size={18} color={colors.green} />
          <Text style={styles.promiseText}>Location and meetup safety controls</Text>
        </View>
        <View style={styles.promise}>
          <Ionicons name="people" size={18} color={colors.green} />
          <Text style={styles.promiseText}>Private Journey Together groups</Text>
        </View>

        <Pressable
          disabled={signingIn}
          onPress={onSignIn}
          style={({ pressed }) => [
            styles.signIn,
            (pressed || signingIn) && styles.signInPressed,
          ]}
        >
          {signingIn ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={20} color={colors.white} />
              <Text style={styles.signInText}>Sign in to Roavly</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.note}>
          Your existing Roavly profile, posts and friends will appear automatically.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.forest },
  top: { flex: 1, padding: 30, justifyContent: "center", alignItems: "center" },
  brandMark: {
    width: 86,
    height: 86,
    borderRadius: 28,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  brand: {
    color: colors.mint,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 4,
    marginBottom: 20,
  },
  title: {
    color: colors.white,
    fontSize: 36,
    lineHeight: 41,
    fontWeight: "900",
    letterSpacing: -1.4,
    textAlign: "center",
  },
  copy: {
    color: "#D6E8DF",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 15,
    maxWidth: 340,
  },
  card: {
    margin: 16,
    padding: 22,
    borderRadius: 24,
    backgroundColor: colors.white,
  },
  promise: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 13 },
  promiseText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  signIn: {
    minHeight: 54,
    marginTop: 8,
    borderRadius: 15,
    backgroundColor: colors.forest,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  signInPressed: { opacity: 0.72 },
  signInText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  note: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 12,
  },
});
