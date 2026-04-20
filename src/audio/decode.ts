/**
 * Decode compressed audio into an `AudioBuffer` for analysis + playback.
 */
export async function decodeAudioBuffer(
  context: AudioContext,
  data: ArrayBuffer,
): Promise<AudioBuffer> {
  return context.decodeAudioData(data.slice(0))
}
