import React, { useEffect } from 'react';

// Lightweight SEO component that manipulates head tags directly.
// This avoids external dependencies and works across React versions.
export default function SeoHelmet({
  title = 'Dashboard',
  description = 'School dashboard and attendance system',
  url = (typeof window !== 'undefined' && window.location && window.location.href) || '/',
  image = '/assets/og-image.png',
  themeColor = '#0ea5e9',
} = {}) {
  useEffect(() => {
    if (title) document.title = title;

    const setMeta = (nameOrProp, attr, value) => {
      let el;
      if (attr === 'name') el = document.querySelector(`meta[name="${nameOrProp}"]`);
      else el = document.querySelector(`meta[property="${nameOrProp}"]`);

      if (!el) {
        el = document.createElement('meta');
        if (attr === 'name') el.setAttribute('name', nameOrProp);
        else el.setAttribute('property', nameOrProp);
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    };

    setMeta('description', 'name', description);
    setMeta('og:title', 'property', title);
    setMeta('og:description', 'property', description);
    setMeta('og:type', 'property', 'website');
    setMeta('og:url', 'property', url);
    setMeta('og:image', 'property', image);
    setMeta('twitter:card', 'name', 'summary_large_image');
    setMeta('twitter:title', 'name', title);
    setMeta('twitter:description', 'name', description);
    setMeta('theme-color', 'name', themeColor);

    const ensureLink = (rel, attrs) => {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    };

    ensureLink('apple-touch-icon', { sizes: '180x180', href: '/assets/apple-touch-icon.png' });
    ensureLink('icon', { type: 'image/png', sizes: '32x32', href: '/assets/favicon-32x32.png' });
    ensureLink('icon', { type: 'image/png', sizes: '16x16', href: '/assets/favicon-16x16.png' });
    ensureLink('manifest', { href: '/assets/site.webmanifest' });
    ensureLink('shortcut icon', { href: '/assets/favicon.ico' });

    // canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    return () => {
      // do not remove tags on unmount to keep head stable across navigations
    };
  }, [title, description, url, image, themeColor]);

  return null;
}
