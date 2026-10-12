import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import type {
  ChatMessage,
  Conversation,
  Person,
  Place,
  Post,
  Profile,
  Viewer,
} from "./types";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "roavly.mobile.session";

export const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.replace(/\/$/, "") ||
  "https://roavly-app.ssemsedinovski.chatgpt.site";

type ApiOptions = Omit<RequestInit, "headers"> & {
  token?: string | null;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as { error?: string })
    : { error: await response.text() };
  if (!response.ok) {
    throw new ApiError(payload.error || "Waymark could not complete that request.", response.status);
  }
  return payload as T;
}

export async function readStoredToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function storeToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function signInWithRoavly() {
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_BASE}/api/mobile/auth/start`,
    "roavly://auth",
    { preferEphemeralSession: false },
  );
  if (result.type !== "success" || !result.url) {
    throw new Error("Sign-in was cancelled.");
  }
  const parsed = new URL(result.url);
  const code = parsed.searchParams.get("code");
  if (!code) throw new Error("Waymark could not complete sign-in.");
  const payload = await apiFetch<{
    token: string;
    user: Viewer;
    profile: Profile | null;
  }>("/api/mobile/auth/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  await storeToken(payload.token);
  return payload;
}

export function mediaSource(path: string, token: string) {
  return {
    uri: path.startsWith("http") ? path : `${API_BASE}${path}`,
    headers: { authorization: `Bearer ${token}` },
  };
}

export const roavlyApi = {
  me: (token: string) =>
    apiFetch<{ user: Viewer | null; profile: Profile | null }>("/api/me", { token }),
  updateProfile: (token: string, profile: Partial<Profile>) =>
    apiFetch<{ profile: Profile }>("/api/me", {
      token,
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile),
    }),
  posts: (token: string) =>
    apiFetch<{ posts: Post[] }>("/api/posts", { token }),
  createPost: (token: string, form: FormData) =>
    apiFetch<{ post: Post }>("/api/posts", {
      token,
      method: "POST",
      body: form,
    }),
  motivate: (token: string, postId: string) =>
    apiFetch<{ motivated: boolean; motivationCount: number }>(
      `/api/posts/${encodeURIComponent(postId)}/motivate`,
      { token, method: "POST" },
    ),
  comment: (token: string, postId: string, body: string) =>
    apiFetch<{ comment: Post["comments"][number] }>(
      `/api/posts/${encodeURIComponent(postId)}/comments`,
      {
        token,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      },
    ),
  deleteComment: (token: string, postId: string, commentId: string) =>
    apiFetch<{ deleted: boolean }>(
      `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      { token, method: "DELETE" },
    ),
  deletePost: (token: string, postId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/posts/${encodeURIComponent(postId)}`, {
      token,
      method: "DELETE",
    }),
  reportPost: (token: string, postId: string) =>
    apiFetch<{ reported: boolean }>(
      `/api/posts/${encodeURIComponent(postId)}/report`,
      {
        token,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Community safety concern" }),
      },
    ),
  people: (token: string) =>
    apiFetch<{ people: Person[] }>("/api/friends", { token }),
  friendAction: (
    token: string,
    targetUsername: string,
    action: "request" | "accept" | "decline" | "remove" | "block",
  ) =>
    apiFetch<{ relationship: Person["relationship"]; blocked?: boolean }>(
      "/api/friends",
      {
        token,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUsername, action }),
      },
    ),
  conversations: (token: string) =>
    apiFetch<{ conversations: Conversation[]; unreadTotal: number }>(
      "/api/conversations",
      { token },
    ),
  messages: (token: string, conversationId: string) =>
    apiFetch<{ messages: ChatMessage[] }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      { token },
    ),
  sendMessage: (token: string, conversationId: string, body: string) =>
    apiFetch<{ message: ChatMessage }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        token,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      },
    ),
  createConversation: (
    token: string,
    payload: {
      type: "direct" | "group";
      purpose?: "chat" | "journey";
      name?: string;
      memberUsernames: string[];
      activityType?: string;
      startsAt?: string;
      location?: string;
      planNotes?: string;
    },
  ) =>
    apiFetch<{ conversationId: string }>("/api/conversations", {
      token,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateJourney: (
    token: string,
    conversationId: string,
    payload: {
      name: string;
      activityType: string;
      startsAt: string;
      location: string;
      planNotes: string;
    },
  ) =>
    apiFetch<{ journey: Partial<Conversation> }>(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      {
        token,
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  places: (token: string, query: string) =>
    apiFetch<{ places: Place[] }>("/api/mobile/places/search", {
      token,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    }),
  logout: (token: string) =>
    apiFetch<{ signedOut: boolean }>("/api/mobile/auth/logout", {
      token,
      method: "POST",
    }),
};
