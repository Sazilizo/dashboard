import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/LandingPage.css"; 
import backgroundImage from "../assets/education-bg.png";
import useSeo from '../hooks/useSeo';
const LandingPage = () => {
  const navigate = useNavigate();

  useSeo({ title: 'GCU Schools', description: 'Empowering educators and tracking learner growth with ease.' });

  const handleLogin = () => {
    navigate("/login");
  };

  return (
    <>
      {/* SEO handled by useSeo hook */}
      <div
      className="landing-container"
      style={{
        backgroundImage: `url(${backgroundImage})`,
      }}
    >
      <div className="overlay">
        <div className="brand-title">GCU Schools</div>
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
    </>
  );
};

export default LandingPage;
