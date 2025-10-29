import React from "react";
import Toast from "./Toast";

export default function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        toast.customComponent ? (
          <div key={toast.id} className="toast-wrapper">
            {toast.customComponent}
          </div>
        ) : (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        )
      ))}
    </div>
  );
}
