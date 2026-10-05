import { AsyncLocalStorage } from "node:async_hooks";

export interface YesWeHackCredentials {
  token: string;
}

const credentialsStorage = new AsyncLocalStorage<YesWeHackCredentials>();

export function runWithYesWeHackCredentials<T>(
  credentials: YesWeHackCredentials,
  callback: () => T
): T {
  return credentialsStorage.run(credentials, callback);
}

export function getYesWeHackCredentials(): YesWeHackCredentials | undefined {
  return credentialsStorage.getStore();
}
