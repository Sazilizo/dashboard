import React from 'react';
import '../styles/ConfirmToast.css';

/**
 * Confirmation toast with Yes/No buttons
 * Provides a nicer UX than window.confirm
 */
const ConfirmToast = ({ message, onYes, onNo, yesText = 'Yes', noText = 'No', generateCode }) => {
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
        {typeof generateCode === 'function' && (
          <button
            className="confirm-toast-btn confirm-toast-generate"
            onClick={() => generateCode()}
            title="Generate a one-time sign-in code"
          >
            Generate Code
          </button>
        )}
      </div>
    </div>
  );
};

export default ConfirmToast;
