(() => {
  const { measurementId, trackPage } = document.currentScript.dataset;
  if (!/^G-[A-Z0-9]+$/.test(measurementId) || location.origin !== 'https://tripointgs.com') return;

  const preferenceKey = 'tri-point-analytics';
  const disableKey = `ga-disable-${measurementId}`;
  const panel = document.getElementById('analytics-choices');
  const settings = document.querySelector('[data-analytics-settings]');
  const allow = panel.querySelector('[data-analytics-allow]');
  const decline = panel.querySelector('[data-analytics-decline]');
  let tagStarted = false;
  let leadRecorded = false;
  let preference = null;
  try {
    preference = localStorage.getItem(preferenceKey);
  } catch {
    // The choice can still apply to this page when storage is blocked.
  }

  function gtag() {
    window.dataLayer.push(arguments);
  }

  function partnerCampaign() {
    // Only the published partner-link vocabulary is sent. Never forward arbitrary
    // query values (which can contain customer details, search terms or tokens).
    const params = new URLSearchParams(location.search);
    const source = params.get('utm_source');
    const medium = params.get('utm_medium');
    const campaign = params.get('utm_campaign');
    const campaigns = ['partner_lenovo', 'partner_fortinet', 'partner_wasabi',
      'partner_ptzoptics', 'partner_arctic_wolf'];
    if (!['linkedin', 'x', 'facebook'].includes(source) || medium !== 'social' ||
        !campaigns.includes(campaign) ||
        ['utm_source', 'utm_medium', 'utm_campaign'].some(key => params.getAll(key).length !== 1)) return {};
    return { campaign_source: source, campaign_medium: medium, campaign_name: campaign };
  }

  function startPageView() {
    if (trackPage !== 'true' || tagStarted) return;
    tagStarted = true;
    window.dataLayer = window.dataLayer || [];
    gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('js', new Date());
    gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: location.origin + location.pathname,
      page_referrer: document.referrer ? new URL(document.referrer).origin : '',
      ...partnerCampaign(),
    });

    const tag = document.createElement('script');
    tag.async = true;
    tag.referrerPolicy = 'origin';
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(tag);
  }

  function applyPreference(value) {
    preference = value;
    window[disableKey] = value !== 'allow';
    panel.hidden = value === 'allow' || value === 'decline' || trackPage !== 'true';
    if (value === 'allow') startPageView();
    if (value !== 'decline') return;
    for (const name of ['_ga', `_ga_${measurementId.slice(2)}`]) {
      const expired = `${name}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
      document.cookie = expired;
      document.cookie = `${expired}; Domain=tripointgs.com`;
    }
  }

  let openedFromSettings = false;
  function setPreference(value) {
    try {
      localStorage.setItem(preferenceKey, value);
    } catch {
      // Keep the in-page choice when it cannot be saved across visits.
    }
    applyPreference(value);
    if (openedFromSettings) settings.focus({ preventScroll: true });
    openedFromSettings = false;
  }

  settings.addEventListener('click', () => {
    openedFromSettings = true;
    panel.hidden = false;
    allow.focus({ preventScroll: true });
  });
  allow.addEventListener('click', () => setPreference('allow'));
  decline.addEventListener('click', () => setPreference('decline'));
  window.addEventListener('storage', (event) => {
    if (event.key === preferenceKey || event.key === null) applyPreference(event.newValue);
  });
  window.addEventListener('tri-point:quote-received', () => {
    if (location.pathname !== '/contact' || trackPage !== 'true' || !tagStarted ||
        preference !== 'allow' || window[disableKey] || leadRecorded) return;
    leadRecorded = true;
    // The form emits only after a confirmed production receipt. No form values,
    // request IDs, product selections or customer details enter analytics.
    gtag('event', 'generate_lead', { form_id: 'contact-form' });
  });
  applyPreference(preference);
})();
