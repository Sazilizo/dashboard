import { useState, useCallback } from "react";

export default function useToast() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "success", duration = 3000, customComponent = null) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration, customComponent };
    
    setToasts((prev) => [...prev, toast]);

    // Don't auto-dismiss if it's a custom component (user must interact)
    if (!customComponent && duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}
