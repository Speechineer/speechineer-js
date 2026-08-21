/**
 * The React wiring of the client: `SpeechineerProvider` makes one `SpeechineerClient`
 * available to every hook below it (created from the props, or handed in as `client`);
 * `useSpeechineer` reads it. Hooks also accept a `client` option to bypass the context
 * (several workspaces in one app, tests).
 */

import { type ClientOptions, createClient, type SpeechineerClient, SpeechineerError } from '@speechineer/js';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

const SpeechineerContext = createContext<SpeechineerClient | null>(null);

/**
 * What the provider takes: either a client you created yourself, or the client
 * options (`apiKey` / `token`, `account`, `baseUrl`) — the provider creates the client
 * for you and keeps it for as long as the options stay the same.
 *
 * @group Setup
 */
export interface SpeechineerProviderProps extends ClientOptions {
  /** A client you created with `createClient`. When given, the other options are ignored. */
  client?: SpeechineerClient;
  /** The part of your app that uses Speechineer. */
  children?: ReactNode;
}

/**
 * Wrap your app (or the part of it that talks to Speechineer) once. Every hook below
 * it uses the same client.
 *
 * @example
 * ```tsx
 * import { SpeechineerProvider } from "@speechineer/react";
 *
 * <SpeechineerProvider apiKey={import.meta.env.VITE_SPEECHINEER_KEY} account={{ key: user.id }}>
 *   <App />
 * </SpeechineerProvider>
 * ```
 *
 * @group Setup
 */
export function SpeechineerProvider({ client, children, ...options }: SpeechineerProviderProps) {
  const { apiKey, token, baseUrl, account } = options;
  const accountKey = account?.key;
  const accountPseudonym = account?.pseudonym;
  const value = useMemo(
    () =>
      client ??
      createClient({
        apiKey,
        token,
        baseUrl,
        account: accountKey ? { key: accountKey, pseudonym: accountPseudonym } : undefined,
      }),
    // Primitives only — a fresh `account` object every render must not recreate the client.
    [client, apiKey, token, baseUrl, accountKey, accountPseudonym],
  );
  return <SpeechineerContext.Provider value={value}>{children}</SpeechineerContext.Provider>;
}

/** Resolve the client a hook should use: its own `client` option, else the provider's. @internal */
export function useClient(override?: SpeechineerClient): SpeechineerClient {
  const fromContext = useContext(SpeechineerContext);
  const client = override ?? fromContext;
  if (!client) {
    throw new SpeechineerError(
      'No Speechineer client: wrap your app in <SpeechineerProvider> or pass `client` to the hook.',
      { code: 'NO_CLIENT', phase: 'start', recoverable: false },
    );
  }
  return client;
}

/**
 * The client the nearest `SpeechineerProvider` created — for the rare case where you
 * want to create a session yourself (`client.speechToForm(...)`) instead of using a hook.
 *
 * @group Setup
 */
export function useSpeechineer(): SpeechineerClient {
  return useClient();
}
