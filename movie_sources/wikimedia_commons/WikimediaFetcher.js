/**
 * Wikimedia Commons Fetcher — official MediaWiki Action API client.
 *
 * API endpoint   : https://commons.wikimedia.org/w/api.php (free, no API key)
 * Authentication : none required (anonymous read access)
 * Etiquette      : https://www.mediawiki.org/wiki/API:Etiquette
 *                  - serial requests with polite delays (BaseFetcher)
 *                  - `maxlag` set so the API can shed load if busy
 *                  - identifiable User-Agent with contact e-mail
 *
 * Only the official documented Action API is used. Nothing is scraped.
 */

const BaseFetcher = require('../base/BaseFetcher');
const { setSetting } = require('../../db/database');

const API_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

class WikimediaFetcher extends BaseFetcher {
  constructor(options = {}) {
    super({
      baseUrl: API_ENDPOINT,
      rateLimitDelayMs: options.rateLimitDelayMs || 500,
      timeoutMs: options.timeoutMs || 25000,
      maxRetries: 2,
      userAgent:
        options.userAgent ||
        'AkavoxLegalMovieBot/1.0 (legal classic-film archive; +https://akavox.org; contact: legal@akavox.org) MediaWiki-API/1.0'
    });
  }

  buildUrl(params) {
    const url = new URL(API_ENDPOINT);
    // Default params for every request (format 2 gives clean JSON shapes)
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    url.searchParams.set('maxlag', '5');
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  /**
   * Live connectivity proof — real siteinfo ping against the official API.
   */
  async testConnection(transport = null) {
    const url = this.buildUrl({ meta: 'siteinfo', siprop: 'general|statistics' });
    try {
      const data = await this.fetchJson(url, { transport });
      const general = data && data.query && data.query.general;
      const stats = (data && data.query && data.query.statistics) || {};
      return {
        ok: true,
        endpoint: API_ENDPOINT,
        detail: `Connected to ${general ? general.sitename : 'Wikimedia Commons'} (wiki: ${general ? general.wikiversion || general.generator : 'n/a'}), ${stats.images || 0} media files hosted`
      };
    } catch (err) {
      return { ok: false, endpoint: API_ENDPOINT, detail: `Connection failed: ${err.message}` };
    }
  }

  /**
   * Fetch one batch of video-file candidates for a search query.
   * Only official namespace-6 (File:) search with filetype:video.
   */
  async searchVideos({ query, limit = 20, offset = 0 }, transport = null) {
    const url = this.buildUrl({
      generator: 'search',
      gsrnamespace: 6,
      gsrsearch: `filetype:video ${query}`,
      gsrlimit: Math.min(limit, 50),
      gsroffset: offset,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime|size|timestamp|mediatype',
      iiurlwidth: 480
    });
    const data = await this.fetchJson(url, { transport });
    return (data.query && data.query.pages) || [];
  }

  /**
   * Fetch one batch of video-file members of a Commons category.
   * `query` must be a plain category *keyword string* like
   * 'incategory:"Videos of films in the public domain"' — we route it through
   * search so filetype:video filtering still applies.
   */
  async fetchCategoryVideos({ query, limit = 20, offset = 0 }, transport = null) {
    return this.searchVideos({ query, limit, offset }, transport);
  }

  /**
   * Called by BaseImporter: rotates through the configured search queries,
   * remembering a persistent offset per query (kept in settings) so each run
   * crawls NEW material incrementally.
   */
  async fetchBatch({ limit, settings }) {
    const queries = (settings.queries && settings.queries.length ? settings.queries : ['"public domain film"'])
      .map(q => q.trim())
      .filter(Boolean);

    const perQuery = Math.max(3, Math.ceil(limit / queries.length));
    const results = [];
    for (const q of queries) {
      const offset = settings.offsets && settings.offsets[q] ? parseInt(settings.offsets[q], 10) : 0;
      const items = await this.searchVideos({ query: q, limit: perQuery, offset });
      // Advance the incremental cursor for this query
      settings.offsets = settings.offsets || {};
      settings.offsets[q] = offset + items.length;
      results.push(...items);
    }

    // Wrap-around: when every cursor reaches the end, restart from the top so
    // the archive keeps growing with newly uploaded files each cycle.
    if (results.length === 0) {
      settings.offsets = {};
      const q = queries[0];
      const items = await this.searchVideos({ query: q, limit, offset: 0 });
      settings.offsets[q] = items.length;
      results.push(...items);
    }

    return results;
  }
}

module.exports = WikimediaFetcher;
