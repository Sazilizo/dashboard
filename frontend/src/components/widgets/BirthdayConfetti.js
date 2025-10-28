import React, { useEffect, useState } from 'react';
import '../../styles/BirthdayConfetti.css';

const BirthdayConfetti = ({ duration = 5000, persistent = false }) => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (!persistent && duration > 0) {
      const timer = setTimeout(() => {
        setShow(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, persistent]);

  if (!show) return null;

  // Generate confetti pieces
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    animationDelay: Math.random() * 3,
    animationDuration: 3 + Math.random() * 2,
    color: ['#ff6b9d', '#ffc93c', '#4ecdc4', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#ffffd2'][Math.floor(Math.random() * 8)]
  }));

  // Generate balloons
  const balloons = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    left: 10 + (i * 12),
    animationDelay: i * 0.3,
    color: ['#ff6b9d', '#ffc93c', '#4ecdc4', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#ffffd2'][i]
  }));

  return (
    <div className="birthday-celebration">
      {/* Confetti */}
      <div className="confetti-container">
        {confettiPieces.map((piece) => (
          <div
            key={piece.id}
            className="confetti"
            style={{
              left: `${piece.left}%`,
              backgroundColor: piece.color,
              animationDelay: `${piece.animationDelay}s`,
              animationDuration: `${piece.animationDuration}s`
            }}
          />
        ))}
      </div>

      {/* Balloons */}
      <div className="balloons-container">
        {balloons.map((balloon) => (
          <div
            key={balloon.id}
            className="balloon"
            style={{
              left: `${balloon.left}%`,
              backgroundColor: balloon.color,
              animationDelay: `${balloon.animationDelay}s`
            }}
          >
            <div className="balloon-string" style={{ borderColor: balloon.color }} />
          </div>
        ))}
      </div>

      {/* Birthday Message */}
      {!persistent && (
        <div className="birthday-message">
          🎉 Happy Birthday! 🎂
        </div>
      )}
    </div>
  );
};

export default BirthdayConfetti;
