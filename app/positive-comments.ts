export const POSITIVE_ENCOURAGEMENTS = [
  "👏 Amazing effort!",
  "🔥 Keep it going!",
  "💚 You motivated me!",
  "⛰️ What an adventure!",
  "🙌 Love this journey!",
  "🌿 Fresh air wins!",
  "💪 Strong work!",
  "✨ So inspiring!",
] as const;

const approvedEncouragements = new Set<string>(POSITIVE_ENCOURAGEMENTS);

export function isApprovedEncouragement(value: string) {
  return approvedEncouragements.has(value.trim());
}
