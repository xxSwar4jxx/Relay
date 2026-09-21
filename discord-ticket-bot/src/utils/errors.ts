/**
 * Thrown for problems the user caused (bad input, missing permission, stale state).
 * The message is safe to show to the user directly.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class PermissionDeniedError extends UserFacingError {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export class NotFoundError extends UserFacingError {
  constructor(message = "That could not be found. It may have been deleted.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class CooldownError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "CooldownError";
  }
}

export class ValidationError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
