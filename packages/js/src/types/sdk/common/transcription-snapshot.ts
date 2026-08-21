/**
 * Transcription snapshot — mirrors the Speechineer API's
 * transcription snapshot schema.
 *
 * The shape streamed over the transcription WS (speech_to_form_with_transcription):
 * the accumulated full transcript text (all completed turns + the latest partial).
 */

export interface TranscriptionSnapshot {
  /** Accumulated full transcript text. */
  text: string;
}
