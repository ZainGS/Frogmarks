import { HttpHandler, HttpRequest, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthInterceptor } from './auth.interceptor';

/** The CSRF header (security audit 2026-10-04): the server rejects cookie-authenticated, state-changing API calls
 *  without X-Requested-With, so it must be on every API request — and never on third-party hosts. */
describe('AuthInterceptor CSRF header', () => {
  let sent: HttpRequest<any> | null;
  const next: HttpHandler = { handle: (req) => { sent = req; return of(new HttpResponse({ status: 200 })); } };
  const interceptor = new AuthInterceptor(
    {} as any,
    {} as any,
    { systemConfiguration: { apiUri: 'https://api.example.com/' } } as any,
  );

  function send(url: string, method: 'GET' | 'POST' = 'POST'): HttpRequest<any> {
    sent = null;
    interceptor.intercept(new HttpRequest<any>(method, url, null), next).subscribe();
    return sent!;
  }

  it('adds the header to requests for the configured API origin', () => {
    expect(send('https://api.example.com/api/illustration/1/state').headers.get('X-Requested-With')).toBe('XMLHttpRequest');
  });

  it('adds the header to relative /api requests (dev proxy)', () => {
    expect(send('/api/authoring').headers.get('X-Requested-With')).toBe('XMLHttpRequest');
  });

  it('does not add it to other hosts (blob storage would reject the CORS preflight)', () => {
    expect(send('https://frogmarks.blob.core.windows.net/cels/1.webp', 'GET').headers.has('X-Requested-With')).toBeFalse();
  });
});
