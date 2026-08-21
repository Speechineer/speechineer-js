/**
 * The Angular wiring of the client: `provideSpeechineer` registers one `SpeechineerClient`
 * in the environment injector (created from the options, or handed in ready-made);
 * `injectSpeechineer` reads it. The inject functions also accept a `client` option to
 * bypass the injector (several workspaces in one app, tests).
 */

import {
  type EnvironmentProviders,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';
import { type ClientOptions, createClient, type SpeechineerClient, SpeechineerError } from '@speechineer/js';

/** The injection token the client is registered under. @internal */
export const SPEECHINEER_CLIENT = new InjectionToken<SpeechineerClient>('SPEECHINEER_CLIENT');

function isClient(value: SpeechineerClient | ClientOptions): value is SpeechineerClient {
  return typeof (value as SpeechineerClient).speechToForm === 'function';
}

/**
 * Register Speechineer once, in your application providers. Pass the client options
 * (`apiKey` / `token`, `account`, `baseUrl`) — or a client you created with
 * `createClient` — and every `inject…` function uses it.
 *
 * @example
 * ```ts
 * // app.config.ts
 * import { provideSpeechineer } from "@speechineer/angular";
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [provideSpeechineer({ apiKey: environment.speechineerKey })],
 * };
 * ```
 *
 * @group Setup
 */
export function provideSpeechineer(clientOrOptions: SpeechineerClient | ClientOptions): EnvironmentProviders {
  const client = isClient(clientOrOptions) ? clientOrOptions : createClient(clientOrOptions);
  return makeEnvironmentProviders([{ provide: SPEECHINEER_CLIENT, useValue: client }]);
}

/** Resolve the client an inject function should use: its own `client` option, else the injector's. @internal */
export function resolveClient(override?: SpeechineerClient): SpeechineerClient {
  const client = override ?? inject(SPEECHINEER_CLIENT, { optional: true });
  if (!client) {
    throw new SpeechineerError(
      'No Speechineer client: add provideSpeechineer(...) to your application providers or pass `client`.',
      { code: 'NO_CLIENT', phase: 'start', recoverable: false },
    );
  }
  return client;
}

/**
 * The client `provideSpeechineer` registered — for the rare case where you want to
 * create a session yourself (`client.speechToForm(...)`) instead of using an inject
 * function. Call it in an injection context (a constructor or a field initializer).
 *
 * @group Setup
 */
export function injectSpeechineer(): SpeechineerClient {
  return resolveClient();
}
