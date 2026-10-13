// User-approved public business mailing/physical address for Tri-Point website and HP verification.
export const BUSINESS_ADDRESS = Object.freeze({
  streetAddress: '1017 Cottonwood Street',
  addressLocality: 'Leesburg',
  addressRegion: 'FL',
  postalCode: '34748',
  addressCountry: 'US'
});
export const BUSINESS_ADDRESS_TEXT = '1017 Cottonwood Street, Leesburg, FL 34748';
export const BUSINESS_ADDRESS_HTML = '<address class="business-address">1017 Cottonwood Street, Leesburg, FL 34748</address>';
export const BUSINESS_POSTAL_ADDRESS = Object.freeze({'@type': 'PostalAddress', ...BUSINESS_ADDRESS});
