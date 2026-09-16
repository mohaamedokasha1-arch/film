/**
 * BaseFetcher — shared HTTP foundation for all movie source fetchers.
 *
 * Implements the etiquette required by open APIs (Wikimedia API Usage
 * Guidelines, Internet Archive ToS, etc.):
 *  - identifiable User-Agent with contact information
 *  - polite rate limiting between sequential requests
 *  - request timeouts
 *  - retry with exponential backoff, honoring Retry-After
 */

class BaseFetcher {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl;
    this.userAgent =
      options.userAgent ||
      'AkavoxLegalMovieCrawler/1.0 (+https://akavox.org; contact: legal@akavox.org)';
    this.rateLimitDelayMs = options.rateLimitDelayMs || 500;
    this.timeoutMs = options.timeoutMs || 20000;
    this.maxRetries = options.maxRetries != null ? options.maxRetries : 2;
    this._lastRequestAt = 0;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Enforce a minimum spacing between outgoing requests (politeness policy).
   */
  async respectRateLimit() {
    const elapsed = Date.now() - this._lastRequestAt;
    if (elapsed < this.rateLimitDelayMs) {
      await this.sleep(this.rateLimitDelayMs - elapsed);
    }
    this._lastRequestAt = Date.now();
  }

  /**
   * GET a URL and parse the body as JSON, with timeout + retries.
   * `transport` injection is available for offline tests ONLY (never set at runtime).
   */
  async fetchJson(url, { attempt = 0, transport = null } = {}) {
    await this.respectRateLimit();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const doFetch = transport || fetch;
      const response = await doFetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json'
        }
      });

      if (response.status === 429 || response.status === 503) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
        const waitMs = (retryAfter > 0 ? retryAfter : 2 ** (attempt + 1)) * 1000;
        if (attempt < this.maxRetries) {
          await this.sleep(waitMs);
          return this.fetchJson(url, { attempt: attempt + 1, transport });
        }
        throw new Error(`Source responded ${response.status} after ${attempt + 1} attempts`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }

      return await response.json();
    } catch (err) {
      if (attempt < this.maxRetries && (err.name === 'AbortError' || err.name === 'TypeError')) {
        await this.sleep(2 ** (attempt + 1) * 1000);
        return this.fetchJson(url, { attempt: attempt + 1, transport });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Overridden by concrete fetchers to prove live connectivity
   * (e.g. a siteinfo ping or a cheap authenticated endpoint).
   * @returns {Promise<{ok: boolean, detail: string, endpoint: string}>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by the concrete fetcher');
  }
}

module.exports = BaseFetcher;
