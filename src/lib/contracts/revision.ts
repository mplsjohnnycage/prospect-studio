export class StaleRevisionError extends Error {
  readonly code = "stale_revision" as const;
  readonly status = 409 as const;
  constructor(
    readonly expected: number,
    readonly actual: number,
    message = `stale revision: expected ${expected}, actual ${actual}`
  ) {
    super(message);
    this.name = "StaleRevisionError";
  }
}

export type Revisioned = { revision: number };

/** OCC guard — throws StaleRevisionError on mismatch. */
export function assertExpectedRevision(
  subject: Revisioned,
  expectedRevision: number
): void {
  if (subject.revision !== expectedRevision) {
    throw new StaleRevisionError(expectedRevision, subject.revision);
  }
}

export function bumpRevision<T extends Revisioned>(subject: T): T {
  return { ...subject, revision: subject.revision + 1 };
}

export function isStaleRevisionError(error: unknown): error is StaleRevisionError {
  return error instanceof StaleRevisionError;
}
