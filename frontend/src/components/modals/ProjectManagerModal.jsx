import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { FILE_FORMAT_VERSION, APP_VERSION, FILE_EXTENSION } from '../../constants';
import { CloudIcon, ExportIcon, ImportIcon, TrashIcon, CrossIcon, PlusIcon } from '../symbols/IconLibrary';

const ProjectManagerModal = ({
  isOpen,
  onClose,
  currentFlowData,
  onLoadDiagram,
  activeProject,
  setActiveProject,
  activeDiagram,
  setActiveDiagram,
  initialProjectId,
  showCanvasLoading,
  hideCanvasLoading
}) => {
  const { isAuthenticated, currentUser } = useAuth();
  
  // Navigation: "projects" | "project_detail"
  const [currentView, setCurrentView] = useState("projects");
  
  // Data loading states
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Target active project details (with member list and diagrams)
  const [projectDetail, setProjectDetail] = useState(null);

  // New item creation fields
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const [newDiagramTitle, setNewDiagramTitle] = useState("");
  const [newDiagramDesc, setNewDiagramDesc] = useState("");
  const [isCreatingDiagram, setIsCreatingDiagram] = useState(false);

  // Collaboration/Sharing Form Fields
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Share invitation link fields
  const [sharePassword, setSharePassword] = useState("");
  const [inviteDuration, setInviteDuration] = useState(24);
  const [inviteTokenLink, setInviteTokenLink] = useState("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Lock status mapping for diagrams: diagram_id -> lockInfo
  const [diagramLocks, setDiagramLocks] = useState({});

  const fetchProjects = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError("");
    try {
      const response = await axios.get('/api/projects');
      setProjects(response.data);
    } catch {
      setError("Failed to fetch cloud projects from server.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const fetchProjectDetail = useCallback(async (projectId) => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`/api/projects/${projectId}`);
      setProjectDetail(response.data);
      
      // Fetch lock status for each diagram in this project
      const locksMap = {};
      await Promise.all(
        response.data.diagrams.map(async (diag) => {
          try {
            const lockRes = await axios.get(`/api/diagrams/${diag.id}/lock-status`);
            if (lockRes.data.is_locked) {
              locksMap[diag.id] = lockRes.data.lock;
            }
          } catch {
            console.warn("Failed to get lock status for diagram:", diag.id);
          }
        })
      );
      setDiagramLocks(locksMap);
      setCurrentView("project_detail");
    } catch {
      setError("Failed to fetch project details from server.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset local state when modal toggled or load initial project view
  useEffect(() => {
    if (isOpen) {
      if (initialProjectId) {
        fetchProjectDetail(initialProjectId);
        setCurrentView("project_detail");
      } else {
        setCurrentView("projects");
        setProjectDetail(null);
      }
      setInviteTokenLink("");
      setSharePassword("");
    }
  }, [isOpen, initialProjectId, fetchProjectDetail]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchProjects();
    }
  }, [isOpen, isAuthenticated, fetchProjects]);

  if (!isOpen) return null;

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;
    setIsCreatingProject(true);
    try {
      const response = await axios.post('/api/projects', {
        title: newProjectTitle.trim(),
        description: newProjectDesc.trim()
      });
      setNewProjectTitle("");
      setNewProjectDesc("");
      fetchProjects();
      // Auto open the new project detail view
      fetchProjectDetail(response.data.id);
    } catch {
      alert("Failed to create project.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = async (projectId, title) => {
    if (!window.confirm(`Are you sure you want to delete '${title}'? This will permanently delete all diagrams inside it.`)) return;
    try {
      await axios.delete(`/api/projects/${projectId}`);
      if (activeProject && activeProject.id === projectId) {
        setActiveProject(null);
        setActiveDiagram(null);
      }
      fetchProjects();
    } catch {
      alert("Failed to delete project. You must be an Owner of this project.");
    }
  };

  const handleCreateDiagram = async (e) => {
    e.preventDefault();
    if (!newDiagramTitle.trim() || !projectDetail) return;
    setIsCreatingDiagram(true);
    try {
      const emptyPayload = {
        version: FILE_FORMAT_VERSION,
        app_version: APP_VERSION,
        format: 'walflow',
        created_at: new Date().toISOString(),
        nodes: currentFlowData.nodes || [],
        edges: currentFlowData.edges || [],
        globalSettings: currentFlowData.globalSettings || {},
        cases: currentFlowData.cases || [],
        active_case_id: currentFlowData.activeCaseId || 'case_base'
      };

      const response = await axios.post('/api/diagrams', {
        title: newDiagramTitle.trim(),
        description: newDiagramDesc.trim(),
        diagram_data: JSON.stringify(emptyPayload),
        project_id: projectDetail.id
      });

      setNewDiagramTitle("");
      setNewDiagramDesc("");
      fetchProjectDetail(projectDetail.id);
      alert(`New PFD diagram '${response.data.title}' created inside project.`);
    } catch {
      alert("Failed to create diagram inside project.");
    } finally {
      setIsCreatingDiagram(false);
    }
  };

  const handleLoadDiagram = async (diagramId) => {
    try {
      if (showCanvasLoading) {
        showCanvasLoading("Opening drawing from workspace…");
      }
      onClose();

      const response = await axios.get(`/api/diagrams/${diagramId}`);
      const parsedData = JSON.parse(response.data.diagram_data);
      
      // Auto-validate schema format
      if (parsedData.version !== FILE_FORMAT_VERSION) {
        alert(`Cannot load: File format version '${parsedData.version}' is incompatible with version '${FILE_FORMAT_VERSION}'.`);
        if (hideCanvasLoading) {
          hideCanvasLoading();
        }
        return;
      }

      // Link Active contexts
      if (setActiveProject) {
        setActiveProject({
          id: projectDetail.id,
          title: projectDetail.title,
          description: projectDetail.description
        });
      }
      if (setActiveDiagram) {
        setActiveDiagram({
          id: response.data.id,
          title: response.data.title,
          description: response.data.description
        });
      }
      onLoadDiagram(parsedData);
    } catch {
      alert("Failed to load diagram from server.");
      if (hideCanvasLoading) {
        hideCanvasLoading();
      }
    }
  };

  const handleDeleteDiagram = async (diagramId, title) => {
    if (!window.confirm(`Are you sure you want to delete PFD diagram '${title}'?`)) return;
    try {
      await axios.delete(`/api/diagrams/${diagramId}`);
      if (activeDiagram && activeDiagram.id === diagramId) {
        setActiveDiagram(null);
      }
      fetchProjectDetail(projectDetail.id);
    } catch {
      alert("Failed to delete diagram. Project Owners or the diagram creator only.");
    }
  };

  // Add Member
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!inviteUsername.trim() || !projectDetail) return;
    setIsAddingMember(true);
    try {
      await axios.post(`/api/projects/${projectDetail.id}/members`, {
        username: inviteUsername.trim(),
        role: inviteRole
      });
      setInviteUsername("");
      fetchProjectDetail(projectDetail.id);
      alert(`User '${inviteUsername}' successfully added to the project.`);
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        alert(err.response.data.detail);
      } else {
        alert("Failed to add project member.");
      }
    } finally {
      setIsAddingMember(false);
    }
  };

  // Remove Member
  const handleRemoveMember = async (memberId, username) => {
    if (!projectDetail) return;
    const msg = username === currentUser?.username 
      ? "Are you sure you want to leave this project?"
      : `Remove team member '${username}' from project?`;
    if (!window.confirm(msg)) return;

    try {
      await axios.delete(`/api/projects/${projectDetail.id}/members/${memberId}`);
      if (username === currentUser?.username) {
        setActiveProject(null);
        setActiveDiagram(null);
        onClose();
      } else {
        fetchProjectDetail(projectDetail.id);
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        alert(err.response.data.detail);
      } else {
        alert("Failed to remove member.");
      }
    }
  };

  // Promote/Demote roles
  const handleToggleMemberRole = async (memberId, currentRole) => {
    if (!projectDetail) return;
    const targetRole = currentRole === "owner" ? "member" : "owner";
    try {
      await axios.put(`/api/projects/${projectDetail.id}/members/${memberId}`, {
        role: targetRole
      });
      fetchProjectDetail(projectDetail.id);
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        alert(err.response.data.detail);
      } else {
        alert("Failed to change user role.");
      }
    }
  };

  // Create invite link token
  const handleGenerateShareToken = async () => {
    if (!projectDetail) return;
    setIsGeneratingLink(true);
    try {
      const response = await axios.post("/api/invitations", {
        project_id: projectDetail.id,
        password: sharePassword ? sharePassword.trim() : null,
        expires_in_hours: parseInt(inviteDuration)
      });
      const link = `${window.location.origin}/invite/${response.data.token}`;
      setInviteTokenLink(link);
    } catch {
      alert("Failed to generate invite token.");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleForceReleaseLock = async (diagramId) => {
    if (!window.confirm("Force release edit lock? Unsaved modifications by the current editor will be lost.")) return;
    try {
      await axios.post(`/api/diagrams/${diagramId}/force-checkin`);
      fetchProjectDetail(projectDetail.id);
    } catch {
      alert("Failed to release lock. Only project owners can force release locks.");
    }
  };

  const handleExportDiagramAsFile = async (diagram) => {
    try {
      const response = await axios.get(`/api/diagrams/${diagram.id}`);
      const dataStr = JSON.stringify(JSON.parse(response.data.diagram_data), null, 2);
      
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanName = diagram.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
      link.download = `${cleanName}${FILE_EXTENSION}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export diagram.");
    }
  };

  // Check if current user is owner of active project detail
  const isOwnerOfActiveProject = projectDetail?.members?.some(
    m => m.user_id === currentUser?.id && m.role === "owner"
  );

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '820px', maxHeight: '90vh' }}>
        <style>
          {`
            .breadcrumb-link {
              color: var(--color-text-secondary);
              cursor: pointer;
              transition: color 0.15s ease;
            }
            .breadcrumb-link:hover {
              color: var(--color-primary);
            }
          `}
        </style>

        {/* Modal Header */}
        <div className="modal-header" style={{ padding: '20px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px var(--color-primary-glow)'
            }}>
              <CloudIcon size={20} color="#ffffff" />
            </div>
            <div>
              <h3 className="modal-title" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {currentView === "projects" ? (
                  <span>Projects Manager</span>
                ) : (
                  <span style={{ fontSize: '16px' }}>
                    <span onClick={() => setCurrentView("projects")} className="breadcrumb-link">Projects</span>
                    <span style={{ margin: '0 6px', color: 'var(--color-text-secondary)' }}>/</span>
                    <span style={{ color: 'var(--color-text-primary)' }}>{projectDetail?.title}</span>
                  </span>
                )}
              </h3>
              <p style={{ margin: '2px 0 0 0', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                {currentView === "projects" ? "Select a project to view its diagrams and share options" : "Manage project drawings, members, and lock states"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn" title="Close">
            <CrossIcon size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {loading && (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Loading...</div>
          )}

          {error && (
            <div style={{ color: 'var(--color-danger)', fontSize: '13px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: '10px', border: '1px solid var(--color-danger)' }}>{error}</div>
          )}

          {/* VIEW 1: PROJECTS LIST */}
          {!loading && currentView === "projects" && (
            <>
              {/* Project Creation Form */}
              <div className="modal-metric-card" style={{ padding: '18px 20px' }}>
                <h4 style={{ margin: '0 0 14px 0', color: 'var(--color-primary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusIcon size={14} color="var(--color-primary)" /> Create New Project
                </h4>
                <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Project Title</label>
                      <input
                        type="text"
                        value={newProjectTitle}
                        onChange={(e) => setNewProjectTitle(e.target.value)}
                        placeholder="e.g. Refinery Loop A"
                        className="form-input"
                        style={{ width: '100%', height: '38px', fontSize: '13px' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Description</label>
                      <input
                        type="text"
                        value={newProjectDesc}
                        onChange={(e) => setNewProjectDesc(e.target.value)}
                        placeholder="Project overview or system purpose"
                        className="form-input"
                        style={{ width: '100%', height: '38px', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={isCreatingProject} className="btn-primary" style={{ alignSelf: 'flex-end', height: '36px', padding: '0 18px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 12px var(--color-primary-glow)' }}>
                    {isCreatingProject ? 'Creating...' : 'Create Project'}
                  </button>
                </form>
              </div>

              {/* Projects List display */}
              <div>
                <h4 style={{ margin: '0 0 14px 0', color: 'var(--color-primary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your Projects</h4>
                {projects.length === 0 ? (
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', textAlign: 'center', padding: '28px', backgroundColor: 'var(--color-surface-hover)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                    No projects found. Create your first project using the form above.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {projects.map(p => (
                      <div key={p.id} className="modal-list-item" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        margin: '0'
                      }}>
                        <div>
                          <h5 style={{ margin: '0 0 4px 0', color: 'var(--color-text-primary)', fontSize: '14px', fontWeight: '700' }}>
                            {p.title}
                          </h5>
                          <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                            {p.description || 'No description'} • Role: <strong style={{ color: p.role === 'owner' ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>{p.role}</strong>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button onClick={() => fetchProjectDetail(p.id)} className="btn-primary" style={{ height: '30px', padding: '0 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', boxShadow: '0 2px 8px var(--color-primary-glow)' }}>
                            Open
                          </button>
                          {p.role === "owner" && (
                            <button onClick={() => handleDeleteProject(p.id, p.title)} className="btn-danger-ghost" style={{ height: '30px', width: '30px', padding: 0, borderRadius: '8px' }} title="Delete Project">
                              <TrashIcon size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* VIEW 2: PROJECT DETAIL (DIAGRAMS & MEMBERS) */}
          {!loading && currentView === "project_detail" && projectDetail && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
              
              {/* Left Column: Drawings inside Project */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Diagram Creation Form */}
                <div className="modal-metric-card" style={{ padding: '16px 18px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: 'var(--color-primary)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Create New Drawing</h4>
                  <form onSubmit={handleCreateDiagram} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input
                      type="text"
                      value={newDiagramTitle}
                      onChange={(e) => setNewDiagramTitle(e.target.value)}
                      placeholder="PFD Title (e.g. Cooling Loop)"
                      className="form-input"
                      style={{ width: '100%', height: '34px', fontSize: '12px' }}
                      required
                    />
                    <input
                      type="text"
                      value={newDiagramDesc}
                      onChange={(e) => setNewDiagramDesc(e.target.value)}
                      placeholder="Description (optional)"
                      className="form-input"
                      style={{ width: '100%', height: '34px', fontSize: '12px' }}
                    />
                    <button type="submit" disabled={isCreatingDiagram} className="btn-primary" style={{ height: '32px', padding: '0 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', alignSelf: 'flex-end' }}>
                      {isCreatingDiagram ? 'Creating...' : 'Create PFD'}
                    </button>
                  </form>
                </div>

                {/* Diagrams List */}
                <div>
                  <h4 style={{ margin: '0 0 12px 0', color: 'var(--color-primary)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Drawing List</h4>
                  {projectDetail.diagrams.length === 0 ? (
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', textAlign: 'center', padding: '24px', backgroundColor: 'var(--color-surface-hover)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                      No drawings inside this project. Create one above to get started.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {projectDetail.diagrams.map(d => {
                        const lock = diagramLocks[d.id];
                        const isLockedByMe = lock && lock.user_id === currentUser?.id;
                        const isLockedByOther = lock && lock.user_id !== currentUser?.id;
                        
                        return (
                          <div key={d.id} className="modal-list-item" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            margin: '0'
                          }}>
                            <div style={{ flexGrow: 1, marginRight: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <h5 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: '700' }}>{d.title}</h5>
                                {lock ? (
                                  <span style={{
                                    fontSize: '9px',
                                    fontWeight: '700',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: isLockedByMe ? '#ECFDF5' : '#FFFBEB',
                                    color: isLockedByMe ? '#10B981' : '#D97706',
                                    border: isLockedByMe ? '1px solid #A7F3D0' : '1px solid #FDE68A'
                                  }}>
                                    {isLockedByMe ? '🟢 Editing' : `🔒 Locked: ${lock.username}`}
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: '9px',
                                    fontWeight: '700',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: 'var(--color-bg-canvas)',
                                    color: 'var(--color-text-secondary)',
                                    border: '1px solid var(--color-border)'
                                  }}>
                                    Available
                                  </span>
                                )}
                              </div>
                              <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                                {d.description || 'No description'}
                              </p>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                              <button onClick={() => handleLoadDiagram(d.id)} className="btn-primary" style={{ height: '28px', padding: '0 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                                Open
                              </button>
                              
                              {/* Override lock release button */}
                              {isLockedByOther && isOwnerOfActiveProject && (
                                <button onClick={() => handleForceReleaseLock(d.id)} className="btn-secondary" style={{ height: '28px', padding: '0 8px', borderRadius: '6px', fontSize: '11px', color: '#EF4444', backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' }} title="Force release user edit lock">
                                  Release Lock
                                </button>
                              )}
 
                              <button onClick={() => handleExportDiagramAsFile(d)} className="btn-secondary" style={{ height: '28px', padding: '0 8px', borderRadius: '6px', fontSize: '11px', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }} title="Download .wlf">
                                <ExportIcon size={10} />
                              </button>
 
                              {(isOwnerOfActiveProject || d.user_id === currentUser?.id) && (
                                <button onClick={() => handleDeleteDiagram(d.id, d.title)} className="btn-danger-ghost" style={{ height: '28px', width: '28px', padding: 0, borderRadius: '6px' }}>
                                  <TrashIcon size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
 
              {/* Right Column: Members & Sharing Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Project Members List */}
                <div className="modal-metric-card" style={{ padding: '16px 18px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: 'var(--color-primary)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Project Team</h4>
                  
                  {/* Add Member Form (Owners only) */}
                  {isOwnerOfActiveProject && (
                    <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                      <input
                        type="text"
                        value={inviteUsername}
                        onChange={(e) => setInviteUsername(e.target.value)}
                        placeholder="Add member by username"
                        className="form-input"
                        style={{ flexGrow: 1, height: '32px', fontSize: '12px' }}
                        required
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="form-select"
                        style={{ height: '32px', padding: '0 4px', fontSize: '12px' }}
                      >
                        <option value="member">Member</option>
                        <option value="owner">Owner</option>
                      </select>
                      <button type="submit" disabled={isAddingMember} className="btn-primary" style={{ height: '32px', padding: '0 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                        {isAddingMember ? 'Adding...' : 'Add'}
                      </button>
                    </form>
                  )}
 
                  {/* Team Members List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {projectDetail.members.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: '6px', backgroundColor: 'var(--color-bg-canvas)', border: '1px solid var(--color-border)' }}>
                        <div>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: m.user_id === currentUser?.id ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
                            {m.username} {m.user_id === currentUser?.id && "(You)"}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginLeft: '6px', textTransform: 'uppercase', fontWeight: '700' }}>
                            ({m.role})
                          </span>
                        </div>
 
                        {/* Owner actions (promote role, remove member) */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {isOwnerOfActiveProject && m.user_id !== currentUser?.id && (
                            <button onClick={() => handleToggleMemberRole(m.id, m.role)} className="btn-secondary" style={{ height: '22px', fontSize: '9px', padding: '0 6px', borderRadius: '4px' }}>
                              {m.role === 'owner' ? 'Demote' : 'Promote'}
                            </button>
                          )}
                          {(isOwnerOfActiveProject || m.user_id === currentUser?.id) && (
                            <button onClick={() => handleRemoveMember(m.id, m.username)} className="btn-danger-ghost" style={{ height: '22px', padding: '0 6px', borderRadius: '4px', fontSize: '9px' }}>
                              {m.user_id === currentUser?.id ? 'Leave' : 'Remove'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
 
                {/* Share Token Link Generator */}
                {isOwnerOfActiveProject && (
                  <div className="modal-metric-card" style={{ padding: '16px 18px' }}>
                    <h4 style={{ margin: '0 0 12px 0', color: 'var(--color-primary)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Generate Invitation Token</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '10px', fontWeight: '700', marginBottom: '4px' }}>Link Password (optional)</label>
                        <input
                          type="password"
                          value={sharePassword}
                          onChange={(e) => setSharePassword(e.target.value)}
                          placeholder="Leave empty for public link"
                          className="form-input"
                          style={{ width: '100%', height: '32px', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '10px', fontWeight: '700', marginBottom: '4px' }}>Expiry Duration</label>
                        <select
                          value={inviteDuration}
                          onChange={(e) => setInviteDuration(e.target.value)}
                          className="form-select"
                          style={{ width: '100%', height: '32px', fontSize: '12px' }}
                        >
                          <option value={1}>1 Hour</option>
                          <option value={12}>12 Hours</option>
                          <option value={24}>24 Hours (1 Day)</option>
                          <option value={168}>168 Hours (1 Week)</option>
                        </select>
                      </div>
                      <button onClick={handleGenerateShareToken} disabled={isGeneratingLink} className="btn-primary" style={{ height: '32px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', width: '100%' }}>
                        {isGeneratingLink ? 'Generating...' : 'Generate Token Link'}
                      </button>
 
                      {inviteTokenLink && (
                        <div style={{ marginTop: '8px' }}>
                          <label style={{ display: 'block', color: 'var(--color-primary)', fontSize: '10px', fontWeight: '750', marginBottom: '4px' }}>Copy Shareable Link:</label>
                          <textarea
                            readOnly
                            value={inviteTokenLink}
                            onClick={(e) => e.target.select()}
                            style={{ width: '100%', height: '54px', fontSize: '11px', backgroundColor: 'var(--color-bg-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '6px', resize: 'none', fontFamily: 'monospace' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
 
              </div>
 
            </div>
          )}
 
        </div>
      </div>
    </div>
  );
};

export default ProjectManagerModal;
