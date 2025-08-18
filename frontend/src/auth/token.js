// src/auth/token.js
// Senior-level JWT token utility for React SPA

// Get tokens from localStorage
export const getAccessToken = () => localStorage.getItem("access_token");
export const getRefreshToken = () => localStorage.getItem("refresh_token");

// Set tokens in localStorage
export const setTokens = ({ access_token, refresh_token }) => {
  if (access_token) localStorage.setItem("access_token", access_token);
  if (refresh_token) localStorage.setItem("refresh_token", refresh_token);
};

// Clear tokens from localStorage
export const clearTokens = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
};

// Check if access token is expired (JWT payload check)
export const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  } catch {
    return true;
  }
};

// Try to refresh token if expired
export const maybeRefreshToken = async (axiosInstance) => {
  const token = getAccessToken();

  if (isTokenExpired(token)) {
    try {
      const res = await axiosInstance.post("/auth/refresh", null, {
        withCredentials: true,
      });
      const { access_token, refresh_token } = res.data;
      setTokens({ access_token, refresh_token });
      return access_token;
    } catch (err) {
      clearTokens();
      return null;
    }
  }
  return token;
};

// src/auth/token.js
// NO token storage or manual refresh in client because we use HttpOnly cookies

// export const getAccessToken = () => null;
// export const getRefreshToken = () => null;
// export const setTokens = () => {};
// export const clearTokens = () => {};
// export const isTokenExpired = () => true;
// export const maybeRefreshToken = async () => null;
