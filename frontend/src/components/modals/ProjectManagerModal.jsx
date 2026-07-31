import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { FILE_FORMAT_VERSION, APP_VERSION, FILE_EXTENSION } from '../../constants';

const ProjectManagerModal = ({
  isOpen,
  onClose,
  currentFlowData,
  onLoadDiagram,
  activeProject,
  setActiveProject
}) => {
  const { isAuthenticated } = useAuth();
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Save active canvas state
  const [saveTitle, setSaveTitle] = useState('My Hydraulic System');
  const [saveDescription, setSaveDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchDiagrams = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/diagrams');
      setDiagrams(response.data);
    } catch {
      setError('Failed to fetch cloud diagrams from server.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchDiagrams();
    }
  }, [isOpen, isAuthenticated, fetchDiagrams]);

  if (!isOpen) return null;

  const handleSaveCurrentDiagram = async (e) => {
    e.preventDefault();
    const cleanTitle = typeof saveTitle === 'string' ? saveTitle.trim() : '';
    if (!cleanTitle) {
      alert('Please enter a project title.');
      return;
    }

    setIsSaving(true);
    try {
      const formattedData = {
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
        title: cleanTitle,
        description: saveDescription.trim(),
        diagram_data: JSON.stringify(formattedData)
      });

      if (setActiveProject) {
        setActiveProject({
          id: response.data.id,
          title: response.data.title,
          description: response.data.description,
          updated_at: response.data.updated_at
        });
      }

      setSaveTitle('My Hydraulic System');
      setSaveDescription('');
      fetchDiagrams();
      alert(`Project '${response.data.title}' saved to cloud DB & active project auto-sync enabled!`);
    } catch {
      alert('Failed to save diagram to server.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadDiagram = async (diagramId) => {
    try {
      const response = await axios.get(`/api/diagrams/${diagramId}`);
      const parsedData = JSON.parse(response.data.diagram_data);
      
      // Auto-upgrade diagram version in cloud DB if it differs
      if (parsedData.app_version !== APP_VERSION) {
        parsedData.app_version = APP_VERSION;
        try {
          await axios.put(`/api/diagrams/${diagramId}`, {
            title: response.data.title,
            description: response.data.description || '',
            diagram_data: JSON.stringify(parsedData)
          });
        } catch (err) {
          console.warn('Failed to auto-upgrade diagram version in DB:', err);
        }
      }

      if (setActiveProject) {
        setActiveProject({
          id: response.data.id,
          title: response.data.title,
          description: response.data.description,
          updated_at: response.data.updated_at
        });
      }
      onLoadDiagram(parsedData);
      onClose();
    } catch {
      alert('Failed to load diagram from server.');
    }
  };

  const handleUnlinkProject = () => {
    if (setActiveProject) {
      setActiveProject(null);
    }
  };

  const handleDeleteDiagram = async (diagramId, title) => {
    if (!window.confirm(`Are you sure you want to delete '${title}' from the server?`)) return;
    try {
      await axios.delete(`/api/diagrams/${diagramId}`);
      if (activeProject && activeProject.id === diagramId && setActiveProject) {
        setActiveProject(null);
      }
      setDiagrams(prev => prev.filter(d => d.id !== diagramId));
    } catch {
      alert('Failed to delete diagram.');
    }
  };

  const handleExportDiagramAsFile = async (diagram) => {
    try {
      let dataStr = diagram.diagram_data;
      if (!dataStr) {
        const response = await axios.get(`/api/diagrams/${diagram.id}`);
        dataStr = response.data.diagram_data;
      }
      if (!dataStr) {
        alert('Diagram data is empty or unavailable.');
        return;
      }

      // Pretty-print JSON with 2-space indentation to match Navbar Export
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
      const cleanName = diagram.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
      link.download = `${cleanName}${FILE_EXTENSION}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export diagram file.');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(26, 40, 41, 0.75)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "var(--font-sans, 'Inter', sans-serif)"
    }}>
      <div style={{
        backgroundColor: '#1A2829',
        color: '#ffffff',
        border: '1px solid #395253',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '85vh',
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
          `}
        </style>

        {/* Header */}
        <div style={{
          padding: '24px 28px 16px 28px',
          borderBottom: '1px solid #263839',
          backgroundColor: '#223233',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #FA8507 0%, #E07600 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              boxShadow: '0 4px 12px rgba(250, 133, 7, 0.3)'
            }}>
              ☁️
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: '700' }}>
                Cloud PFD Manager
              </h3>
              <p style={{ margin: '2px 0 0 0', color: '#B8C9C8', fontSize: '12px' }}>
                Save & load diagrams from database server
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#B8C9C8',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#263839'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#B8C9C8'; }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Active Project Callout (if linked) */}
          {activeProject ? (
            <div style={{
              backgroundColor: '#263839',
              border: '1px solid #FA8507',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#FA8507', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                  🟢 Active Cloud Project Auto-Sync Enabled
                </div>
                <div style={{ color: '#ffffff', fontSize: '15px', fontWeight: '700' }}>
                  {activeProject.title}
                </div>
                {activeProject.description && (
                  <div style={{ color: '#B8C9C8', fontSize: '12px', marginTop: '2px' }}>
                    {activeProject.description}
                  </div>
                )}
              </div>
              <button
                onClick={handleUnlinkProject}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #395253',
                  backgroundColor: '#1A2829',
                  color: '#B8C9C8',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.color = '#EF4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#395253'; e.currentTarget.style.color = '#B8C9C8'; }}
              >
                Detach Cloud Sync
              </button>
            </div>
          ) : null}

          {/* Section 1: Save Active Canvas to DB */}
          <div style={{ backgroundColor: '#223233', border: '1px solid #395253', borderRadius: '12px', padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 14px 0', color: '#FA8507', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💾</span> Save Active Canvas to Server Database
            </h4>
            <form onSubmit={handleSaveCurrentDiagram} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', color: '#B8C9C8', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Title</label>
                  <input
                    type="text"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #395253',
                      backgroundColor: '#1A2829',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#FA8507'}
                    onBlur={(e) => e.target.style.borderColor = '#395253'}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#B8C9C8', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Description (optional)</label>
                  <input
                    type="text"
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    placeholder="e.g. 2-pump high pressure loop"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #395253',
                      backgroundColor: '#1A2829',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#FA8507'}
                    onBlur={(e) => e.target.style.borderColor = '#395253'}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  alignSelf: 'flex-end',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #FA8507 0%, #E07600 100%)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(250, 133, 7, 0.3)'
                }}
              >
                {isSaving ? 'Saving...' : 'Save to Cloud DB'}
              </button>
            </form>
          </div>

          {/* Section 2: Saved Projects List */}
          <div>
            <h4 style={{ margin: '0 0 14px 0', color: '#FA8507', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📁</span> Saved Projects on Server
            </h4>
            
            {loading ? (
              <div style={{ color: '#B8C9C8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>⌛ Loading cloud projects...</div>
            ) : error ? (
              <div style={{ color: '#FCA5A5', fontSize: '13px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: '10px', border: '1px solid #EF4444' }}>{error}</div>
            ) : diagrams.length === 0 ? (
              <div style={{ color: '#B8C9C8', fontSize: '13px', textAlign: 'center', padding: '28px', backgroundColor: '#223233', borderRadius: '12px', border: '1px dashed #395253' }}>
                No saved cloud projects yet. Use the form above to save your first PFD diagram.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {diagrams.map(diagram => (
                  <div key={diagram.id} style={{
                    backgroundColor: '#223233',
                    border: '1px solid #395253',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <h5 style={{ margin: '0 0 4px 0', color: '#ffffff', fontSize: '14px', fontWeight: '700' }}>
                        {diagram.title}
                      </h5>
                      <div style={{ color: '#B8C9C8', fontSize: '12px' }}>
                        {diagram.description || 'No description'} • Updated {new Date(diagram.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleLoadDiagram(diagram.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #FA8507 0%, #E07600 100%)',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(250, 133, 7, 0.3)'
                        }}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleExportDiagramAsFile(diagram)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid #4A6768',
                          backgroundColor: '#263839',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                        title="Download as .wlf"
                      >
                        💾 .wlf
                      </button>
                      <button
                        onClick={() => handleDeleteDiagram(diagram.id, diagram.title)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #EF4444',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          color: '#EF4444',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProjectManagerModal;
