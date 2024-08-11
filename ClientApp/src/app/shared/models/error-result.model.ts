export interface ErrorResultModel<T> {
  resultType: ResultType;
  fieldName: string;
  extendedMessage: string;
  resultObject: T;
}

export enum ResultType {
  Success,
  Failure,
  NotFound,
  AlreadyExist,
  Unauthorized,
  BadRequest
}
