import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "gas_store_access";
const REFRESH_KEY = "gas_store_refresh";
const ROLE_KEY = "gas_store_role";
const USERNAME_KEY = "gas_store_username";
const LAST_ONLINE_KEY = "gas_store_last_online_auth_at";

export type SessionRole = "admin" | "user";

export interface SessionProfile {
  role: SessionRole;
  username: string;
  lastOnlineAuthAt: string;
}

/** Persist mobile Bearer tokens in SecureStore. */
export async function saveTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

/** Read stored access token. */
export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

/** Read stored refresh token. */
export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

/** Cache role and username after a successful online auth. */
export async function saveSessionProfile(profile: SessionProfile): Promise<void> {
  await SecureStore.setItemAsync(ROLE_KEY, profile.role);
  await SecureStore.setItemAsync(USERNAME_KEY, profile.username);
  await SecureStore.setItemAsync(LAST_ONLINE_KEY, profile.lastOnlineAuthAt);
}

/** Mark the last time the server validated this session. */
export async function touchLastOnlineAuth(): Promise<void> {
  await SecureStore.setItemAsync(LAST_ONLINE_KEY, new Date().toISOString());
}

/** Read cached session profile for offline routing. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const role = await SecureStore.getItemAsync(ROLE_KEY);
  const username = await SecureStore.getItemAsync(USERNAME_KEY);
  const lastOnlineAuthAt = await SecureStore.getItemAsync(LAST_ONLINE_KEY);
  if (!role || !username || !lastOnlineAuthAt) {
    return null;
  }
  if (role !== "admin" && role !== "user") {
    return null;
  }
  return { role, username, lastOnlineAuthAt };
}

/** Clear session tokens and cached profile. */
export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(ROLE_KEY);
  await SecureStore.deleteItemAsync(USERNAME_KEY);
  await SecureStore.deleteItemAsync(LAST_ONLINE_KEY);
}
