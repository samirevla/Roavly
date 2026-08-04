export type Viewer = {
  displayName: string;
  email: string;
  fullName: string | null;
};

export type Profile = {
  email: string;
  displayName: string;
  username: string;
  bio: string;
  homeBase: string;
  favoriteActivities: string;
  ageBand: string;
  experienceLevel: string;
  pacePreference: string;
  availability: string;
  travelRadiusKm: number;
  groupStyle: string;
  accessibilityNeeds: string;
};

export type Comment = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorUsername: string;
  canDelete: boolean;
};

export type Post = {
  id: string;
  authorName: string;
  authorUsername: string;
  caption: string;
  activityType: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  locationPrivacy: string;
  locationPrecision: "exact" | "approximate";
  distanceKm: number;
  durationMinutes: number;
  elevationMetres: number;
  difficulty: string;
  tips: string;
  conditions: string;
  parkingInfo: string;
  phoneSignal: string;
  toilets: string;
  accessibility: string;
  dogFriendly: string;
  bestTime: string;
  inspiredByPostId: string | null;
  imageKey: string;
  imageUrl: string;
  createdAt: string;
  motivationCount: number;
  viewerMotivated: boolean;
  saveCount: number;
  viewerSaved: boolean;
  viewerSaveStatus: "none" | "saved" | "planned" | "completed";
  inspiredCount: number;
  inspiredMinutes: number;
  isOwner: boolean;
  comments: Comment[];
};

export type Relationship = "none" | "outgoing" | "incoming" | "friends";

export type Person = {
  displayName: string;
  username: string;
  bio: string;
  homeBase: string;
  favoriteActivities: string;
  experienceLevel: string;
  pacePreference: string;
  availability: string;
  travelRadiusKm: number;
  groupStyle: string;
  accessibilityNeeds: string;
  relationship: Relationship;
};

export type ConversationMember = {
  displayName: string;
  username: string;
  isViewer: boolean;
};

export type Conversation = {
  id: string;
  type: "direct" | "group";
  purpose: "chat" | "journey";
  name: string;
  username: string;
  activityType: string;
  startsAt: string | null;
  location: string;
  planNotes: string;
  isCreator: boolean;
  members: ConversationMember[];
  updatedAt: string;
  unreadCount: number;
  lastMessage: {
    body: string;
    createdAt: string;
    isMine: boolean;
  } | null;
};

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorUsername: string;
  isMine: boolean;
};

export type Place = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export const positiveEncouragements = [
  "👏 Amazing effort!",
  "🔥 Keep it going!",
  "💚 You motivated me!",
  "⛰️ What an adventure!",
  "🙌 Love this journey!",
  "🌿 Fresh air wins!",
  "💪 Strong work!",
  "✨ So inspiring!",
] as const;
