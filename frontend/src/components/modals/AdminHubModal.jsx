import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { CrownIcon, CrossIcon, TrashIcon, ExportIcon, InfoIcon, UserIcon, CloudIcon } from '../symbols/IconLibrary';

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
      showMessage('User registration rejected.', 'warning');
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
    if (!window.confirm(`Are you sure you want to delete user '${username}'? This action cannot be undone.`)) {
      return;
    }
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
        showMessage(`Loaded diagram '${diagram.title}' onto canvas.`, 'success');
        onClose();
      }
    } catch {
      showMessage('Failed to parse diagram data payload.', 'error');
    }
  };

  const handleDuplicateDiagram = async (diagramId) => {
    try {
      const res = await adminDuplicateDiagram(diagramId);
      showMessage(res.message || 'Diagram duplicated.', 'success');
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to duplicate diagram.', 'error');
    }
  };

  const handleReassignOwner = async (diagramId, newUserId) => {
    try {
      const res = await adminReassignDiagram(diagramId, newUserId);
      showMessage(res.message || 'Diagram ownership transferred.', 'success');
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to reassign ownership.', 'error');
    }
  };

  const confirmDeleteDiagramAction = async () => {
    if (!diagramToDelete) return;
    try {
      const res = await adminDeleteDiagram(diagramToDelete.id);
      showMessage(res.message || 'Diagram deleted.', 'success');
      setDiagramToDelete(null);
      loadData();
    } catch (err) {
      showMessage(err.response?.data?.detail || 'Failed to delete diagram.', 'error');
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
      showMessage('Failed to export diagram file.', 'error');
    }
  };

  const handleSaveMetadata = async (e) => {
    e.preventDefault();
    if (!editingDiagram) return;
    try {
      const res = await adminUpdateDiagramMetadata(editingDiagram.id, editingDiagram.title, editingDiagram.description);
      showMessage(res.message || 'Diagram updated.', 'success');
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
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(26, 40, 41, 0.75)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "var(--font-sans, 'Inter', sans-serif)"
    }}>
      <div style={{
        backgroundColor: 'var(--color-brand-darkest)',
        color: '#ffffff',
        border: '1px solid var(--color-brand-dark)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1080px',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(250, 133, 7, 0.15)',
        overflow: 'hidden',
        animation: 'walflowFadeIn 0.2s ease-out'
      }}>
        <style>
          {`
            @keyframes walflowFadeIn {
              from { opacity: 0; transform: scale(0.97); }
              to { opacity: 1; transform: scale(1); }
            }
            .admin-tab-btn {
              background: transparent;
              border: none;
              color: var(--color-text-muted);
              font-size: 13px;
              font-weight: 600;
              padding: 10px 16px;
              cursor: pointer;
              border-radius: 8px;
              transition: all 0.15s ease;
              display: flex;
              align-items: center;
              gap: 8px;
              outline: none;
            }
            .admin-tab-btn:hover {
              color: var(--color-text-inverse);
              background: rgba(255, 255, 255, 0.05);
            }
            .admin-tab-btn.active {
              color: var(--color-text-inverse);
              background: var(--color-primary);
              box-shadow: 0 4px 12px var(--color-primary-glow);
            }
            .modal-close-btn {
              background: transparent;
              border: none;
              color: var(--color-text-muted);
              cursor: pointer;
              padding: 4px 10px;
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.15s ease;
            }
            .modal-close-btn:hover {
              background-color: var(--color-brand-darker);
              color: var(--color-text-inverse);
            }
          `}
        </style>

        {/* Modal Header */}
        <div style={{
          padding: '24px 28px 16px 28px',
          borderBottom: '1px solid var(--color-brand-darker)',
          backgroundColor: 'var(--color-surface-dark)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
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
              <h2 style={{ margin: 0, color: '#ffffff', fontSize: '20px', fontWeight: '700' }}>
                Admin Hub Panel
              </h2>
              <p style={{ margin: '3px 0 0 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                System User Management, Registration Backlog, & Database Content Inspector
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            title="Close"
          >
            <CrossIcon size={18} />
          </button>
        </div>

        {/* Tab Navigation Bar */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-brand-darker)',
          backgroundColor: 'var(--color-brand-darkest)',
          padding: '12px 28px',
          gap: '8px'
        }}>
          <button
            className={`admin-tab-btn ${activeTab === 'backlog' ? 'active' : ''}`}
            onClick={() => setActiveTab('backlog')}
          >
            <InfoIcon size={14} /> Registration Backlog
            {pendingUsers.length > 0 && (
              <span style={{
                backgroundColor: 'var(--color-danger)',
                color: '#FFFFFF',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: '800'
              }}>
                {pendingUsers.length}
              </span>
            )}
          </button>

          <button
            className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <UserIcon size={14} /> User Management
          </button>

          <button
            className={`admin-tab-btn ${activeTab === 'db_inspector' ? 'active' : ''}`}
            onClick={() => setActiveTab('db_inspector')}
          >
            <CloudIcon size={14} /> Database Inspector
          </button>
        </div>

        {/* Status Toast Banner */}
        {statusMessage.text && (
          <div style={{
            padding: '10px 28px',
            backgroundColor: statusMessage.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : statusMessage.type === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            color: statusMessage.type === 'error' ? '#FCA5A5' : statusMessage.type === 'warning' ? '#FCD34D' : '#86EFAC',
            fontSize: '13px',
            fontWeight: '600',
            borderBottom: '1px solid var(--color-brand-darker)'
          }}>
            {statusMessage.text}
          </div>
        )}

        {/* Tab Content Container */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>

          {/* TAB 1: REGISTRATION BACKLOG */}
          {activeTab === 'backlog' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#ffffff', fontSize: '16px', fontWeight: '700' }}>
                  Pending User Registrations
                </h3>
                <button
                  onClick={loadData}
                  style={{
                    backgroundColor: '#263839',
                    border: '1px solid #4A6768',
                    borderRadius: '8px',
                    color: '#B8C9C8',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Refresh
                </button>
              </div>

              {loading ? (
                <div style={{ color: '#B8C9C8', textAlign: 'center', padding: '40px' }}>Loading backlog...</div>
              ) : pendingUsers.length === 0 ? (
                <div style={{
                  backgroundColor: '#223233',
                  border: '1px dashed var(--color-brand-dark)',
                  borderRadius: '12px',
                  padding: '40px',
                  textAlign: 'center',
                  color: '#B8C9C8'
                }}>
                  <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>🎉</span>
                  No pending user registrations in the queue.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ffffff', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #263839', textAlign: 'left' }}>
                        <th style={{ padding: '12px', color: '#B8C9C8' }}>Username</th>
                        <th style={{ padding: '12px', color: '#B8C9C8' }}>Registration Date</th>
                        <th style={{ padding: '12px', color: '#B8C9C8' }}>Status</th>
                        <th style={{ padding: '12px', color: '#B8C9C8', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingUsers.map((user) => (
                        <tr key={user.id} style={{ borderBottom: '1px solid #263839' }}>
                          <td style={{ padding: '12px', fontWeight: '700', color: '#ffffff' }}>
                            👤 {user.username}
                          </td>
                          <td style={{ padding: '12px', color: '#B8C9C8' }}>
                            {user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              backgroundColor: 'rgba(245, 158, 11, 0.2)',
                              color: '#FCD34D',
                              border: '1px solid #F59E0B',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '700'
                            }}>
                              ⏳ Pending Approval
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleApprove(user.id)}
                              style={{
                                backgroundColor: '#10B981',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 14px',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                marginRight: '8px'
                              }}
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleReject(user.id)}
                              style={{
                                backgroundColor: '#EF4444',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 14px',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              ✕ Reject
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
                <h3 style={{ margin: 0, color: '#ffffff', fontSize: '16px', fontWeight: '700' }}>
                  All Registered Users
                </h3>
                <button
                  onClick={loadData}
                  style={{
                    backgroundColor: '#263839',
                    border: '1px solid #4A6768',
                    borderRadius: '8px',
                    color: '#B8C9C8',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Refresh
                </button>
              </div>

              {loading ? (
                <div style={{ color: '#B8C9C8', textAlign: 'center', padding: '40px' }}>Loading users...</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ffffff', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #263839', textAlign: 'left' }}>
                        <th style={{ padding: '12px', color: '#B8C9C8' }}>Username</th>
                        <th style={{ padding: '12px', color: '#B8C9C8' }}>Role</th>
                        <th style={{ padding: '12px', color: '#B8C9C8' }}>Status</th>
                        <th style={{ padding: '12px', color: '#B8C9C8' }}>Diagrams</th>
                        <th style={{ padding: '12px', color: '#B8C9C8', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((user) => (
                        <tr key={user.id} style={{ borderBottom: '1px solid #263839' }}>
                          <td style={{ padding: '12px', fontWeight: '700' }}>
                            {user.username} {user.id === currentUser?.id && <span style={{ color: 'var(--color-primary)', fontSize: '11px' }}>(You)</span>}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              disabled={user.id === currentUser?.id}
                              style={{
                                backgroundColor: '#223233',
                                color: user.role === 'admin' ? 'var(--color-primary)' : '#B8C9C8',
                                border: '1px solid var(--color-brand-dark)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontWeight: '700'
                              }}
                            >
                              <option value="user">User</option>
                              <option value="admin">👑 Admin</option>
                            </select>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              backgroundColor: user.status === 'approved' ? 'rgba(34, 197, 94, 0.2)' : user.status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: user.status === 'approved' ? '#86EFAC' : user.status === 'rejected' ? '#FCA5A5' : '#FCD34D',
                              border: `1px solid ${user.status === 'approved' ? '#22C55E' : user.status === 'rejected' ? '#EF4444' : '#F59E0B'}`,
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '700'
                            }}>
                              {user.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px', color: '#B8C9C8' }}>
                            {user.diagram_count} diagrams
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {user.id !== currentUser?.id && (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                style={{
                                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                  color: '#EF4444',
                                  border: '1px solid #EF4444',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                              >
                                🗑️ Delete
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
                  <div style={{ backgroundColor: '#223233', border: '1px solid var(--color-brand-dark)', borderRadius: '12px', padding: '14px' }}>
                    <div style={{ color: '#B8C9C8', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>TOTAL USERS</div>
                    <div style={{ color: '#ffffff', fontSize: '22px', fontWeight: '800', marginTop: '4px' }}>{dbData.stats.total_users}</div>
                  </div>
                  <div style={{ backgroundColor: '#223233', border: '1px solid var(--color-brand-dark)', borderRadius: '12px', padding: '14px' }}>
                    <div style={{ color: '#FCD34D', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>PENDING APPROVAL</div>
                    <div style={{ color: '#FCD34D', fontSize: '22px', fontWeight: '800', marginTop: '4px' }}>{dbData.stats.pending_users}</div>
                  </div>
                  <div style={{ backgroundColor: '#223233', border: '1px solid var(--color-brand-dark)', borderRadius: '12px', padding: '14px' }}>
                    <div style={{ color: 'var(--color-primary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ADMIN USERS</div>
                    <div style={{ color: 'var(--color-primary)', fontSize: '22px', fontWeight: '800', marginTop: '4px' }}>{dbData.stats.admin_users}</div>
                  </div>
                  <div style={{ backgroundColor: '#223233', border: '1px solid var(--color-brand-dark)', borderRadius: '12px', padding: '14px' }}>
                    <div style={{ color: '#60A5FA', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>STORED PFD DIAGRAMS</div>
                    <div style={{ color: '#60A5FA', fontSize: '22px', fontWeight: '800', marginTop: '4px' }}>{dbData.stats.total_diagrams}</div>
                  </div>
                </div>
              )}

              {/* Toolbar & Search Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#B8C9C8' }}>🔍</span>
                  <input
                    type="text"
                    value={diagramSearchQuery}
                    onChange={(e) => setDiagramSearchQuery(e.target.value)}
                    placeholder="Search stored diagrams by title, description, or owner..."
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 36px',
                      borderRadius: '10px',
                      border: '1px solid var(--color-brand-dark)',
                      backgroundColor: '#223233',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <button
                  onClick={loadData}
                  style={{
                    backgroundColor: '#263839',
                    border: '1px solid #4A6768',
                    borderRadius: '10px',
                    color: '#ffffff',
                    padding: '10px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Refresh DB
                </button>
              </div>

              {/* Diagrams Table */}
              {loading ? (
                <div style={{ color: '#B8C9C8', textAlign: 'center', padding: '30px' }}>Loading diagrams...</div>
              ) : filteredDiagrams.length === 0 ? (
                <div style={{
                  backgroundColor: '#223233',
                  border: '1px dashed var(--color-brand-dark)',
                  borderRadius: '12px',
                  padding: '30px',
                  textAlign: 'center',
                  color: '#B8C9C8'
                }}>
                  No matching diagrams found in database.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ffffff', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #263839', textAlign: 'left' }}>
                        <th style={{ padding: '10px', color: '#B8C9C8' }}>Diagram Title</th>
                        <th style={{ padding: '10px', color: '#B8C9C8' }}>Reassign Owner</th>
                        <th style={{ padding: '10px', color: '#B8C9C8' }}>Last Updated</th>
                        <th style={{ padding: '10px', color: '#B8C9C8', textAlign: 'right' }}>Management Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDiagrams.map((diagram) => {
                        const ownerUser = allUsers.find(u => u.username === diagram.owner_username);
                        return (
                          <tr key={diagram.id} style={{ borderBottom: '1px solid #263839' }}>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontWeight: '700', color: '#ffffff', fontSize: '13px' }}>
                                {diagram.title}
                              </div>
                              {diagram.description && (
                                <div style={{ color: '#B8C9C8', fontSize: '11px', marginTop: '2px' }}>
                                  {diagram.description}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <select
                                value={ownerUser ? ownerUser.id : ''}
                                onChange={(e) => handleReassignOwner(diagram.id, e.target.value)}
                                style={{
                                  backgroundColor: '#223233',
                                  color: '#60A5FA',
                                  border: '1px solid var(--color-brand-dark)',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                              >
                                {allUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    👤 {u.username} ({u.role})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '10px', color: '#B8C9C8' }}>
                              {diagram.updated_at ? new Date(diagram.updated_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  onClick={() => handleOpenDiagram(diagram)}
                                  title="Load onto canvas"
                                  style={{
                                    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(250, 133, 7, 0.3)'
                                  }}
                                >
                                  📂 Open Diagram
                                </button>
                                <button
                                  onClick={() => setEditingDiagram({ id: diagram.id, title: diagram.title, description: diagram.description || '' })}
                                  title="Edit Title & Description"
                                  style={{
                                    backgroundColor: '#263839',
                                    color: '#ffffff',
                                    border: '1px solid #4A6768',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDuplicateDiagram(diagram.id)}
                                  title="Duplicate Diagram"
                                  style={{
                                    backgroundColor: '#263839',
                                    color: '#ffffff',
                                    border: '1px solid #4A6768',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  📋
                                </button>
                                <button
                                  onClick={() => handleExportDiagram(diagram)}
                                  title="Export .wlf"
                                  style={{
                                    backgroundColor: '#263839',
                                    color: '#ffffff',
                                    border: '1px solid #4A6768',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  ⬇️
                                </button>
                                <button
                                  onClick={() => setDiagramToDelete({ id: diagram.id, title: diagram.title })}
                                  title="Delete Diagram"
                                  style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                    color: '#EF4444',
                                    border: '1px solid #EF4444',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  🗑️
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
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(26, 40, 41, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#1A2829',
            border: '1px solid #EF4444',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.3)',
            animation: 'walflowFadeIn 0.15s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <span style={{ fontSize: '26px' }}>🗑️</span>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: '800' }}>
                Delete Diagram Confirmation
              </h3>
            </div>
            <p style={{ color: '#B8C9C8', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px 0' }}>
              Are you sure you want to permanently delete the diagram <strong style={{ color: 'var(--color-primary)' }}>'{diagramToDelete.title}'</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setDiagramToDelete(null)}
                style={{
                  backgroundColor: '#263839',
                  color: '#ffffff',
                  border: '1px solid #4A6768',
                  borderRadius: '10px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteDiagramAction}
                style={{
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Yes, Delete Diagram
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal Popup */}
      {editingDiagram && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(26, 40, 41, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <form onSubmit={handleSaveMetadata} style={{
            backgroundColor: '#1A2829',
            border: '1px solid var(--color-brand-dark)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(250, 133, 7, 0.15)',
            animation: 'walflowFadeIn 0.15s ease-out'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#ffffff', fontSize: '18px', fontWeight: '800' }}>
              ✏️ Edit Diagram Details
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--color-primary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Diagram Title
              </label>
              <input
                type="text"
                value={editingDiagram.title}
                onChange={(e) => setEditingDiagram({ ...editingDiagram, title: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-brand-dark)',
                  backgroundColor: '#223233',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--color-primary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Description
              </label>
              <textarea
                value={editingDiagram.description}
                onChange={(e) => setEditingDiagram({ ...editingDiagram, description: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-brand-dark)',
                  backgroundColor: '#223233',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingDiagram(null)}
                style={{
                  backgroundColor: '#263839',
                  color: '#ffffff',
                  border: '1px solid #4A6768',
                  borderRadius: '10px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
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
                  fontSize: '13px',
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
