import { clearPendingProjectImport, setPendingProjectImport, takePendingProjectImport } from './pending-project-import';

describe('pending .frogmarks import hand-off (Shell Import → editor)', () => {
  afterEach(() => clearPendingProjectImport());
  const file = new Blob(['zip']);

  it('hands the file to the editor that opens that document — once', () => {
    setPendingProjectImport({ uuid: 'NEW', file, editorState: null }, 1000);
    expect(takePendingProjectImport('NEW', 1100)?.file).toBe(file);
    expect(takePendingProjectImport('NEW', 1200)).toBeNull();   // a reload / second open loads what was saved
  });

  it('never goes to another document, and stays for the right one', () => {
    setPendingProjectImport({ uuid: 'NEW', file, editorState: null }, 1000);
    expect(takePendingProjectImport('OTHER', 1100)).toBeNull();
    expect(takePendingProjectImport(undefined, 1100)).toBeNull();
    expect(takePendingProjectImport('NEW', 1100)?.uuid).toBe('NEW');
  });

  it('expires (the navigation never happened)', () => {
    setPendingProjectImport({ uuid: 'NEW', file, editorState: null }, 1000);
    expect(takePendingProjectImport('NEW', 1000 + 5 * 60_000 + 1)).toBeNull();
    setPendingProjectImport({ uuid: 'NEW', file, editorState: null }, 5000);
    expect(takePendingProjectImport('NEW', 4000)).toBeNull();   // clock went backwards
  });
});
