/**
 * Wikimedia Commons Parser — raw MediaWiki page object → normalized candidate.
 *
 * All fields are extracted from the OFFICIAL imageinfo/extmetadata supplied by
 * the API. Nothing is invented: when a field cannot be derived from source
 * metadata it stays empty and the Validator decides whether that is fatal.
 */

const BaseParser = require('../base/BaseParser');

/** Curated mapping Commons category keywords → genre labels (display only) */
const GENRE_KEYWORDS = [
  [/\bdocumentary\b/i, 'Documentary'],
  [/\banimated|animation|cartoon\b/i, 'Animation'],
  [/\bhorror\b/i, 'Horror'],
  [/\bcomedy\b/i, 'Comedy'],
  [/\bdrama\b/i, 'Drama'],
  [/\bromance\b/i, 'Romance'],
  [/\bwestern\b/i, 'Western'],
  [/\bscience fiction|sci-?fi\b/i, 'Science Fiction'],
  [/\bfilm noir|noir\b/i, 'Film Noir'],
  [/\bwar\b/i, 'War'],
  [/\badventure\b/i, 'Adventure'],
  [/\bfantasy\b/i, 'Fantasy'],
  [/\bthriller|suspense\b/i, 'Thriller'],
  [/\bcrime|mystery\b/i, 'Crime'],
  [/\bmusical|music\b/i, 'Musical'],
  [/\bsilent\b/i, 'Silent'],
  [/\bshort\b/i, 'Short'],
  [/\bserial\b/i, 'Serial'],
  [/\bnewsreel\b/i, 'Newsreel']
];

/** Category patterns like "Videos of films of Egypt" / "...from the United States" */
const COUNTRY_PATTERNS = [
  /videos of films (?:of|from) ([A-Za-z ]+?)$/i,
  /films (?:of|from) ([A-Za-z ]+?)$/i
];

function formatDurationRaw(seconds) {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

class WikimediaParser extends BaseParser {
  /**
   * @param {Object} rawPage - MediaWiki generator result page (formatversion=2)
   * @returns {Object|null} normalized candidate or null (not a usable video)
   */
  parse(rawPage) {
    if (!rawPage || !rawPage.imageinfo || !rawPage.imageinfo[0]) return null;
    const info = rawPage.imageinfo[0];
    const meta = info.extmetadata || {};

    if (!info.mime || !(info.mime.startsWith('video/') || info.mime === 'application/ogg')) return null;
    if (!/\.(webm|ogv|ogg|mp4|dv|mpeg|mpg|avi|mkv)$/i.test(rawPage.title)) return null;
    if (!rawPage.title || !rawPage.title.startsWith('File:')) return null;

    // --- Title -------------------------------------------------------------
    const rawTitle = rawPage.title.replace(/^File:/, '');
    const fileName = rawTitle.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim();
    if (!fileName || fileName.length < 2) return null;

    // --- Year (title first, then DateTimeOriginal, then description) -------
    const year = this._extractYear(fileName, meta);

    // --- Description --------------------------------------------------------
    const description = this.truncate(this.stripHtml(meta.ImageDescription && meta.ImageDescription.value));

    // --- Media & source URLs ------------------------------------------------
    const videoUrl = this.cleanUrl(info.url);
    const sourceUrl = this.cleanUrl(info.descriptionurl);
    const posterUrl = this.cleanUrl(info.thumburl || null);
    if (!videoUrl) return null;

    // --- Duration ------------------------------------------------------------
    const durationSeconds = info.duration != null ? Number(info.duration) : null;
    const durationMinutes = durationSeconds ? Math.round(durationSeconds / 60) : null;
    const durationRaw = durationSeconds ? formatDurationRaw(durationSeconds) : null;

    // --- Credit / attribution inputs ----------------------------------------
    const artist = this.stripHtml(meta.Artist && meta.Artist.value);
    const credit = this.stripHtml(meta.Credit && meta.Credit.value);

    // --- Categories → genres & country --------------------------------------
    const categories = (meta.Categories && meta.Categories.value ? meta.Categories.value.split('|') : [])
      .map(c => c.trim()).filter(Boolean);
    const genres = this._mapGenres(categories, fileName, description);
    const country = this._mapCountry(categories);

    return {
      external_id: `commons-${rawPage.pageid}`,
      title: fileName,
      original_title: rawTitle,
      description,
      year,
      language: null, // never fabricated; set downstream only for silent era
      country,
      duration_seconds: durationSeconds,
      duration_minutes: durationMinutes,
      duration_raw: durationRaw,
      mime: info.mime,
      poster_url: posterUrl,
      video_url: videoUrl,
      embed_url: null, // streamed natively via <video>; see views/public/movie.ejs
      source_url: sourceUrl,
      director: artist || null,
      cast_members: [],
      genres,
      license: {
        shortName: (meta.LicenseShortName && meta.LicenseShortName.value) || '',
        usageTerms: (meta.UsageTerms && meta.UsageTerms.value) || '',
        licenseUrl: (meta.LicenseUrl && meta.LicenseUrl.value) || '',
        attributionRequiredFlag: meta.AttributionRequired ? String(meta.AttributionRequired.value).toLowerCase() : '',
        copyrightedFlag: meta.Copyrighted ? String(meta.Copyrighted.value).toLowerCase() : '',
        licenseCode: (meta.License && meta.License.value) || '',
        artist,
        credit,
        rawExtMetadata: meta
      },
      uploadedTimestamp: info.timestamp || null
    };
  }

  _extractYear(fileName, meta) {
    const now = new Date().getFullYear() + 1;
    const inRange = (y) => y >= 1850 && y <= now;

    let m = fileName.match(/\b(1[89]\d{2}|20[0-2]\d)\b/);
    if (m && inRange(parseInt(m[1], 10))) return parseInt(m[1], 10);

    if (meta.DateTimeOriginal && meta.DateTimeOriginal.value) {
      const y = parseInt(String(meta.DateTimeOriginal.value).substring(0, 4), 10);
      if (inRange(y)) return y;
    }

    if (meta.ImageDescription && meta.ImageDescription.value) {
      const text = this.stripHtml(meta.ImageDescription.value);
      m = text.match(/\b(1[89]\d{2}|20[0-2]\d)\b/);
      if (m && inRange(parseInt(m[1], 10))) return parseInt(m[1], 10);
    }
    return null;
  }

  _mapGenres(categories, fileName, description = '') {
    const haystack = categories.join(' ') + ' ' + fileName + ' ' + (description || '');
    const genres = [];
    for (const [pattern, label] of GENRE_KEYWORDS) {
      if (pattern.test(haystack) && !genres.includes(label)) genres.push(label);
    }
    if (genres.length === 0) genres.push('Classic');
    return genres.slice(0, 6);
  }

  _mapCountry(categories) {
    for (const cat of categories) {
      for (const pattern of COUNTRY_PATTERNS) {
        const m = cat.match(pattern);
        if (m && m[1] && m[1].length < 40) {
          return m[1].replace(/^the\s+/i, '').trim();
        }
      }
    }
    return null;
  }
}

module.exports = WikimediaParser;
