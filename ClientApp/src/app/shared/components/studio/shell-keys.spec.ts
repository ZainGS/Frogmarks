import { shellKeyItems, shellKeySignature } from './shell-keys';

const slots = [
  { id: 'system:illustrator', name: 'Illustrator', type: 'system', systemKey: 'illustrator' },
  { id: 'system:packageDesigner', name: 'Package Designer', type: 'system', systemKey: 'packageDesigner' },
  { id: 'system:settings', name: 'Settings', type: 'system', systemKey: 'settings' },
  { id: 'cart-1', name: 'Snake', type: 'local' },
];

describe('shellKeyItems (Shell keyboard path)', () => {
  it('home: the apps in tile order, Import right after Illustrator, then the carts', () => {
    const items = shellKeyItems({ mode: 'shell', slots, projects: [] });
    expect(items.map(i => i.label)).toEqual(['Illustrator', 'Import a FrogCart…', 'Package Designer', 'Settings', 'Play “Snake”', 'Options for “Snake”']);
    expect(items[0].action).toEqual({ type: 'system', id: 'system:illustrator', systemKey: 'illustrator' });
    expect(items[3].action).toEqual({ type: 'system', id: 'system:settings', systemKey: 'settings' });
    expect(items[4].action).toEqual({ type: 'cart-play', id: 'cart-1' });
    expect(items[5].action).toEqual({ type: 'cart', id: 'cart-1' });
    expect(new Set(items.map(i => i.key)).size).toBe(items.length);   // unique ngFor keys
  });

  it('an engine that cannot launch carts keeps one cart button (its sheet)', () => {
    const items = shellKeyItems({ mode: 'shell', slots, projects: [], canPlay: false });
    expect(items.map(i => i.label).slice(-1)).toEqual(['Cart: Snake']);
    expect(items[items.length - 1].action).toEqual({ type: 'cart', id: 'cart-1' });
  });

  it('project grid: Back, New, then one Open per project (untitled named)', () => {
    const items = shellKeyItems({ mode: 'illustrations', dashboardKind: 'illustration', slots, projects: [{ id: 'a', name: 'Cat' }, { id: 'b' }] });
    expect(items.map(i => i.label)).toEqual(['‹ Back to home', '+ New Project', 'Open “Cat”', 'Open “Untitled”']);
    expect(items[2].action).toEqual({ type: 'project', id: 'a' });
    const pkg = shellKeyItems({ mode: 'illustrations', dashboardKind: 'packaging', slots, projects: [] });
    expect(pkg.map(i => i.label)).toEqual(['‹ Back to home', '+ New Product Packaging']);
  });

  it('no Import button when the engine cannot open the picker from a button (older Salsa)', () => {
    expect(shellKeyItems({ mode: 'shell', slots, projects: [], canImport: false }).some(i => i.action.type === 'import')).toBeFalse();
  });

  it('no slots still offers Import; keys are unique', () => {
    expect(shellKeyItems({ mode: 'shell', slots: [], projects: [] }).map(i => i.key)).toEqual(['import']);
    const keys = shellKeyItems({ mode: 'shell', slots, projects: [] }).map(i => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the signature changes with a rename and not otherwise', () => {
    const a = shellKeyItems({ mode: 'illustrations', slots, projects: [{ id: 'a', name: 'Cat' }] });
    const b = shellKeyItems({ mode: 'illustrations', slots, projects: [{ id: 'a', name: 'Cat' }] });
    const c = shellKeyItems({ mode: 'illustrations', slots, projects: [{ id: 'a', name: 'Dog' }] });
    expect(shellKeySignature(a)).toBe(shellKeySignature(b));
    expect(shellKeySignature(a)).not.toBe(shellKeySignature(c));
  });
});
