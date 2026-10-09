import { PlayerCartService } from './player-cart.service';

describe('PlayerCartService (Shell / dashboard → Player hand-off)', () => {
  it('hands a cart over once, remembering whether it came from the Shell launch', () => {
    const s = new PlayerCartService();
    const cart = new Blob(['x']);
    s.handOff(cart, true);
    expect(s.take()).toEqual({ cart, fromShell: true });
    expect(s.take()).toEqual({ cart: null, fromShell: false });
  });

  it('the dashboard path (pendingCart set directly) is not "from the Shell"', () => {
    const s = new PlayerCartService();
    const cart = new Blob(['x']);
    s.pendingCart = cart;
    expect(s.take()).toEqual({ cart, fromShell: false });
  });

  it('the return-to-Shell flag is one-shot', () => {
    const s = new PlayerCartService();
    expect(s.takeReturningToShell()).toBeFalse();
    s.returningToShell = true;
    expect(s.takeReturningToShell()).toBeTrue();
    expect(s.takeReturningToShell()).toBeFalse();
  });
});
