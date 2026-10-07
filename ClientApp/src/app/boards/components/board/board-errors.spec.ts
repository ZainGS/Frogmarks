import { ResultType } from '../../../shared/models/error-result.model';
import { BoardSaveStatus, boardLoadErrorFromHttp, boardLoadErrorFromResult, isBoardSaveRejected } from './board-errors';

/** UI review 2026-10-07 §2d: a board stayed on "Loading your board…" forever when the server failed, and saves failed
 *  silently. */
describe('board load errors', () => {
  it('server unreachable (status 0) and timeouts can be retried', () => {
    expect(boardLoadErrorFromHttp({ status: 0 }).retryable).toBeTrue();
    expect(boardLoadErrorFromHttp({ status: 0 }).message).toMatch(/reach the server/);
    const timeout = boardLoadErrorFromHttp({ name: 'TimeoutError' });
    expect(timeout.retryable).toBeTrue();
    expect(timeout.message).toMatch(/too long/);
  });

  it('a missing board offers Back only; a server error shows its code', () => {
    expect(boardLoadErrorFromHttp({ status: 404 }).retryable).toBeFalse();
    expect(boardLoadErrorFromResult(ResultType.NotFound).retryable).toBeFalse();
    expect(boardLoadErrorFromHttp({ status: 500 }).message).toContain('500');
    expect(boardLoadErrorFromHttp({ status: 401 }).message).toMatch(/access/);
    expect(boardLoadErrorFromResult(ResultType.Unauthorized).message).toMatch(/access/);
  });

  it('anything else thrown still produces a message', () => {
    expect(boardLoadErrorFromHttp(new Error('x')).message.length).toBeGreaterThan(0);
    expect(boardLoadErrorFromResult(undefined).retryable).toBeTrue();
  });
});

describe('board save status', () => {
  it('a rejected ErrorResultModel counts as a failed save; plain / empty answers do not', () => {
    expect(isBoardSaveRejected({ resultType: ResultType.Failure })).toBeTrue();
    expect(isBoardSaveRejected({ resultType: ResultType.Success })).toBeFalse();
    expect(isBoardSaveRejected(null)).toBeFalse();
    expect(isBoardSaveRejected({ ok: true })).toBeFalse();
  });

  it('tells the user once per failure streak and clears on the next good save', () => {
    const s = new BoardSaveStatus();
    expect(s.record(true)).toBeFalse();
    expect(s.record(false)).toBeTrue();    // first failure: tell
    expect(s.record(false)).toBeFalse();   // still failing: no second toast
    expect(s.failed).toBeTrue();
    expect(s.record(true)).toBeFalse();
    expect(s.failed).toBeFalse();
    expect(s.record(false)).toBeTrue();    // a new streak: tell again
  });
});
