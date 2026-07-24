import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AuthContext } from './AuthContext';

axios.defaults.withCredentials = true;

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      if (response.data && typeof response.data === 'object' && response.data.username) {
        setCurrentUser(response.data);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    const response = await axios.post('/api/auth/login', { username, password });
    if (response.data && response.data.user) {
      setCurrentUser(response.data.user);
    } else {
      await checkAuthStatus();
    }
    return response.data;
  };

  const register = async (username, password) => {
    await axios.post('/api/auth/register', { username, password });
    return await login(username, password);
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch {
      // Ignore logout errors
    } finally {
      setCurrentUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        loading,
        login,
        register,
        logout,
        checkAuthStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
