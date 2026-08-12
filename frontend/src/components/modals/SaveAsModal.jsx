import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { CrossIcon } from '../symbols/IconLibrary';

const SaveAsModal = ({ isOpen, onClose, onSaveAs, currentTitle = "" }) => {
  const { isAuthenticated } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destType, setDestType] = useState("standalone"); // "standalone" | "project" | "new_project"
  
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTitle(currentTitle ? `${currentTitle} (Copy)` : "Untitled Copy");
      setDescription("");
      setDestType("standalone");
      setError("");
      
      if (isAuthenticated) {
        setLoading(true);
        axios.get('/api/projects')
          .then(res => {
            setProjects(res.data);
            if (res.data.length > 0) {
              setSelectedProjectId(res.data[0].id);
            }
          })
          .catch(() => {
            setError("Failed to load your project folders.");
          })
          .finally(() => {
            setLoading(false);
          });
      }
    }
  }, [isOpen, currentTitle, isAuthenticated]);



  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError("");
    try {
      let targetProjectId = null;

      // Handle new project folder creation on the fly
      if (destType === "new_project") {
        if (!newProjectTitle.trim()) {
          setError("Please specify a title for the new project folder.");
          setSaving(false);
          return;
        }
        const projRes = await axios.post('/api/projects', {
          title: newProjectTitle.trim(),
          description: "Created via Save As"
        });
        targetProjectId = projRes.data.id;
      } else if (destType === "project") {
        if (!selectedProjectId) {
          setError("Please select a project folder.");
          setSaving(false);
          return;
        }
        targetProjectId = selectedProjectId;
      }

      await onSaveAs({
        title: title.trim(),
        description: description.trim(),
        project_id: targetProjectId
      });
      onClose();
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail);
      } else {
        setError("Failed to save drawing copy.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div className="modal-header">
          <h3 className="modal-title">
            Save Drawing As
          </h3>
          <button onClick={onClose} className="modal-close-btn" title="Close">
            <CrossIcon size={16} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{
              color: 'var(--color-danger)',
              fontSize: '12px',
              padding: '10px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              borderRadius: '8px',
              border: '1px solid var(--color-danger)'
            }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Drawing Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Compressor Loop A"
              className="form-input"
              style={{ width: '100%', height: '36px', fontSize: '13px' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Overview of this configuration (optional)"
              className="form-input"
              style={{ width: '100%', height: '36px', fontSize: '13px' }}
            />
          </div>

          {isAuthenticated && (
            <div>
              <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Save Destination</label>
              <select
                value={destType}
                onChange={(e) => setDestType(e.target.value)}
                className="form-select"
                style={{ width: '100%', height: '36px', fontSize: '13px', marginBottom: '12px' }}
              >
                <option value="standalone">Standalone Drawing (No Project)</option>
                <option value="project">Inside Existing Project</option>
                <option value="new_project">Inside Brand New Project</option>
              </select>

              {loading && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Loading projects...</div>}

              {destType === "project" && projects.length === 0 && !loading && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', padding: '6px', border: '1px dashed var(--color-border)', borderRadius: '6px' }}>
                  No projects found. Choose "New Project" to create one.
                </div>
              )}

              {destType === "project" && projects.length > 0 && (
                <div>
                  <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '10px', fontWeight: '700', marginBottom: '4px' }}>Select Project</label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="form-select"
                    style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {destType === "new_project" && (
                <div>
                  <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '10px', fontWeight: '700', marginBottom: '4px' }}>New Project Folder Title</label>
                  <input
                    type="text"
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    placeholder="e.g. Phase 2 Expansion"
                    className="form-input"
                    style={{ width: '100%', height: '36px', fontSize: '13px' }}
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '12px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
              style={{
                height: '36px',
                padding: '0 18px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                boxShadow: '0 2px 8px var(--color-primary-glow)'
              }}
            >
              {saving ? "Saving..." : "Save Copy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaveAsModal;
