/**
 * Strict License Validator for AKAVOX
 * Ensures 100% legal compliance by enforcing Public Domain and Commercial-friendly Creative Commons licenses only.
 */

class LicenseValidator {
  constructor(settings = {}) {
    this.settings = {
      allowPublicDomain: settings.license_allow_public_domain !== false,
      allowCc0: settings.license_allow_cc0 !== false,
      allowCcBy: settings.license_allow_cc_by !== false,
      allowCcBySa: settings.license_allow_cc_by_sa !== false,
      allowCcNc: settings.license_allow_cc_nc === true, // Default strict false
      allowCcNd: settings.license_allow_cc_nd === true, // Default strict false
      requireExplicitLicense: settings.require_explicit_license !== false,
      publicDomainCutoffYear: parseInt(settings.public_domain_cutoff_year, 10) || 1929,
      ...settings
    };
  }

  /**
   * Validate an item's license metadata
   * @param {Object} metadata - Metadata from Internet Archive
   * @returns {Object} Validation result with validation status and attribution details
   */
  validate(metadata) {
    const licenseUrl = (metadata.licenseurl || '').trim().toLowerCase();
    const rights = (metadata.rights || '').trim().toLowerCase();
    const copyrightStatus = (metadata['possible-copyright-status'] || '').trim().toLowerCase();
    const copyrightNotice = (metadata.copyright || '').trim().toLowerCase();
    const usage = (metadata.usage || '').trim().toLowerCase();
    const year = parseInt(metadata.year || metadata.date, 10);
    const title = metadata.title || 'Untitled';
    const creator = metadata.creator || metadata.director || 'Unknown';

    // 1. Check for explicit negative indicators
    const rejectionIndicators = [
      { pattern: /by-nc/i, reason: "License contains Non-Commercial restriction (CC BY-NC), which forbids commercial reuse/ad monetization" },
      { pattern: /all rights reserved/i, reason: "All Rights Reserved - Not in the public domain or open license" },
      { pattern: /in copyright/i, reason: "Item is explicitly flagged as In Copyright" },
      { pattern: /non-commercial/i, reason: "Item metadata explicitly restricts to non-commercial use" },
      { pattern: /no commercial/i, reason: "Item metadata explicitly restricts commercial use" },
      { pattern: /by-nd/i, reason: "License contains No-Derivatives restriction (CC BY-ND)" }
    ];

    for (const indicator of rejectionIndicators) {
      if (indicator.pattern.test(licenseUrl) || indicator.pattern.test(rights) || indicator.pattern.test(usage)) {
        return {
          isValid: false,
          licenseType: 'Restricted / Non-Commercial',
          licenseUrl: metadata.licenseurl || '',
          rightsStatement: metadata.rights || 'Restricted',
          commercialAllowed: false,
          redistributionAllowed: false,
          attributionRequired: false,
          attributionText: '',
          rejectionReason: indicator.reason
        };
      }
    }

    // 2. Check for Public Domain via CC Public Domain Mark / License
    const isCcPublicDomainUrl = 
      licenseUrl.includes('publicdomain/mark') ||
      licenseUrl.includes('licenses/publicdomain') ||
      licenseUrl.includes('publicdomain/zero') ||
      licenseUrl.includes('creativecommons.org/publicdomain');

    const isPublicDomainText = 
      rights.includes('public domain') || 
      rights.includes('no copyright') ||
      copyrightStatus.includes('not_in_copyright') ||
      copyrightStatus.includes('public domain');

    // US pre-1929 unconditional public domain rule
    const isPre1929PublicDomain = !isNaN(year) && year > 1880 && year < this.settings.publicDomainCutoffYear;

    if (isCcPublicDomainUrl || isPublicDomainText || isPre1929PublicDomain) {
      if (!this.settings.allowPublicDomain) {
        return {
          isValid: false,
          licenseType: 'Public Domain',
          rejectionReason: "Public Domain imports are currently disabled in settings"
        };
      }

      let specType = 'Public Domain';
      if (licenseUrl.includes('publicdomain/zero') || rights.includes('cc0')) {
        specType = 'CC0 1.0 Universal (Public Domain Dedication)';
      } else if (licenseUrl.includes('publicdomain/mark') || rights.includes('public domain mark')) {
        specType = 'Public Domain Mark 1.0';
      } else if (isPre1929PublicDomain) {
        specType = `Public Domain (Published ${year} - Prior to ${this.settings.publicDomainCutoffYear})`;
      }

      return {
        isValid: true,
        licenseType: specType,
        licenseUrl: metadata.licenseurl || 'https://creativecommons.org/publicdomain/mark/1.0/',
        rightsStatement: metadata.rights || 'This work is in the Public Domain. Free of known restrictions under copyright law.',
        commercialAllowed: true,
        redistributionAllowed: true,
        attributionRequired: false,
        attributionText: `Originally released in ${year || 'vintage era'}. In the Public Domain worldwide.`,
        rejectionReason: null
      };
    }

    // 3. Check for CC0 (Creative Commons Zero)
    if (licenseUrl.includes('/zero/1.0') || rights.includes('cc0')) {
      if (!this.settings.allowCc0) {
        return { isValid: false, rejectionReason: "CC0 items are disabled in settings" };
      }
      return {
        isValid: true,
        licenseType: 'Creative Commons CC0 1.0 Universal',
        licenseUrl: metadata.licenseurl || 'https://creativecommons.org/publicdomain/zero/1.0/',
        rightsStatement: 'Dedicated to the public domain worldwide via CC0 1.0 Universal.',
        commercialAllowed: true,
        redistributionAllowed: true,
        attributionRequired: false,
        attributionText: 'Dedicated to the public domain under Creative Commons CC0 1.0.',
        rejectionReason: null
      };
    }

    // 4. Check for CC BY (Creative Commons Attribution)
    if (licenseUrl.includes('/licenses/by/')) {
      if (!this.settings.allowCcBy) {
        return { isValid: false, rejectionReason: "CC BY items are disabled in settings" };
      }
      const versionMatch = licenseUrl.match(/by\/([0-9.]+)/);
      const version = versionMatch ? versionMatch[1] : '4.0';
      return {
        isValid: true,
        licenseType: `Creative Commons Attribution ${version} (CC BY ${version})`,
        licenseUrl: metadata.licenseurl,
        rightsStatement: `This work is licensed under Creative Commons Attribution ${version}. Commercial reuse allowed with attribution.`,
        commercialAllowed: true,
        redistributionAllowed: true,
        attributionRequired: true,
        attributionText: `"${title}" by ${creator} is licensed under CC BY ${version}. Original source: Internet Archive.`,
        rejectionReason: null
      };
    }

    // 5. Check for CC BY-SA (Creative Commons Attribution-ShareAlike)
    if (licenseUrl.includes('/licenses/by-sa/')) {
      if (!this.settings.allowCcBySa) {
        return { isValid: false, rejectionReason: "CC BY-SA items are disabled in settings" };
      }
      const versionMatch = licenseUrl.match(/by-sa\/([0-9.]+)/);
      const version = versionMatch ? versionMatch[1] : '4.0';
      return {
        isValid: true,
        licenseType: `Creative Commons Attribution-ShareAlike ${version} (CC BY-SA ${version})`,
        licenseUrl: metadata.licenseurl,
        rightsStatement: `This work is licensed under Creative Commons Attribution-ShareAlike ${version}. Commercial reuse allowed under compatible terms.`,
        commercialAllowed: true,
        redistributionAllowed: true,
        attributionRequired: true,
        attributionText: `"${title}" by ${creator} is licensed under CC BY-SA ${version}. Original source: Internet Archive.`,
        rejectionReason: null
      };
    }

    // 6. Unknown / Missing License
    return {
      isValid: false,
      licenseType: 'Unknown / Undetermined',
      licenseUrl: metadata.licenseurl || '',
      rightsStatement: metadata.rights || 'No verified license statement found',
      commercialAllowed: false,
      redistributionAllowed: false,
      attributionRequired: false,
      attributionText: '',
      rejectionReason: "No unambiguous Public Domain or commercial-compatible Creative Commons license was detected in metadata"
    };
  }
}

module.exports = LicenseValidator;
