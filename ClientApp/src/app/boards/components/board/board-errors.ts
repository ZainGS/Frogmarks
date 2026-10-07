import { ResultType } from '../../../shared/models/error-result.model';

/** What the board shows instead of "Loading your board…" when the board can't be opened. */
export interface BoardLoadError {
  /** One plain sentence for the user. */
  message: string;
  /** Retry can help (network / server trouble). False for a board that doesn't exist or isn't yours. */
  retryable: boolean;
}

/** How long a board request may take before the board stops waiting and offers Retry (a server that accepts the
 *  connection but never answers used to leave "Loading your board…" up forever). */
export const BOARD_LOAD_TIMEOUT_MS = 30_000;

const NOT_FOUND: BoardLoadError = { message: "This board doesn't exist any more, or the link is wrong.", retryable: false };
const NO_ACCESS: BoardLoadError = { message: "You don't have access to this board. Sign in with the account that owns it.", retryable: true };

/** The API answered, but not with a board (its ErrorResultModel.resultType). */
export function boardLoadErrorFromResult(resultType: ResultType | undefined | null): BoardLoadError {
  switch (resultType) {
    case ResultType.NotFound: return NOT_FOUND;
    case ResultType.Unauthorized: return NO_ACCESS;
    default: return { message: "The server couldn't open this board.", retryable: true };
  }
}

/** The request itself failed (HttpErrorResponse, rxjs TimeoutError, anything thrown while applying the board). */
export function boardLoadErrorFromHttp(err: any): BoardLoadError {
  if (err?.name === 'TimeoutError') {
    return { message: 'The server is taking too long to answer.', retryable: true };
  }
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status === 0) return { message: "Couldn't reach the server. Check your connection, then try again.", retryable: true };
  if (status === 401 || status === 403) return NO_ACCESS;
  if (status === 404) return NOT_FOUND;
  if (status !== undefined) return { message: `The server couldn't open this board (error ${status}).`, retryable: true };
  return { message: "This board couldn't be opened.", retryable: true };
}

/** A save request that came back but didn't save (the API answers with an ErrorResultModel on some failures). */
export function isBoardSaveRejected(res: any): boolean {
  return !!res && typeof res === 'object' && typeof res.resultType === 'number' && res.resultType !== ResultType.Success;
}

/**
 * Save status of an open board: "a save failed" is remembered until one succeeds, and the user is told ONCE per
 * failure streak (the autosave retries every change; a toast per attempt would stack).
 */
export class BoardSaveStatus {
  failed = false;

  /** Record one save attempt. Returns true when this is the first failure of a streak (tell the user now). */
  record(ok: boolean): boolean {
    const wasFailed = this.failed;
    this.failed = !ok;
    return !ok && !wasFailed;
  }

  reset(): void { this.failed = false; }
}
