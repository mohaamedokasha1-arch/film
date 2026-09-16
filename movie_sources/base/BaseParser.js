/**
 * BaseParser — contract for turning raw source payloads into normalized
 * movie candidate records. Every parser must produce the same canonical shape
 * so downstream license/validator/dedupe stages are source-agnostic.
 *
 * Canonical candidate record:
 * {
 *   external_id, title, original_title, description, year,
 *   language, country, duration_minutes, duration_raw,
 *   poster_url, video_url, embed_url, source_url,
 *   director, cast_members[], genres[],
 *   license: { shortName, licenseUrl, usageTerms, attributionRequiredFlag,
 *              artist, credit, copyrightedFlag, rawExtMetadata }
 * }
 */

class BaseParser {
  /** Human-readable name of the parser */
  get name() {
    return this.constructor.name;
  }

  /**
   * Parse a raw item from the fetcher into a candidate record.
   * @returns {Object|null} candidate record or null when item is not usable
   */
  // eslint-disable-next-line no-unused-vars
  parse(rawItem) {
    throw new Error('parse() must be implemented by the concrete parser');
  }

  /* ---------------- shared text utilities ---------------- */

  stripHtml(html) {
    if (!html) return '';
    return String(html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  truncate(text, max = 2000) {
    if (!text) return text;
    return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
  }

  /** Remove tracking params (utm_*) appended by proxies/tools — keep the clean URL */
  cleanUrl(url) {
    if (!url) return url;
    try {
      const u = new URL(url);
      [...u.searchParams.keys()].forEach((k) => {
        if (k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k);
      });
      const qs = u.searchParams.toString();
      return `${u.origin}${u.pathname}${qs ? '?' + qs : ''}`;
    } catch (e) {
      return url;
    }
  }
}

module.exports = BaseParser;
