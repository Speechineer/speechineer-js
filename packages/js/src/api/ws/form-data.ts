/**
 * Form-data WebSocket client.
 *
 * The streamed form-data data plane, mirroring the service's `form_data` socket kind
 * (one socket per kind). Only `speech_to_form` opens one;
 * `speech_to_template_and_form` has no form-data WS (its results return over the
 * HTTP actions). Each inbound message is a `FormDataExtractionResult`
 * (`{ fields: FieldValue[] }`); every `{ field_id, value }` is surfaced via
 * `onFieldUpdate`.
 *
 * It maps no close codes: client-disconnect, workflow-not-found (4404) and
 * crashes (4501-4505) are detected on the lifeline WebSocket alone.
 */

import type { FormDataExtractionResult } from '../../types/sdk/common/form-data-extraction.js';

export type FieldUpdateCallback = (fieldId: string, value: unknown) => void;
export type FormDataConnectionCallback = () => void;

export interface FormDataClient {
  connect: () => void;
  disconnect: () => void;
  wsRef: { current: WebSocket | null };
}

export interface FormDataClientCallbacks {
  /** Fired once per `{ field_id, value }` in each streamed result. */
  onFieldUpdate: FieldUpdateCallback;
  /** Fired once when the form-data WebSocket opens. */
  onConnected?: FormDataConnectionCallback;
  /** Fired at most once when the form-data WebSocket closes, errors, or is disconnected. */
  onDisconnected?: FormDataConnectionCallback;
}

export function createFormDataClient(formDataUrl: string, callbacks: FormDataClientCallbacks): FormDataClient {
  const wsRef: { current: WebSocket | null } = { current: null };
  let disconnectedFired = false;

  /** Fire onDisconnected at most once per connect() cycle. */
  const fireDisconnected = (): void => {
    if (disconnectedFired) return;
    disconnectedFired = true;
    callbacks.onDisconnected?.();
  };

  const connect = (): void => {
    if (!formDataUrl) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    disconnectedFired = false;
    const ws = new WebSocket(formDataUrl);
    wsRef.current = ws;

    ws.addEventListener('open', () => callbacks.onConnected?.());
    ws.addEventListener('close', () => fireDisconnected());
    ws.addEventListener('error', () => fireDisconnected());

    ws.addEventListener('message', (event) => {
      let result: FormDataExtractionResult;
      try {
        result = JSON.parse(event.data) as FormDataExtractionResult;
      } catch {
        return; // ignore non-JSON
      }
      if (!result || !Array.isArray(result.fields)) return;
      for (const field of result.fields) {
        if (field && typeof field.field_id === 'string') {
          callbacks.onFieldUpdate(field.field_id, field.value);
        }
      }
    });
  };

  const disconnect = (): void => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        ws.close(1000, 'client closing');
      } catch {
        /* already closed */
      }
    }
    fireDisconnected();
  };

  return { connect, disconnect, wsRef };
}
