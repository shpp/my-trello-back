export class CustomError extends Error {
  statusCode: number;

  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = this.constructor.name;
    // Error.captureStackTrace(this, this.constructor);
    this.statusCode = status;
    this.data = data;
  }
}
