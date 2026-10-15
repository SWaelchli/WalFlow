import { useState, useEffect } from 'react';

/** Which dialog is open (one at a time), their open/close handlers, and Escape to close. */
export function useModalManager() {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [helpModalInitialTab, setHelpModalInitialTab] = useState('shortcuts');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProjectManagerModalOpen, setIsProjectManagerModalOpen] = useState(false);
  const [isAdminHubOpen, setIsAdminHubOpen] = useState(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState(false);
  const [isNewDrawingModalOpen, setIsNewDrawingModalOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [projectManagerProjectId, setProjectManagerProjectId] = useState(null);

  const handleOpenHelpModal = (tab = 'shortcuts') => {
    setHelpModalInitialTab(tab);
    setIsHelpModalOpen(true);
    setActiveModal('help');
  };

  const handleCloseModal = () => {
    setIsHelpModalOpen(false);
    setIsAuthModalOpen(false);
    setIsProjectManagerModalOpen(false);
    setIsAdminHubOpen(false);
    setIsSaveAsModalOpen(false);
    setIsNewDrawingModalOpen(false);
    setActiveModal(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && activeModal) {
        handleCloseModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeModal]);

  const handleOpenAdminHub = () => {
    setIsAdminHubOpen(true);
    setActiveModal('adminHub');
  };

  const handleOpenAuthModal = () => {
    setIsAuthModalOpen(true);
    setActiveModal('auth');
  };

  const handleOpenSaveAsModal = () => {
    setIsSaveAsModalOpen(true);
    setActiveModal('saveAs');
  };

  const handleOpenNewDrawingModal = () => {
    setIsNewDrawingModalOpen(true);
    setActiveModal('newDrawing');
  };

  const handleOpenProjectManagerModal = (projectId = null) => {
    setProjectManagerProjectId(projectId);
    setIsProjectManagerModalOpen(true);
    setActiveModal('projectManager');
  };

  return {
    isHelpModalOpen, helpModalInitialTab, isAuthModalOpen, isProjectManagerModalOpen, isAdminHubOpen,
    isSaveAsModalOpen, isNewDrawingModalOpen, activeModal, projectManagerProjectId,
    handleOpenHelpModal, handleCloseModal, handleOpenAdminHub, handleOpenAuthModal,
    handleOpenSaveAsModal, handleOpenNewDrawingModal, handleOpenProjectManagerModal,
  };
}

export default useModalManager;
