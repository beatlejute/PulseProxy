import { setMark, getMark, clearMark, clearMarkIfNotMatching } from '../../src/background/geo-block-marks';

describe('geo-block-marks', () => {
  // Clear marks before each test to ensure isolation
  beforeEach(() => {
    // Clear all marks by creating fresh instances
    const tabIds = [1, 2, 3, 4, 5];
    tabIds.forEach((id) => {
      clearMark(id);
    });
  });

  it('should set and then read a mark', () => {
    const tabId = 1;
    const requestId = 'req-123';
    const host = 'example.com';

    setMark(tabId, requestId, host);
    const mark = getMark(tabId);

    expect(mark).toBeDefined();
    expect(mark?.requestId).toBe(requestId);
    expect(mark?.host).toBe(host);
  });

  it('should preserve mark when response has same requestId', () => {
    const tabId = 1;
    const requestId = 'req-123';
    const host = 'example.com';

    setMark(tabId, requestId, host);
    clearMarkIfNotMatching(tabId, requestId);
    const mark = getMark(tabId);

    expect(mark).toBeDefined();
    expect(mark?.requestId).toBe(requestId);
  });

  it('should clear mark when response has different requestId', () => {
    const tabId = 1;
    const initialRequestId = 'req-123';
    const newRequestId = 'req-456';
    const host = 'example.com';

    setMark(tabId, initialRequestId, host);
    clearMarkIfNotMatching(tabId, newRequestId);
    const mark = getMark(tabId);

    expect(mark).toBeUndefined();
  });

  it('should clear mark when tab is closed', () => {
    const tabId = 1;
    const requestId = 'req-123';
    const host = 'example.com';

    setMark(tabId, requestId, host);
    clearMark(tabId);
    const mark = getMark(tabId);

    expect(mark).toBeUndefined();
  });

  it('should not mix marks between two tabs', () => {
    const tabId1 = 1;
    const tabId2 = 2;
    const requestId1 = 'req-123';
    const requestId2 = 'req-456';
    const host1 = 'example.com';
    const host2 = 'other.com';

    setMark(tabId1, requestId1, host1);
    setMark(tabId2, requestId2, host2);

    const mark1 = getMark(tabId1);
    const mark2 = getMark(tabId2);

    expect(mark1?.requestId).toBe(requestId1);
    expect(mark1?.host).toBe(host1);
    expect(mark2?.requestId).toBe(requestId2);
    expect(mark2?.host).toBe(host2);
  });

  it('should return undefined for non-existent tab', () => {
    const mark = getMark(999);
    expect(mark).toBeUndefined();
  });

  it('should handle multiple setMark calls on same tab (overwrite)', () => {
    const tabId = 1;
    const requestId1 = 'req-123';
    const requestId2 = 'req-456';
    const host1 = 'example.com';
    const host2 = 'other.com';

    setMark(tabId, requestId1, host1);
    setMark(tabId, requestId2, host2);
    const mark = getMark(tabId);

    expect(mark?.requestId).toBe(requestId2);
    expect(mark?.host).toBe(host2);
  });
});
