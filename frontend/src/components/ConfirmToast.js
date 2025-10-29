import React from 'react';
import '../styles/ConfirmToast.css';

/**
 * Confirmation toast with Yes/No buttons
 * Provides a nicer UX than window.confirm
 */
const ConfirmToast = ({ message, onYes, onNo, yesText = 'Yes', noText = 'No' }) => {
  return (
    <div className="confirm-toast">
      <div className="confirm-toast-message">{message}</div>
      <div className="confirm-toast-actions">
        <button 
          className="confirm-toast-btn confirm-toast-yes" 
          onClick={onYes}
        >
          {yesText}
        </button>
        <button 
          className="confirm-toast-btn confirm-toast-no" 
          onClick={onNo}
        >
          {noText}
        </button>
      </div>
    </div>
  );
};

export default ConfirmToast;
