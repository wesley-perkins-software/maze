function isDailyOverrideAllowed(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  if (host === 'mazethis.com' || host === 'www.mazethis.com') return false;
  return host.endsWith('.netlify.app');
}

export function getDailyNow(): Date {
  if (isDailyOverrideAllowed() && typeof window !== 'undefined') {
    const raw = new URLSearchParams(window.location.search).get('dailyNow');
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}
