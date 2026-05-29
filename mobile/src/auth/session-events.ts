/** Thrown when refresh token is invalid; UI should redirect to login. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

type SessionHandler = () => void;

let onSessionExpired: SessionHandler | null = null;

/** Register global handler (root layout) for expired sessions. */
export function setSessionExpiredHandler(handler: SessionHandler | null): void {
  onSessionExpired = handler;
}

/** Notify app shell to return user to login. */
export function notifySessionExpired(): void {
  onSessionExpired?.();
}
