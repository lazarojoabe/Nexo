'use client';
import { useEffect } from 'react';
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Development must always render the current local source rather than a
    // service-worker cache left by an earlier test session.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
      return;
    }

    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  return null;
}
