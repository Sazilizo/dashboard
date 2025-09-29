import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/LandingPage.css"; 
import backgroundImage from "../assets/education-bg.png";
const LandingPage = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate("/login");
  };

  return (
    <div
      className="landing-container"
      style={{
        backgroundImage: `url(${backgroundImage})`,
      }}
    >
      <div className="overlay">
        <div className="brand-title">EduTracker</div>
        <div style={{display:"flex", justifyContent:"space-between"}}>
          <div className="tagline">
            Empowering educators and tracking learner growth with ease.
          </div>
          <button className="login-button" onClick={handleLogin}>
            Login
          </button>
        </div>

        </div>
    </div>
  );
};

export default LandingPage;
