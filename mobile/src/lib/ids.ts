import * as Crypto from "expo-crypto";

/** React Native–safe UUID v4 for outbox and local client ids. */
export function newClientId(): string {
  return Crypto.randomUUID();
}
