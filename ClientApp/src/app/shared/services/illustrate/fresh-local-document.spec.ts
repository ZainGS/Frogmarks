import { clearFreshLocalDocument, markFreshLocalDocument, takeFreshLocalDocument } from './fresh-local-document';
import type { LocalIllustration } from './local-illustration.service';

const rec = (uuid: string): LocalIllustration => ({ uuid, name: 'Untitled', syncMode: 2, type: 'illustration' } as unknown as LocalIllustration);

describe('fresh local document hand-off (Shell New Project → editor)', () => {
  afterEach(() => clearFreshLocalDocument());

  it('hands the just-created record to the editor that opens it — once', () => {
    const r = rec('NEW');
    markFreshLocalDocument(r, 1000);
    expect(takeFreshLocalDocument('NEW', 1200)).toBe(r);
    expect(takeFreshLocalDocument('NEW', 1300)).toBeNull();   // a second load of the same document reads the store
  });

  it('never matches another document, and leaves the mark for the right one', () => {
    markFreshLocalDocument(rec('NEW'), 1000);
    expect(takeFreshLocalDocument('OTHER', 1100)).toBeNull();
    expect(takeFreshLocalDocument(null, 1100)).toBeNull();
    expect(takeFreshLocalDocument('NEW', 1200)?.uuid).toBe('NEW');
  });

  it('expires: a document opened long after it was created is loaded normally', () => {
    markFreshLocalDocument(rec('NEW'), 1000);
    expect(takeFreshLocalDocument('NEW', 1000 + 30_001)).toBeNull();
    expect(takeFreshLocalDocument('NEW', 1100)).toBeNull();   // and the stale mark is gone
  });

  it('a clock that went backwards does not make a stale mark look fresh', () => {
    markFreshLocalDocument(rec('NEW'), 5000);
    expect(takeFreshLocalDocument('NEW', 4000)).toBeNull();
  });

  it('only the latest created document is pending; nothing is pending by default (e.g. after a page reload)', () => {
    expect(takeFreshLocalDocument('NEW')).toBeNull();
    markFreshLocalDocument(rec('A'), 1000);
    markFreshLocalDocument(rec('B'), 1001);
    expect(takeFreshLocalDocument('A', 1002)).toBeNull();
    expect(takeFreshLocalDocument('B', 1002)?.uuid).toBe('B');
  });
});
