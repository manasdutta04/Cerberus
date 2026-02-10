export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export class IntegrationError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, options?: { code?: string; retryable?: boolean }) {
    super(message);
    this.name = "IntegrationError";
    this.code = options?.code ?? "integration_error";
    this.retryable = options?.retryable ?? false;
  }
}
