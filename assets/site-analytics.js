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
  let preference = null;
  try {
    preference = localStorage.getItem(preferenceKey);
  } catch {
    // The choice can still apply to this page when storage is blocked.
  }

  function startPageView() {
    if (trackPage !== 'true' || tagStarted) return;
    tagStarted = true;
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
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
    });

    const tag = document.createElement('script');
    tag.async = true;
    tag.referrerPolicy = 'origin';
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(tag);
  }

  function applyPreference(value) {
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
  applyPreference(preference);
})();
