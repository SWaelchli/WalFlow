import React, { useState, useEffect } from 'react';
import { confirmDialog } from '../../utils/dialogs';
import { useAuth } from '../../hooks/useAuth';
import { CrownIcon, CrossIcon, TrashIcon, InfoIcon, UserIcon, CloudIcon, RefreshIcon, CheckIcon, CheckCircleIcon, EditIcon, CopyIcon, DownloadIcon, SearchIcon, FolderOpenIcon } from '../symbols/IconLibrary';

import { modalA11yRef } from '../../hooks/useModalA11y';
const AdminHubModal = ({ isOpen, onClose, onLoadDiagram }) => {
  const {
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
    currentUser
  } = useAuth();

  const [activeTab, setActiveTab] = useState('backlog'); // 'backlog', 'users', 'db_inspector'
  const [pendingUsers, setPendingUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [dbData, setDbData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });

  // Diagram management states
  const [diagramSearchQuery, setDiagramSearchQuery] = useState('');
  const [diagramToDelete, setDiagramToDelete] = useState(null); // { id, title }
  const [editingDiagram, setEditingDiagram] = useState(null); // { id, title, description }

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab]);



  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'backlog') {
        const pending = await fetchPendingUsers();
        setPendingUsers(pending || []);
      } else if (activeTab === 'users') {
        const users = await fetchUsers();
        setAllUsers(users || []);
      } else if (activeTab === 'db_inspector') {
        const users = await fetchUsers();
        setAllUsers(users || []);
        const data = await inspectDatabase();
        setDbData(data);
      }
    } catch {
      showMessage('Failed to fetch data from backend server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage({ text: '', type: '' });
    }, 4000);
  };

  const handleApprove = async (userId) => {
    try {
      await approveUser(userId);
      showMessage('User registration approved successfully!', 'success');
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to approve user.', 'error');
    }
  };

  const handleReject = async (userId) => {
    try {
      await rejectUser(userId);
      showMessage('User disabled. Their access ends immediately.', 'warning');
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to reject user.', 'error');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      showMessage(`User role updated to ${newRole}.`, 'success');
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to update role.', 'error');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    const ok = await confirmDialog({
      title: 'Delete user?',
      message: `Delete user '${username}'? This action cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteUser(userId);
      showMessage(`User '${username}' deleted successfully.`, 'success');
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to delete user.', 'error');
    }
  };

  // Diagram Operations
  const handleOpenDiagram = (diagram) => {
    try {
      const parsed = JSON.parse(diagram.diagram_data || '{}');
      if (onLoadDiagram) {
        onLoadDiagram(parsed);
        showMessage(`Loaded drawing '${diagram.title}' onto canvas.`, 'success');
        onClose();
      }
    } catch {
      showMessage('Failed to parse drawing data payload.', 'error');
    }
  };

  const handleDuplicateDiagram = async (diagramId) => {
    try {
      const res = await adminDuplicateDiagram(diagramId);
      showMessage(res.message || 'Drawing duplicated.', 'success');
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to duplicate drawing.', 'error');
    }
  };

  const handleReassignOwner = async (diagramId, newUserId) => {
    try {
      const res = await adminReassignDiagram(diagramId, newUserId);
      showMessage(res.message || 'Drawing ownership transferred.', 'success');
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to reassign ownership.', 'error');
    }
  };

  const confirmDeleteDiagramAction = async () => {
    if (!diagramToDelete) return;
    try {
      const res = await adminDeleteDiagram(diagramToDelete.id);
      showMessage(res.message || 'Drawing deleted.', 'success');
      setDiagramToDelete(null);
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to delete drawing.', 'error');
    }
  };

  const handleExportDiagram = (diagram) => {
    try {
      let dataStr = diagram.diagram_data || '{}';
      try {
        const parsed = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        dataStr = JSON.stringify(parsed, null, 2);
      } catch {
        // Keep raw string if parsing fails
      }
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${diagram.title.toLowerCase().replace(/\s+/g, '_')}.wlf`;
      link.click();
      URL.revokeObjectURL(url);
      showMessage(`Exported '${diagram.title}.wlf'.`, 'success');
    } catch {
      showMessage('Failed to export drawing file.', 'error');
    }
  };

  const handleSaveMetadata = async (e) => {
    e.preventDefault();
    if (!editingDiagram) return;
    try {
      const res = await adminUpdateDiagramMetadata(editingDiagram.id, editingDiagram.title, editingDiagram.description);
      showMessage(res.message || 'Drawing updated.', 'success');
      setEditingDiagram(null);
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to update metadata.', 'error');
    }
  };

  if (!isOpen) return null;

  const filteredDiagrams = (dbData?.diagrams || []).filter((d) => {
    const q = diagramSearchQuery.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q)) ||
      d.owner_username.toLowerCase().includes(q)
    );
  });

  return (
    <div className="modal-overlay">
      <div className="modal-container" ref={modalA11yRef} style={{ maxWidth: '1080px', height: 'min(760px, 88vh)', maxHeight: '88vh' }}>
        {/* Modal Header */}
        <div className="modal-header" style={{ padding: '24px 28px 16px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px var(--color-primary-glow)'
            }}>
              <CrownIcon size={22} color="#ffffff" />
            </div>
            <div>
              <h2 className="modal-title" style={{ fontSize: 'var(--fs-xl)' }}>
                Admin Hub
              </h2>
              <p style={{ margin: '3px 0 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-base)' }}>
                Users, registration requests and stored drawings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            title="Close"
            aria-label="Close"
          >
            <CrossIcon size={18} />
          </button>
        </div>

        {/* Tab Navigation Bar */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          padding: '12px 28px',
          gap: '8px'
        }}>
          <button
            className={`modal-tab-btn ${activeTab === 'backlog' ? 'active' : ''}`}
            onClick={() => setActiveTab('backlog')}
          >
            <InfoIcon size={14} /> Registration requests
            {pendingUsers.length > 0 && (
              <span style={{
                backgroundColor: 'var(--color-danger)',
                color: '#FFFFFF',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: 'var(--fs-xs)',
                fontWeight: '800'
              }}>
                {pendingUsers.length}
              </span>
            )}
          </button>

          <button
            className={`modal-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <UserIcon size={14} /> Users
          </button>

          <button
            className={`modal-tab-btn ${activeTab === 'db_inspector' ? 'active' : ''}`}
            onClick={() => setActiveTab('db_inspector')}
          >
            <CloudIcon size={14} /> Stored drawings
          </button>
        </div>

        {/* Status Toast Banner */}
        {statusMessage.text && (
          <div style={{
            padding: '10px 28px',
            backgroundColor: 'var(--color-surface-hover)',
            color: statusMessage.type === 'error' ? 'var(--color-danger)' : statusMessage.type === 'warning' ? 'var(--color-warning)' : 'var(--color-success)',
            fontSize: 'var(--fs-base)',
            fontWeight: '600',
            borderBottom: '1px solid var(--color-border)'
          }}>
            {statusMessage.text}
          </div>
        )}

        {/* Tab Content Container */}
        <div className="modal-body">

          {/* TAB 1: REGISTRATION BACKLOG */}
          {activeTab === 'backlog' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 'var(--fs-lg)', fontWeight: '700' }}>
                  Pending registrations
                </h3>
                <button
                  onClick={loadData}
                  className="btn-secondary"
                  style={{ padding: '6px 14px' }}
                >
                  <RefreshIcon size={14} /> Refresh
                </button>
              </div>

              {loading ? (
                <div style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '40px' }}>Loading backlog...</div>
              ) : pendingUsers.length === 0 ? (
                <div style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: '12px',
                  padding: '40px',
                  textAlign: 'center',
                  color: 'var(--color-text-secondary)'
                }}>
                  <CheckCircleIcon size={28} color="var(--color-success)" style={{ display: 'block', margin: '0 auto 8px' }} />
                  No pending registration requests.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--color-text-primary)', fontSize: 'var(--fs-base)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>Username</th>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>Registered</th>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>Status</th>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingUsers.map((user) => (
                        <tr key={user.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '12px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                            <UserIcon size={14} color="var(--color-text-secondary)" style={{ marginRight: '6px' }} />{user.username}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                            {user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              backgroundColor: 'var(--color-warning-bg)',
                              color: 'var(--color-warning-text)',
                              border: '1px solid var(--color-warning-border)',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: 'var(--fs-xs)',
                              fontWeight: '700'
                            }}>
                              Pending approval
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleApprove(user.id)}
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: 'var(--fs-sm)', marginRight: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <CheckIcon size={14} color="var(--color-success)" /> Approve
                            </button>
                            <button
                              onClick={() => handleReject(user.id)}
                              className="btn-danger-ghost"
                              style={{ padding: '6px 12px', fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <CrossIcon size={14} /> Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 'var(--fs-lg)', fontWeight: '700' }}>
                  All users
                </h3>
                <button
                  onClick={loadData}
                  className="btn-secondary"
                  style={{ padding: '6px 14px' }}
                >
                  <RefreshIcon size={14} /> Refresh
                </button>
              </div>

              {loading ? (
                <div style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '40px' }}>Loading users...</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--color-text-primary)', fontSize: 'var(--fs-base)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>Username</th>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>Role</th>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>Status</th>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>Drawings</th>
                        <th style={{ padding: '12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((user) => (
                        <tr key={user.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '12px', fontWeight: '700' }}>
                            {user.username} {user.id === currentUser?.id && <span style={{ color: 'var(--color-primary-text)', fontSize: 'var(--fs-xs)' }}>(You)</span>}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              disabled={user.id === currentUser?.id}
                              className="form-select"
                              style={{
                                color: user.role === 'admin' ? 'var(--color-primary)' : 'var(--color-text-primary)',
                                height: '28px',
                                padding: '0 8px',
                                fontSize: 'var(--fs-sm)',
                                fontWeight: '700'
                              }}
                            >
                              <option value="user">User</option>
                              <option value="pipe_manager">Pipe Manager</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              backgroundColor: user.status === 'approved' ? '#ECFDF5' : user.status === 'rejected' ? '#FEF2F2' : 'var(--color-warning-bg)',
                              color: user.status === 'approved' ? '#047857' : user.status === 'rejected' ? 'var(--color-danger-text)' : 'var(--color-warning-text)',
                              border: `1px solid ${user.status === 'approved' ? '#A7F3D0' : user.status === 'rejected' ? '#FEE2E2' : 'var(--color-warning-border)'}`,
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: 'var(--fs-xs)',
                              fontWeight: '700'
                            }}>
                              {user.status === 'rejected' ? 'Disabled' : user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                            </span>
                          </td>
                          <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                            {user.diagram_count} {user.diagram_count === 1 ? 'drawing' : 'drawings'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {user.id !== currentUser?.id && user.status === 'approved' && (
                              <button
                                onClick={() => handleReject(user.id)}
                                title="Ends the user's access immediately; the account and its diagrams are kept"
                                style={{
                                  backgroundColor: '#FEF2F2',
                                  color: 'var(--color-danger-text)',
                                  border: '1px solid #FEE2E2',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: 'var(--fs-sm)',
                                  cursor: 'pointer',
                                  marginRight: '8px'
                                }}
                              >
                                Disable
                              </button>
                            )}
                            {user.id !== currentUser?.id && user.status === 'rejected' && (
                              <button
                                onClick={() => handleApprove(user.id)}
                                style={{
                                  backgroundColor: '#F4F7F6',
                                  color: '#1C2B2C',
                                  border: '1px solid #D8E2E1',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: 'var(--fs-sm)',
                                  cursor: 'pointer',
                                  marginRight: '8px'
                                }}
                              >
                                Enable
                              </button>
                            )}
                            {user.id !== currentUser?.id && (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                className="btn-danger-ghost"
                                style={{ padding: '4px 10px', fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <TrashIcon size={14} /> Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DATABASE INSPECTOR & DIAGRAM MANAGER */}
          {activeTab === 'db_inspector' && (
            <div>
              {/* Metric Cards */}
              {dbData?.stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Total users', value: dbData.stats.total_users },
                    { label: 'Pending approval', value: dbData.stats.pending_users, attention: dbData.stats.pending_users > 0 },
                    { label: 'Admins', value: dbData.stats.admin_users },
                    { label: 'Stored drawings', value: dbData.stats.total_diagrams },
                  ].map((stat) => (
                    <div key={stat.label} className="modal-metric-card" style={stat.attention ? { borderColor: 'var(--color-warning-border)', backgroundColor: 'var(--color-warning-bg)' } : undefined}>
                      <div style={{ color: stat.attention ? 'var(--color-warning-text)' : 'var(--color-text-secondary)', fontSize: 'var(--fs-sm)', fontWeight: '600' }}>{stat.label}</div>
                      <div style={{ color: stat.attention ? 'var(--color-warning-text-strong)' : 'var(--color-text-primary)', fontSize: 'var(--fs-2xl)', fontWeight: '700', marginTop: '4px' }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Toolbar & Search Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <SearchIcon size={16} color="var(--color-text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    value={diagramSearchQuery}
                    onChange={(e) => setDiagramSearchQuery(e.target.value)}
                    placeholder="Search drawings by title, description or owner"
                    aria-label="Search drawings"
                    className="form-input"
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 36px',
                      height: '38px',
                      fontSize: 'var(--fs-base)',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <button
                  onClick={loadData}
                  className="btn-secondary"
                  style={{ padding: '10px 16px', height: '38px' }}
                >
                  <RefreshIcon size={14} /> Refresh
                </button>
              </div>

              {/* Diagrams Table */}
              {loading ? (
                <div style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '30px' }}>Loading diagrams...</div>
              ) : filteredDiagrams.length === 0 ? (
                <div style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: '12px',
                  padding: '30px',
                  textAlign: 'center',
                  color: 'var(--color-text-secondary)'
                }}>
                  No matching drawings found.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--color-text-primary)', fontSize: 'var(--fs-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px', color: 'var(--color-text-secondary)' }}>Drawing</th>
                        <th style={{ padding: '10px', color: 'var(--color-text-secondary)' }}>Owner</th>
                        <th style={{ padding: '10px', color: 'var(--color-text-secondary)' }}>Last updated</th>
                        <th style={{ padding: '10px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDiagrams.map((diagram) => {
                        const ownerUser = allUsers.find(u => u.username === diagram.owner_username);
                        return (
                          <tr key={diagram.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontWeight: '700', color: 'var(--color-text-primary)', fontSize: 'var(--fs-base)' }}>
                                {diagram.title}
                              </div>
                              {diagram.description && (
                                <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-xs)', marginTop: '2px' }}>
                                  {diagram.description}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <select
                                value={ownerUser ? ownerUser.id : ''}
                                onChange={(e) => handleReassignOwner(diagram.id, e.target.value)}
                                className="form-select"
                                style={{
                                  color: 'var(--color-info)',
                                  height: '28px',
                                  padding: '4px 8px',
                                  fontSize: 'var(--fs-xs)',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                              >
                                {allUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.username} ({u.role === 'pipe_manager' ? 'pipe manager' : u.role})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '10px', color: 'var(--color-text-secondary)' }}>
                              {diagram.updated_at ? new Date(diagram.updated_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  onClick={() => handleOpenDiagram(diagram)}
                                  title="Open on canvas"
                                  className="btn-secondary"
                                  style={{ height: '28px', padding: '5px 10px', fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <FolderOpenIcon size={14} /> Open
                                </button>
                                <button
                                  onClick={() => setEditingDiagram({ id: diagram.id, title: diagram.title, description: diagram.description || '' })}
                                  title="Edit title and description"
                                  className="btn-secondary"
                                  aria-label="Edit title and description"
                                  style={{ height: '28px', width: '28px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <EditIcon size={14} />
                                </button>
                                <button
                                  onClick={() => handleDuplicateDiagram(diagram.id)}
                                  title="Duplicate drawing"
                                  className="btn-secondary"
                                  aria-label="Duplicate drawing"
                                  style={{ height: '28px', width: '28px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <CopyIcon size={14} />
                                </button>
                                <button
                                  onClick={() => handleExportDiagram(diagram)}
                                  title="Export as .wlf file"
                                  className="btn-secondary"
                                  aria-label="Export as .wlf file"
                                  style={{ height: '28px', width: '28px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <DownloadIcon size={14} />
                                </button>
                                <button
                                  onClick={() => setDiagramToDelete({ id: diagram.id, title: diagram.title })}
                                  title="Delete drawing"
                                  aria-label="Delete drawing"
                                  className="btn-danger-ghost"
                                  style={{ height: '28px', width: '28px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <TrashIcon size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal Popup */}
      {diagramToDelete && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-container" ref={modalA11yRef} style={{
            maxWidth: '440px',
            padding: '24px',
            border: '1px solid var(--color-danger)',
            boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <TrashIcon size={22} color="var(--color-danger-text)" />
              <h3 className="modal-title" style={{ fontSize: 'var(--fs-lg)', fontWeight: '700' }}>
                Delete drawing?
              </h3>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-md)', lineHeight: '1.5', margin: '0 0 24px 0' }}>
              Are you sure you want to permanently delete the drawing <strong style={{ color: 'var(--color-primary-text)' }}>'{diagramToDelete.title}'</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setDiagramToDelete(null)}
                className="btn-secondary"
                style={{ height: '36px', borderRadius: '10px', padding: '0 16px', fontSize: 'var(--fs-base)', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteDiagramAction}
                style={{
                  backgroundColor: 'var(--color-danger)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '9px 16px',
                  fontSize: 'var(--fs-base)',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Delete drawing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal Popup */}
      {editingDiagram && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <form onSubmit={handleSaveMetadata} className="modal-container" ref={modalA11yRef} style={{
            maxWidth: '460px',
            padding: '24px'
          }}>
            <h3 className="modal-title" style={{ margin: '0 0 16px 0', fontSize: 'var(--fs-xl)', fontWeight: '800' }}>
              Edit drawing details
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-xs)', fontWeight: '600', marginBottom: '6px' }}>
                Title
              </label>
              <input
                type="text"
                value={editingDiagram.title}
                onChange={(e) => setEditingDiagram({ ...editingDiagram, title: e.target.value })}
                className="form-input"
                style={{
                  width: '100%',
                  height: '38px',
                  fontSize: 'var(--fs-base)',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-xs)', fontWeight: '600', marginBottom: '6px' }}>
                Description
              </label>
              <textarea
                value={editingDiagram.description}
                onChange={(e) => setEditingDiagram({ ...editingDiagram, description: e.target.value })}
                rows={3}
                className="form-input"
                style={{
                  width: '100%',
                  fontSize: 'var(--fs-base)',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  height: 'auto',
                  padding: '10px 14px'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingDiagram(null)}
                className="btn-secondary"
                style={{ height: '36px', borderRadius: '10px', padding: '0 16px', fontSize: 'var(--fs-base)', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '9px 16px',
                  fontSize: 'var(--fs-base)',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(250, 133, 7, 0.35)'
                }}
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminHubModal;
