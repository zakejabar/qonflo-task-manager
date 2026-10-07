export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}


export class TaskArchivedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskArchivedError";
  }
}

export class ConcurrentUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrentUpdateError";
  }
}