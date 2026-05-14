export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function toErrorResponse(error: unknown): { status: number; body: { error: string; message: string } } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: error.code,
        message: error.message,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "internal_error",
      message: "Something went wrong",
    },
  };
}
