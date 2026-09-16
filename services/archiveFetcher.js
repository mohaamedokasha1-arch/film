/**
 * Internet Archive Official Fetcher
 * Connects to Internet Archive Advanced Search and Metadata APIs
 * with rate limiting, timeouts, and error resilience.
 */

class ArchiveFetcher {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://archive.org';
    this.rateLimitDelayMs = options.rateLimitDelayMs || 400; // Respectful delay between requests
    this.timeoutMs = options.timeoutMs || 15000;
  }

  /**
   * Helper sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch with timeout
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Akavox-LegalMovieCrawler/1.0 (+https://akavox.org; contact: legal@akavox.org)',
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });
      clearTimeout(timeout);
      return response;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Searches Internet Archive for films matching criteria
   * @param {Object} queryOptions 
   * @returns {Promise<Array>} List of basic item records
   */
  async searchMovies({ collections = ['feature_films', 'silent_films', 'Comedy_Films', 'classic_tv'], rows = 15, page = 1, sort = 'downloads desc' } = {}) {
    const collQuery = collections.map(c => `collection:(${c})`).join(' OR ');
    const fullQuery = `mediatype:(movies) AND (${collQuery})`;
    const start = (page - 1) * rows;

    const fields = [
      'identifier',
      'title',
      'year',
      'date',
      'creator',
      'director',
      'description',
      'licenseurl',
      'rights',
      'subject',
      'mediatype',
      'collection'
    ];

    const params = new URLSearchParams({
      q: fullQuery,
      rows: String(rows),
      start: String(start),
      output: 'json'
    });

    fields.forEach(f => params.append('fl[]', f));
    params.append('sort[]', sort);

    const searchUrl = `${this.baseUrl}/advancedsearch.php?${params.toString()}`;
    console.log(`[ArchiveFetcher] Querying Internet Archive: rows=${rows}, page=${page}`);

    const res = await this.fetchWithTimeout(searchUrl);
    if (!res.ok) {
      throw new Error(`Internet Archive Search API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.response || !data.response.docs) {
      return [];
    }

    return data.response.docs;
  }

  /**
   * Fetches comprehensive metadata for a specific item identifier
   * @param {string} identifier - Archive identifier (e.g., 'charlie_chaplin_film_fest')
   * @returns {Promise<Object>} Full metadata object
   */
  async getItemMetadata(identifier) {
    await this.sleep(this.rateLimitDelayMs); // Rate limit spacing

    const url = `${this.baseUrl}/metadata/${encodeURIComponent(identifier)}`;
    const res = await this.fetchWithTimeout(url);

    if (!res.ok) {
      throw new Error(`Failed to fetch metadata for ${identifier}: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    return {
      metadata: json.metadata || {},
      files: json.files || [],
      server: json.server || '',
      dir: json.dir || ''
    };
  }
}

module.exports = ArchiveFetcher;
