import { useEffect } from 'react';

/**
 * useSeo hook - sets document title and key meta/link tags.
 * Mirrors the previous SeoHelmet component behavior but as a hook API.
 */
export default function useSeo({
  title = 'Dashboard',
  description = 'School dashboard and attendance system',
  url = (typeof window !== 'undefined' && window.location) ? window.location.href : '/',
  image = '/assets/og-image.png',
  themeColor = '#0ea5e9',
} = {}) {
  useEffect(() => {
    try {
      if (title) document.title = title;

      const setMeta = (attr, key, content) => {
        if (!content && content !== '') return;
        const selector = `${attr}="${key}"`;
        let el = document.head.querySelector(`meta[${selector}]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute(attr, key);
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      };

      setMeta('name', 'description', description);
      setMeta('property', 'og:title', title);
      setMeta('property', 'og:description', description);
      setMeta('property', 'og:type', 'website');
      setMeta('property', 'og:url', url);
      setMeta('property', 'og:image', image);
      setMeta('name', 'twitter:card', 'summary_large_image');
      setMeta('name', 'twitter:title', title);
      setMeta('name', 'twitter:description', description);
      setMeta('name', 'theme-color', themeColor);

      if (url) {
        let link = document.head.querySelector('link[rel="canonical"]');
        if (!link) {
          link = document.createElement('link');
          link.setAttribute('rel', 'canonical');
          document.head.appendChild(link);
        }
        link.setAttribute('href', url);
      }

      const ensureLink = (rel, href, attrs = {}) => {
        let l = document.head.querySelector(`link[rel="${rel}"]`);
        if (!l) {
          l = document.createElement('link');
          l.setAttribute('rel', rel);
          Object.entries(attrs).forEach(([k, v]) => l.setAttribute(k, v));
          l.setAttribute('href', href);
          document.head.appendChild(l);
        }
      };

      ensureLink('icon', '/assets/favicon-32x32.png', { type: 'image/png', sizes: '32x32' });
      ensureLink('shortcut icon', '/assets/favicon.ico');
    } catch (err) {
      console.warn('useSeo: failed to set head tags', err);
    }
  }, [title, description, url, image, themeColor]);
}
