import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { CrossIcon } from '../symbols/IconLibrary';

const NewDrawingModal = ({ isOpen, onClose, onCreateNew }) => {
  const { isAuthenticated } = useAuth();
  const [title, setTitle] = useState("Untitled Drawing");
  const [description, setDescription] = useState("");
  const [destType, setDestType] = useState("draft"); // "draft" | "standalone" | "project" | "new_project"
  
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTitle("Untitled Drawing");
      setDescription("");
      setDestType(isAuthenticated ? "standalone" : "draft");
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
  }, [isOpen, isAuthenticated]);



  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    setError("");
    try {
      let targetProjectId = null;
      let isDraft = destType === "draft";

      if (!isDraft && isAuthenticated) {
        if (destType === "new_project") {
          if (!newProjectTitle.trim()) {
            setError("Please specify a title for the new project folder.");
            setCreating(false);
            return;
          }
          const projRes = await axios.post('/api/projects', {
            title: newProjectTitle.trim(),
            description: "Created via New Drawing"
          });
          targetProjectId = projRes.data.id;
        } else if (destType === "project") {
          if (!selectedProjectId) {
            setError("Please select a project folder.");
            setCreating(false);
            return;
          }
          targetProjectId = selectedProjectId;
        }
      }

      await onCreateNew({
        title: title.trim(),
        description: description.trim(),
        project_id: targetProjectId,
        isDraft
      });
      onClose();
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail);
      } else {
        setError("Failed to create new drawing.");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div className="modal-header">
          <h3 className="modal-title">
            New PFD Drawing
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
              placeholder="e.g. Lube Oil Loop"
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
              placeholder="Short drawing description (optional)"
              className="form-input"
              style={{ width: '100%', height: '36px', fontSize: '13px' }}
            />
          </div>

          {isAuthenticated ? (
            <div>
              <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Creation Destination</label>
              <select
                value={destType}
                onChange={(e) => setDestType(e.target.value)}
                className="form-select"
                style={{ width: '100%', height: '36px', fontSize: '13px', marginBottom: '12px' }}
              >
                <option value="draft">Temporary Local Draft (No Cloud Sync)</option>
                <option value="standalone">Standalone Cloud Drawing (No Project Folder)</option>
                <option value="project">Inside Existing Project Folder</option>
                <option value="new_project">Inside Brand New Project Folder</option>
              </select>

              {loading && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Loading projects...</div>}

              {destType === "project" && projects.length === 0 && !loading && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', padding: '6px', border: '1px dashed var(--color-border)', borderRadius: '6px' }}>
                  No projects found. Select "New Project" to create one.
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
                    placeholder="e.g. Hydraulic Loop Phase C"
                    className="form-input"
                    style={{ width: '100%', height: '36px', fontSize: '13px' }}
                    required
                  />
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-canvas)', padding: '10px 12px', borderRadius: '8px', border: '1px dashed var(--color-border)' }}>
              Note: You are currently offline or a Guest. Your new drawing will be saved as a temporary local draft in browser cache. Login to sync with the cloud database.
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
              disabled={creating}
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
              {creating ? "Creating..." : "Create Drawing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewDrawingModal;
