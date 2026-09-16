/**
 * Data Cleaner & Normalizer for AKAVOX
 * Sanitizes and structures raw metadata from external sources.
 */

class DataCleaner {
  /**
   * Cleans HTML tags and decodes common HTML entities
   */
  static cleanText(text) {
    if (!text) return '';
    if (typeof text !== 'string') text = String(text);

    return text
      .replace(/<[^>]*>/g, ' ') // Strip HTML tags
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\r\n|\r|\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Normalizes movie title by removing upload suffixes, file extensions, and extra punctuation
   */
  static normalizeTitle(title) {
    if (!title) return 'Untitled Classic';
    let clean = DataCleaner.cleanText(title);

    // Remove file extensions (.mp4, .avi, etc.)
    clean = clean.replace(/\.(mp4|avi|mkv|ogv|mov|mpeg)$/i, '');

    // Remove typical archive noise like "[Full Movie]", "(1080p)", "CUKESIM's"
    clean = clean.replace(/\[\s*(full movie|public domain|classic|hd|remastered)\s*\]/gi, '');
    clean = clean.replace(/\(\s*(full movie|public domain|classic|hd|remastered)\s*\)/gi, '');
    clean = clean.replace(/\s*-\s*(19\d\d|20\d\d)\s*$/, ''); // trailing year if duplicate

    // Trim whitespace and leading/trailing dashes
    clean = clean.replace(/^[\s\-_.:]+|[\s\-_.:]+$/g, '').trim();

    return clean || 'Untitled Classic';
  }

  /**
   * Normalizes year into a 4-digit integer
   */
  static normalizeYear(rawDate, rawYear) {
    const candidate = String(rawYear || rawDate || '');
    const match = candidate.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Parses runtime duration into total integer minutes
   * Supports: "1:24:30", "84 min", "4646.42" (seconds), "45"
   */
  static normalizeDuration(rawRuntime, files = []) {
    if (!rawRuntime && files && files.length > 0) {
      // Try to find length in video files metadata
      const videoFile = files.find(f => (f.format === 'h.264' || f.name?.endsWith('.mp4')) && f.length);
      if (videoFile && videoFile.length) {
        rawRuntime = videoFile.length;
      }
    }

    if (!rawRuntime) return { minutes: null, raw: null };

    const str = String(rawRuntime).trim();

    // Check HH:MM:SS or MM:SS
    if (str.includes(':')) {
      const parts = str.split(':').map(p => parseFloat(p) || 0);
      if (parts.length === 3) {
        const totalMinutes = Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
        return { minutes: totalMinutes, raw: str };
      } else if (parts.length === 2) {
        const totalMinutes = Math.round(parts[0] + parts[1] / 60);
        return { minutes: totalMinutes, raw: str };
      }
    }

    // Check if numeric seconds (e.g. 4646.42)
    const num = parseFloat(str);
    if (!isNaN(num)) {
      if (num > 300) {
        // Assume seconds
        return { minutes: Math.round(num / 60), raw: `${Math.round(num / 60)} min` };
      }
      return { minutes: Math.round(num), raw: `${Math.round(num)} min` };
    }

    return { minutes: null, raw: str };
  }

  /**
   * Extracts and standardizes genres from subjects and collections
   */
  static normalizeGenres(subjects, collections = []) {
    const rawList = [];

    // Helper to add
    const addTokens = (item) => {
      if (!item) return;
      if (Array.isArray(item)) {
        item.forEach(addTokens);
      } else if (typeof item === 'string') {
        item.split(/[;,/|]+/).forEach(s => rawList.push(s.trim()));
      }
    };

    addTokens(subjects);
    addTokens(collections);

    // Standard genres dictionary map
    const genreMap = {
      'comedy': 'Comedy',
      'comedies': 'Comedy',
      'silent': 'Silent',
      'silent film': 'Silent',
      'silent films': 'Silent',
      'drama': 'Drama',
      'horror': 'Horror',
      'scifi': 'Sci-Fi',
      'sci-fi': 'Sci-Fi',
      'science fiction': 'Sci-Fi',
      'mystery': 'Mystery',
      'thriller': 'Thriller',
      'western': 'Western',
      'action': 'Action',
      'adventure': 'Adventure',
      'romance': 'Romance',
      'romantic': 'Romance',
      'crime': 'Crime',
      'gangster': 'Crime',
      'film noir': 'Film Noir',
      'noir': 'Film Noir',
      'animation': 'Animation',
      'cartoon': 'Animation',
      'cartoons': 'Animation',
      'documentary': 'Documentary',
      'fantasy': 'Fantasy',
      'war': 'War',
      'musical': 'Musical',
      'family': 'Family',
      'classic': 'Classic'
    };

    const recognized = new Set();
    for (const raw of rawList) {
      const lower = raw.toLowerCase().trim();
      for (const [key, val] of Object.entries(genreMap)) {
        if (lower.includes(key)) {
          recognized.add(val);
        }
      }
    }

    // If none recognized, default to Classic Cinema
    if (recognized.size === 0) {
      recognized.add('Classic');
    }

    return Array.from(recognized).slice(0, 4);
  }

  /**
   * Extracts and standardizes director name
   */
  static normalizeDirector(director, creator) {
    let candidate = director || creator || 'Unknown Director';
    if (Array.isArray(candidate)) {
      candidate = candidate[0];
    }
    candidate = DataCleaner.cleanText(String(candidate));
    // If it looks like an email or uploader handle, normalize
    if (candidate.includes('@') || candidate.toLowerCase().includes('archive.org')) {
      return 'Classic Filmmaker';
    }
    return candidate || 'Unknown Director';
  }

  /**
   * Standardizes cast list into clean string array
   */
  static normalizeCast(rawCast, description = '') {
    if (Array.isArray(rawCast)) {
      return rawCast.map(c => DataCleaner.cleanText(String(c))).filter(Boolean).slice(0, 8);
    }
    if (typeof rawCast === 'string' && rawCast.trim()) {
      return rawCast.split(/[,;\n]+/).map(c => DataCleaner.cleanText(c)).filter(Boolean).slice(0, 8);
    }

    // Attempt to extract "Starring: Name1, Name2" from description
    const starMatch = description.match(/(?:starring|with|cast)[\s:]+([^\n.]+)/i);
    if (starMatch && starMatch[1]) {
      const extracted = starMatch[1].split(/,|and/).map(s => DataCleaner.cleanText(s)).filter(s => s.length > 2 && s.length < 35);
      if (extracted.length > 0) return extracted.slice(0, 6);
    }

    return [];
  }

  /**
   * Generates SEO URL Slug from title and year
   * e.g., "The Phantom of the Opera", 1925 -> "the-phantom-of-the-opera-1925"
   */
  static generateSlug(title, year) {
    const base = `${title || 'movie'} ${year || ''}`
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return base || `classic-film-${Date.now()}`;
  }
}

module.exports = DataCleaner;
