import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AuthContext } from './AuthContext';

axios.defaults.withCredentials = true;

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState({ adminExists: true, pendingCount: 0 });

  useEffect(() => {
    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sliding session renewal: automatically refresh token every 20 minutes if active (SEC-03 / Option 1)
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(async () => {
      try {
        await axios.post('/api/auth/refresh');
      } catch (err) {
        if (err.response?.status === 401) {
          setCurrentUser(null);
        }
      }
    }, 20 * 60 * 1000); // 20 minutes

    return () => clearInterval(interval);
  }, [currentUser]);

  const checkAdminStatus = async (retries = 5, delayMs = 1200) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await axios.get('/api/auth/admin-status');
        if (res.data && typeof res.data.admin_exists === 'boolean') {
          setAdminStatus({
            adminExists: res.data.admin_exists,
            pendingCount: res.data.pending_count || 0
          });
          return res.data;
        }
      } catch {
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    return { adminExists: true, pendingCount: 0 };
  };

  const initAuth = async () => {
    try {
      await checkAdminStatus();
      await checkAuthStatus();
    } finally {
      setLoading(false);
    }
  };

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
    }
  };

  const setupFirstAdmin = async (username, password) => {
    const response = await axios.post('/api/auth/setup-admin', { username, password });
    await checkAdminStatus();
    if (response.data) {
      await login(username, password);
    }
    return response.data;
  };

  const login = async (username, password) => {
    const response = await axios.post('/api/auth/login', { username, password });
    if (response.data && response.data.user) {
      setCurrentUser(response.data.user);
    } else {
      await checkAuthStatus();
    }
    await checkAdminStatus();
    return response.data;
  };

  const register = async (username, password) => {
    const response = await axios.post('/api/auth/register', { username, password });
    await checkAdminStatus();
    if (response.data && response.data.status === 'pending_approval') {
      return response.data;
    }
    return await login(username, password);
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch {
      // Ignore logout errors
    } finally {
      setCurrentUser(null);
      await checkAdminStatus();
    }
  };

  // Admin Actions
  const fetchUsers = async () => {
    const res = await axios.get('/api/admin/users');
    return res.data;
  };

  const fetchPendingUsers = async () => {
    const res = await axios.get('/api/admin/pending-users');
    return res.data;
  };

  const approveUser = async (userId) => {
    const res = await axios.post(`/api/admin/users/${userId}/approve`);
    await checkAdminStatus();
    return res.data;
  };

  const rejectUser = async (userId) => {
    const res = await axios.post(`/api/admin/users/${userId}/reject`);
    await checkAdminStatus();
    return res.data;
  };

  const updateUserRole = async (userId, role) => {
    const res = await axios.put(`/api/admin/users/${userId}/role`, { role });
    return res.data;
  };

  const deleteUser = async (userId) => {
    const res = await axios.delete(`/api/admin/users/${userId}`);
    await checkAdminStatus();
    return res.data;
  };

  const inspectDatabase = async () => {
    const res = await axios.get('/api/admin/database/inspect');
    return res.data;
  };

  const adminDeleteDiagram = async (diagramId) => {
    const res = await axios.delete(`/api/admin/diagrams/${diagramId}`);
    return res.data;
  };

  const adminDuplicateDiagram = async (diagramId) => {
    const res = await axios.post(`/api/admin/diagrams/${diagramId}/duplicate`);
    return res.data;
  };

  const adminReassignDiagram = async (diagramId, newUserId) => {
    const res = await axios.put(`/api/admin/diagrams/${diagramId}/reassign`, { new_user_id: newUserId });
    return res.data;
  };

  const adminUpdateDiagramMetadata = async (diagramId, title, description) => {
    const res = await axios.put(`/api/admin/diagrams/${diagramId}/metadata`, { title, description });
    return res.data;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isAdmin: currentUser?.role === 'admin',
        adminStatus,
        loading,
        login,
        register,
        logout,
        setupFirstAdmin,
        checkAuthStatus,
        checkAdminStatus,
        fetchUsers,
        fetchPendingUsers,
        approveUser,
        rejectUser,
        updateUserRole,
        deleteUser,
        inspectDatabase,
        adminDeleteDiagram,
        adminDuplicateDiagram,
        adminReassignDiagram,
        adminUpdateDiagramMetadata,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
