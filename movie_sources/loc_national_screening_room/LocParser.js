const BaseParser = require('../base/BaseParser');

function first(arr) {
  if (Array.isArray(arr) && arr.length) return arr[0];
  return arr || null;
}

function flattenText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenText).join(' ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

class LocParser extends BaseParser {
  parse(raw) {
    if (!raw || raw.access_restricted === true) return null;
    const nested = raw.item || {};
    const title = (raw.title || nested.title || '').trim();
    if (!title || title.length < 2) return null;

    const resources = Array.isArray(raw.resources) ? raw.resources : [];
    const videoRes = resources.find((r) => r && r.video) || resources[0] || {};
    const videoUrl = this._https(this.cleanUrl(videoRes.video || null));
    if (!videoUrl) return null;

    const year = this._year(raw.date || nested.date || first(raw.dates));
    const durationSeconds = videoRes.duration != null ? Number(videoRes.duration) : null;
    const langs = raw.language || nested.language || [];
    const language = Array.isArray(langs) ? langs[0] : langs;
    const genres = this._genres(raw.subject || nested.genre || nested.subjects || []);
    const contributors = raw.contributor || nested.contributors || [];
    const director = this._director(contributors);
    const description = this.truncate(flattenText(raw.description || nested.summary || nested.description));
    const sourceUrl = this._https(this.cleanUrl(raw.url || raw.id));
    const lccn = raw.number_lccn ? first(raw.number_lccn) : (sourceUrl || title);
    const rightsBlob = [
      flattenText(raw.rights),
      flattenText(nested.rights),
      flattenText(raw.restriction),
      flattenText(nested.notes),
      flattenText(raw.notes),
      flattenText(contributors)
    ].join(' ');

    return {
      external_id: 'loc-' + String(lccn).replace(/[^\w.-]+/g, ''),
      title,
      original_title: title,
      description,
      year,
      language: language ? String(language) : null,
      country: this._country(raw, nested),
      duration_seconds: durationSeconds,
      duration_minutes: durationSeconds ? Math.round(durationSeconds / 60) : null,
      duration_raw: durationSeconds ? `${Math.round(durationSeconds)}s` : null,
      poster_url: this._https(this.cleanUrl(videoRes.poster || videoRes.image || first(raw.image_url))),
      video_url: videoUrl,
      embed_url: this._https(this.cleanUrl(videoRes.url || sourceUrl)),
      source_url: sourceUrl,
      director,
      cast_members: [],
      genres,
      license: {
        accessRestricted: !!raw.access_restricted,
        rightsText: rightsBlob,
        shortName: '',
        contributors: flattenText(contributors),
        notes: flattenText(nested.notes || raw.notes),
        partof: flattenText(raw.partof),
        createdPublished: flattenText(nested.created_published)
      }
    };
  }

  _year(value) {
    const m = String(value || '').match(/\b(18\d{2}|19\d{2}|20[0-2]\d)\b/);
    if (!m) return null;
    const y = parseInt(m[1], 10);
    return y >= 1850 && y <= new Date().getFullYear() + 1 ? y : null;
  }

  _genres(list) {
    const arr = Array.isArray(list) ? list : [list];
    const out = [];
    for (const g of arr) {
      const s = String(g || '').replace(/\(.*?\)/g, '').trim();
      if (s && !out.includes(s)) out.push(s);
    }
    if (!out.length) out.push('Classic');
    return out.slice(0, 6);
  }

  _director(contributors) {
    const arr = Array.isArray(contributors) ? contributors : [contributors];
    for (const c of arr) {
      const s = String(c || '');
      if (/director|production|camera/i.test(s)) return s.split(',')[0].trim();
    }
    return arr[0] ? String(arr[0]).split(',')[0].trim() : null;
  }

  _https(url) {
    if (!url) return url;
    return String(url).replace(/^http:\/\//i, 'https://');
  }

  _country(raw, nested) {
    const hay = flattenText(nested.created_published || raw.location || '');
    if (/united states|u\.s\./i.test(hay)) return 'United States';
    return null;
  }
}

module.exports = LocParser;
