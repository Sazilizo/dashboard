/**
 * Simple performance monitoring utility
 * Tracks key web vitals and logs them in development
 */

export const measurePerformance = () => {
  if (typeof window === 'undefined' || !window.performance) return;

  // Only run in development
  if (process.env.NODE_ENV !== 'development') return;

  // Wait for page load to complete
  window.addEventListener('load', () => {
    // Use requestIdleCallback to avoid blocking
    const runWhenIdle = (callback) => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(callback, { timeout: 5000 });
      } else {
        setTimeout(callback, 1000);
      }
    };

    runWhenIdle(() => {
      const perfData = window.performance.getEntriesByType('navigation')[0];
      const paintData = window.performance.getEntriesByType('paint');

      if (perfData) {
        console.group('📊 Performance Metrics');
        console.log('⚡ DOM Content Loaded:', Math.round(perfData.domContentLoadedEventEnd - perfData.fetchStart), 'ms');
        console.log('⚡ Page Load Complete:', Math.round(perfData.loadEventEnd - perfData.fetchStart), 'ms');
        console.log('⚡ DOM Interactive:', Math.round(perfData.domInteractive - perfData.fetchStart), 'ms');
        
        const fcp = paintData.find(entry => entry.name === 'first-contentful-paint');
        if (fcp) {
          console.log('🎨 First Contentful Paint (FCP):', Math.round(fcp.startTime), 'ms');
        }

        // Measure JavaScript execution time
        const scripts = window.performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script');
        const totalScriptTime = scripts.reduce((sum, s) => sum + s.duration, 0);
        console.log('📜 Total Script Load Time:', Math.round(totalScriptTime), 'ms');
        console.log('📜 Number of Scripts:', scripts.length);

        console.groupEnd();
      }

      // Monitor long tasks if supported
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach((entry) => {
              if (entry.duration > 50) {
                console.warn('⚠️ Long Task detected:', Math.round(entry.duration), 'ms');
              }
            });
          });
          observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {
          // Long task API not supported
        }
      }
    });
  });
};

export default measurePerformance;
