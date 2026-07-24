import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { FILE_FORMAT_VERSION, APP_VERSION, FILE_EXTENSION } from '../../constants';

const ProjectManagerModal = ({ isOpen, onClose, currentFlowData, onLoadDiagram }) => {
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
    if (!saveTitle.trim()) {
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
        globalSettings: currentFlowData.globalSettings || {}
      };

      await axios.post('/api/diagrams', {
        title: saveTitle.strip ? saveTitle.strip() : saveTitle.trim(),
        description: saveDescription.trim(),
        diagram_data: JSON.stringify(formattedData)
      });

      setSaveTitle('My Hydraulic System');
      setSaveDescription('');
      fetchDiagrams();
      alert('Diagram saved successfully to server database!');
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
      onLoadDiagram(parsedData);
      onClose();
    } catch {
      alert('Failed to load diagram from server.');
    }
  };

  const handleDeleteDiagram = async (diagramId, title) => {
    if (!window.confirm(`Are you sure you want to delete '${title}' from the server?`)) return;
    try {
      await axios.delete(`/api/diagrams/${diagramId}`);
      setDiagrams(prev => prev.filter(d => d.id !== diagramId));
    } catch {
      alert('Failed to delete diagram.');
    }
  };

  const handleExportDiagramAsFile = (diagram) => {
    try {
      const blob = new Blob([diagram.diagram_data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanName = diagram.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
      link.download = `${cleanName}${FILE_EXTENSION}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed.');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#1E293B',
        border: '1px solid #334155',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, color: '#F8FAFC', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>☁️</span> Cloud PFD Manager
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Section 1: Save Active Canvas to DB */}
          <div style={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '12px', padding: '16px 20px' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#FA8507', fontSize: '14px', fontWeight: '700' }}>
              💾 Save Active Canvas to Server Database
            </h4>
            <form onSubmit={handleSaveCurrentDiagram} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94A3B8', fontSize: '11px', fontWeight: '600', marginBottom: '4px' }}>Title</label>
                  <input
                    type="text"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      backgroundColor: '#1E293B',
                      color: '#F8FAFC',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#94A3B8', fontSize: '11px', fontWeight: '600', marginBottom: '4px' }}>Description (optional)</label>
                  <input
                    type="text"
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    placeholder="e.g. 2-pump high pressure loop"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      backgroundColor: '#1E293B',
                      color: '#F8FAFC',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  alignSelf: 'flex-end',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#FA8507',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: isSaving ? 'not-allowed' : 'pointer'
                }}
              >
                {isSaving ? 'Saving...' : 'Save to Cloud DB'}
              </button>
            </form>
          </div>

          {/* Section 2: Saved Projects List */}
          <div>
            <h4 style={{ margin: '0 0 12px 0', color: '#F8FAFC', fontSize: '14px', fontWeight: '700' }}>
              📁 Saved Projects on Server
            </h4>
            
            {loading ? (
              <div style={{ color: '#94A3B8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>⌛ Loading cloud projects...</div>
            ) : error ? (
              <div style={{ color: '#FCA5A5', fontSize: '13px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>{error}</div>
            ) : diagrams.length === 0 ? (
              <div style={{ color: '#64748B', fontSize: '13px', textAlign: 'center', padding: '24px', backgroundColor: '#0F172A', borderRadius: '12px', border: '1px dashed #334155' }}>
                No saved cloud projects yet. Use the form above to save your first PFD diagram.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {diagrams.map(diagram => (
                  <div key={diagram.id} style={{
                    backgroundColor: '#0F172A',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <h5 style={{ margin: '0 0 4px 0', color: '#F8FAFC', fontSize: '14px', fontWeight: '700' }}>
                        {diagram.title}
                      </h5>
                      <div style={{ color: '#94A3B8', fontSize: '12px' }}>
                        {diagram.description || 'No description'} • Updated {new Date(diagram.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleLoadDiagram(diagram.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#FA8507',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer'
                        }}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleExportDiagramAsFile(diagram)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #475569',
                          backgroundColor: '#1E293B',
                          color: '#CBD5E1',
                          fontSize: '12px',
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
                          borderRadius: '6px',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          backgroundColor: 'transparent',
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
