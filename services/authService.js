// Example React code for JWT handling in frontend

// services/authService.js
const API_URL = 'http://localhost:5000/api/auth';

// Store JWT in localStorage
export const setToken = (token) => {
  localStorage.setItem('token', token);
};

// Get JWT from localStorage
export const getToken = () => {
  return localStorage.getItem('token');
};

// Remove JWT from localStorage
export const removeToken = () => {
  localStorage.removeItem('token');
};

// Parse user info from token
export const getUserFromToken = () => {
  const token = getToken();
  if (!token) return null;
  
  try {
    // Decode JWT (simple frontend decoding without verification)
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    
    const { user, exp } = JSON.parse(jsonPayload);
    
    // Check if token is expired
    if (exp * 1000 < Date.now()) {
      removeToken();
      return null;
    }
    
    return user;
  } catch (error) {
    removeToken();
    return null;
  }
};

// Login API call
export const login = async (username, password) => {
  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  
  const data = await response.json();
  
  if (response.ok) {
    setToken(data.token);
    return { success: true, data };
  } else {
    return { success: false, error: data.message };
  }
};

// Register API call
export const register = async (username, email, password) => {
  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, email, password }),
  });
  
  const data = await response.json();
  
  if (response.ok) {
    setToken(data.token);
    return { success: true, data };
  } else {
    return { success: false, error: data.message };
  }
};

// Logout function
export const logout = () => {
  removeToken();
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return getUserFromToken() !== null;
};

// API request with JWT authentication
export const authenticatedRequest = async (url, options = {}) => {
  const token = getToken();
  
  if (!token) {
    throw new Error('No authentication token found');
  }
  
  const headers = {
    ...options.headers,
    'x-auth-token': token,
  };
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  if (response.status === 401) {
    // Token expired or invalid
    removeToken();
    window.location.href = '/login'; // Redirect to login
    throw new Error('Authentication token expired');
  }
  
  return response;
};