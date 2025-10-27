/**
 * Auto-resize textarea to fit content
 * @param {HTMLTextAreaElement} element - The textarea element
 * @param {number} maxHeight - Maximum height in pixels (default: 500)
 */
export function autoResizeTextarea(element, maxHeight = 500) {
  if (!element) return;
  
  // Reset height to auto to get the correct scrollHeight
  element.style.height = 'auto';
  
  // Set new height based on content, respecting max height
  const newHeight = Math.min(element.scrollHeight, maxHeight);
  element.style.height = newHeight + 'px';
  
  // Show scrollbar if content exceeds max height
  if (element.scrollHeight > maxHeight) {
    element.style.overflowY = 'auto';
  } else {
    element.style.overflowY = 'hidden';
  }
}

/**
 * Initialize auto-resize on all textareas in a container
 * @param {HTMLElement} container - Container element (default: document)
 */
export function initAutoResizeTextareas(container = document) {
  const textareas = container.querySelectorAll('textarea[data-auto-resize="true"]');
  
  textareas.forEach((textarea) => {
    // Initial resize
    autoResizeTextarea(textarea);
    
    // Add event listeners
    textarea.addEventListener('input', () => autoResizeTextarea(textarea));
    textarea.addEventListener('focus', () => autoResizeTextarea(textarea));
  });
}

/**
 * React hook for auto-resizing textareas
 */
export function useAutoResizeTextarea(ref, value) {
  if (typeof window === 'undefined') return; // SSR safety
  
  React.useEffect(() => {
    if (ref.current) {
      autoResizeTextarea(ref.current);
    }
  }, [value, ref]);
}
