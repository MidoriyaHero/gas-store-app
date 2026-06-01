import * as FileSystem from "expo-file-system";

/** Copy a recorded voice clip into app document storage so playback survives cache eviction. */
export async function persistVoiceRecording(sourceUri: string, clientId: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}voice-notes/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const ext = sourceUri.includes(".") ? sourceUri.slice(sourceUri.lastIndexOf(".")) : ".m4a";
  const dest = `${dir}${clientId}${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}
