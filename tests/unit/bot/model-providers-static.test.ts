import { describe, expect, it } from 'vitest';
import { fetchProviderModels, MAX_PROVIDER_MODELS } from '../../../src/bot/model-providers.js';

describe('fetchProviderModels static list', () => {
  it('returns the configured models without any network call', async () => {
    const models = Array.from({ length: MAX_PROVIDER_MODELS + 5 }, (_, i) => `m-${i}`);
    const res = await fetchProviderModels(
      {
        cpa: {
          label: 'CPA',
          baseUrl: 'http://127.0.0.1:1',
          apiKey: 'k',
          wire: 'anthropic',
          models,
        },
      },
      'cpa',
      async () => ({ combos: [], source: 'unavailable' }),
    );
    expect(res.source).toBe('live');
    expect(res.models).toEqual(models.slice(0, MAX_PROVIDER_MODELS));
    expect(res.total).toBe(models.length);
  });
});
