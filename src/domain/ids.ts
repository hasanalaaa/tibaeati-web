export type NewId = () => string;

/** Default id source. Callers that need determinism (tests, replays) inject their own. */
export const randomId: NewId = () => crypto.randomUUID();
