const BaseFetcher = require('../base/BaseFetcher');
const { setSetting } = require('../../db/database');

const COLLECTION_BASE = 'https://www.loc.gov/collections/';

class LocFetcher extends BaseFetcher {
  constructor(options = {}) {
    super({
      baseUrl: 'https://www.loc.gov',
      rateLimitDelayMs: options.rateLimitDelayMs || 700,
      timeoutMs: options.timeoutMs || 25000,
      maxRetries: 2,
      userAgent:
        options.userAgent ||
        'AkavoxLegalMovieBot/1.0 (legal public-domain cinema; +https://akavox.org; contact: legal@akavox.org)'
    });
  }

  collectionUrl(slug, { count = 10, page = 1 } = {}) {
    const url = new URL(COLLECTION_BASE + slug.replace(/^\/|\/$/g, '') + '/');
    url.searchParams.set('fo', 'json');
    url.searchParams.set('c', String(Math.min(count, 40)));
    url.searchParams.set('sp', String(Math.max(1, page)));
    url.searchParams.set('fa', 'access-restricted:false');
    return url.toString();
  }

  async testConnection(transport = null) {
    const url = this.collectionUrl('national-screening-room', { count: 1, page: 1 });
    try {
      const data = await this.fetchJson(url, { transport });
      const n = data && data.content && Array.isArray(data.content.results) ? data.content.results.length : 0;
      return {
        ok: true,
        endpoint: url,
        detail: `Connected to Library of Congress JSON API (National Screening Room). Sample page returned ${n} catalog result(s).`
      };
    } catch (err) {
      return { ok: false, endpoint: url, detail: `Connection failed: ${err.message}` };
    }
  }

  async fetchBatch({ limit, settings }) {
    const collections = (settings.collections && settings.collections.length
      ? settings.collections
      : ['national-screening-room']
    ).map((s) => String(s).trim()).filter(Boolean);

    const page = Math.max(1, parseInt(settings.page, 10) || 1);
    const per = Math.max(3, Math.ceil((limit || 8) / collections.length));
    const results = [];

    for (const slug of collections) {
      const url = this.collectionUrl(slug, { count: per, page });
      const data = await this.fetchJson(url);
      const items = (data && data.content && data.content.results) || [];
      results.push(...items);
    }

    const nextPage = results.length > 0 ? page + 1 : 1;
    try {
      await setSetting('loc_page', nextPage, 'int');
    } catch (e) { /* settings persist is best-effort */ }

    return results;
  }
}

module.exports = LocFetcher;
