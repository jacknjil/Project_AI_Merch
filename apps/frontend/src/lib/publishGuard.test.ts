import { describe, it, expect } from 'vitest';
import { shouldPublishToChannel } from './publishGuard';

describe('shouldPublishToChannel', () => {
  it('blocks when the asset is not approved', () => {
    const result = shouldPublishToChannel({ approvedForPublish: false }, 'true');

    expect(result).toEqual({ publish: false, reason: 'asset-not-approved' });
  });

  it('blocks when approvedForPublish is missing', () => {
    const result = shouldPublishToChannel({}, 'true');

    expect(result).toEqual({ publish: false, reason: 'asset-not-approved' });
  });

  it('blocks an approved asset when the master switch is unset', () => {
    const result = shouldPublishToChannel({ approvedForPublish: true }, undefined);

    expect(result).toEqual({ publish: false, reason: 'publishing-disabled' });
  });

  it('blocks an approved asset when the master switch is not exactly "true"', () => {
    expect(shouldPublishToChannel({ approvedForPublish: true }, 'false').publish).toBe(false);
    expect(shouldPublishToChannel({ approvedForPublish: true }, '1').publish).toBe(false);
    expect(shouldPublishToChannel({ approvedForPublish: true }, '').publish).toBe(false);
  });

  it('allows publishing only when approved and the master switch is "true"', () => {
    const result = shouldPublishToChannel({ approvedForPublish: true }, 'true');

    expect(result).toEqual({ publish: true });
  });

  it('treats a non-boolean approvedForPublish as not approved', () => {
    const result = shouldPublishToChannel({ approvedForPublish: 'yes' as unknown as boolean }, 'true');

    expect(result).toEqual({ publish: false, reason: 'asset-not-approved' });
  });
});
