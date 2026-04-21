export interface DataResult<T> {
  data: T | null
  error: Error | null
}

export interface SuccessResult {
  error: Error | null
}

