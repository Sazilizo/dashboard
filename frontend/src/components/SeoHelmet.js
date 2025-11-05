import React from 'react';
import { Helmet } from 'react-helmet-async';

/**
 * SeoHelmet - Default SEO/head tags for the app. Use props to override per-page values.
 * Favicons paths assume assets are served at /assets/
 */
export default function SeoHelmet({
  title = 'Dashboard',
  description = 'School dashboard and attendance system',
  url = window?.location?.href || '/',
  image = '/assets/og-image.png',
  themeColor = '#0ea5e9',
}) {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="theme-color" content={themeColor} />

      {/* Favicons (adjust filenames in /assets/ if yours differ) */}
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png" />
      <link rel="manifest" href="/assets/site.webmanifest" />
      <link rel="shortcut icon" href="/assets/favicon.ico" />

      {/* Optional: canonical link - keep if you have a canonical URL */}
      <link rel="canonical" href={url} />
    </Helmet>
  );
}
