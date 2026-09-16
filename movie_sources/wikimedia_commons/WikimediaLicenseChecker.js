/**
 * Wikimedia Commons License Checker — STRICT per-item legal verification.
 *
 * Legal basis (verified 2026-09, see docs/SOURCE_VALIDATION_wikimedia_commons.md):
 *  - Commons ONLY hosts public-domain or freely licensed files; licenses that
 *    forbid commercial use (NC) or derivatives (ND) are BANNED on Commons.
 *  - Nevertheless we do NOT trust the platform blanket rule: every single file
 *    is verified individually via its extmetadata license fields, and anything
 *    ambiguous is REJECTED.
 *
 * ACCEPT (commercial/ad-compatible only):
 *   Public Domain (all variants), CC0, CC BY 1.0–4.0, CC BY-SA 1.0–4.0
 * REJECT (fail-closed):
 *   any NC / ND variant, "fair use", "non-free", GFDL-only, unknown, missing
 */

const BaseLicenseChecker = require('../base/BaseLicenseChecker');

const PD_MARK_URL = 'https://commons.wikimedia.org/wiki/Commons:Licensing';

class WikimediaLicenseChecker extends BaseLicenseChecker {
  constructor(licenseSettings = {}) {
    super(licenseSettings);
    // Fail-closed toggles (default true = allowed; admins may disable per class)
    this.allowPublicDomain = licenseSettings.allowPublicDomain !== false;
    this.allowCc0 = licenseSettings.allowCc0 !== false;
    this.allowCcBy = licenseSettings.allowCcBy !== false;
    this.allowCcBySa = licenseSettings.allowCcBySa !== false;
  }

  check(candidate) {
    if (!candidate || !candidate.license) {
      return this.rejection(candidate, 'Candidate carries no license metadata at all');
    }

    const L = candidate.license;
    const shortName = (L.shortName || '').trim();
    const usageTerms = (L.usageTerms || '').trim();
    const licenseUrl = (L.licenseUrl || '').trim();
    const combined = `${shortName} ${usageTerms} ${licenseUrl}`;

    // ---------- 1. Hard rejection patterns (checked FIRST) -------------------
    if (/-NC\b|NonCommercial|Non-?commercial/i.test(combined)) {
      return this.rejection(candidate, 'License restricts to NON-COMMERCIAL use (NC) — incompatible with an ad-supported platform', shortName || 'Non-Commercial');
    }
    if (/-ND\b|NoDerivs|No-?Derivatives/i.test(combined)) {
      return this.rejection(candidate, 'License forbids derivative works (ND)', shortName || 'No-Derivatives');
    }
    if (/fair use|fair dealing|non-?free|All rights reserved/i.test(combined)) {
      return this.rejection(candidate, 'Item is not freely licensed (fair use / non-free / all rights reserved)', shortName || 'Restricted');
    }
    if (!shortName && !usageTerms && !licenseUrl) {
      return this.rejection(candidate, 'No license information found in item metadata (extmetadata empty)');
    }

    // ---------- 2. Public Domain ---------------------------------------------
    const urlSaysPd = /publicdomain/i.test(licenseUrl);
    const nameSaysPd = /^public domain|PD(-|\b)|no restrictions|Public Domain Mark/i.test(shortName) || /^public domain$/i.test(usageTerms);
    const codeSaysPd = /^pd$|^pd[-_]/i.test(L.licenseCode || '');
    if (nameSaysPd || urlSaysPd || codeSaysPd) {
      if (!this.allowPublicDomain) {
        return this.rejection(candidate, 'Public Domain imports are disabled in site settings', 'Public Domain');
      }
      // Corroboration guard: PD claims must not contradict an active copyright flag
      if (L.copyrightedFlag === 'true' && !urlSaysPd && !codeSaysPd) {
        return this.rejection(candidate, `Ambiguous rights: marked "${shortName}" but file is still flagged as copyrighted`, shortName);
      }
      return {
        accepted: true,
        reason: null,
        licenseType: licenseUrl ? `Public Domain (${shortName || 'via license URL'})` : (shortName || 'Public Domain'),
        licenseUrl: licenseUrl || PD_MARK_URL,
        attributionRequired: false,
        attributionText: this._attributionText(candidate, shortName || 'Public Domain', false),
        canRehost: true,
        commercialAllowed: true
      };
    }

    // ---------- 3. CC0 ---------------------------------------------------------
    if (/CC0|Public Domain Dedication/i.test(combined)) {
      if (!this.allowCc0) return this.rejection(candidate, 'CC0 imports are disabled in site settings', 'CC0');
      return {
        accepted: true,
        reason: null,
        licenseType: 'Creative Commons CC0 1.0 Universal',
        licenseUrl: licenseUrl || 'https://creativecommons.org/publicdomain/zero/1.0/',
        attributionRequired: false,
        attributionText: this._attributionText(candidate, 'CC0 1.0', false),
        canRehost: true,
        commercialAllowed: true
      };
    }

    // ---------- 4. CC BY / CC BY-SA (version-agnostic) --------------------------
    const ccMatch = combined.match(/CC(?:\s|-)?(BY(?:\s|-)?SA?)?(?:\s)?([1-4](?:\.[0-9])?)?/i);
    if (ccMatch) {
      const isSa = /SA/i.test(ccMatch[1] || '') || /by-sa/i.test(licenseUrl);
      const isBy = /BY/i.test(ccMatch[1] || '') || /\/by(-sa)?\//i.test(licenseUrl);
      const version = ccMatch[2] || '4.0';

      if (isBy || isSa) {
        const type = isSa ? `CC BY-SA ${version}` : `CC BY ${version}`;
        const allowed = isSa ? this.allowCcBySa : this.allowCcBy;
        if (!allowed) return this.rejection(candidate, `${type} imports are disabled in site settings`, type);

        const attributionRequired = L.attributionRequiredFlag !== 'false'; // CC BY always requires attribution
        return {
          accepted: true,
          reason: null,
          licenseType: `Creative Commons ${isSa ? 'Attribution-ShareAlike' : 'Attribution'} ${version}`,
          licenseUrl: licenseUrl || `https://creativecommons.org/licenses/${isSa ? 'by-sa' : 'by'}/${version}/`,
          attributionRequired,
          attributionText: this._attributionText(candidate, type, true),
          canRehost: true,
          commercialAllowed: true
        };
      }
    }

    // ---------- 5. Anything else fails closed -----------------------------------
    return this.rejection(
      candidate,
      `Unrecognized license "${shortName || usageTerms || licenseUrl}" — fail-closed policy imports only PD, CC0, CC BY, CC BY-SA`,
      shortName || 'Unknown'
    );
  }

  _attributionText(candidate, licenseType, required) {
    const L = candidate.license || {};
    const creditBits = [];
    creditBits.push(`"${candidate.title}"`);
    if (L.artist) creditBits.push(`by ${L.artist}`);
    if (L.credit) creditBits.push(`(${L.credit.trim()})`);
    creditBits.push(`— ${licenseType}, via Wikimedia Commons`);
    creditBits.push(candidate.source_url || '');
    if (required) {
      creditBits.push('· Attribution required by license — do not remove this credit.');
    }
    return creditBits.filter(Boolean).join(' ');
  }
}

module.exports = WikimediaLicenseChecker;
