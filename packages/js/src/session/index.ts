/**
 * The framework-agnostic session surface: the state types every binding renders from.
 * Sessions themselves are created through the client (`client.speechToForm()`,
 * `client.textToForm()`); the React hooks and the Angular inject functions are thin
 * subscribers over exactly those.
 */

export type {
  ConnectionKey,
  ConnectionState,
  ConnectionStatus,
  SessionConnections,
  SessionState,
  SessionStatus,
} from './state.js';
