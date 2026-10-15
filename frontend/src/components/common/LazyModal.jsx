import { Suspense, lazy, useState } from 'react';

// Dialogs and pages that most sessions never open are loaded on first use (F0-07: one 1.5 MB bundle).
export const HelpInfoModal = lazy(() => import('../modals/HelpInfoModal'));
export const LoginModal = lazy(() => import('../modals/LoginModal'));
export const ProjectManagerModal = lazy(() => import('../modals/ProjectManagerModal'));
export const AdminSetupModal = lazy(() => import('../modals/AdminSetupModal'));
export const AdminHubModal = lazy(() => import('../modals/AdminHubModal'));
export const SaveAsModal = lazy(() => import('../modals/SaveAsModal'));
export const NewDrawingModal = lazy(() => import('../modals/NewDrawingModal'));
export const PipeClassesPage = lazy(() => import('../../pages/PipeClassesPage'));

/**
 * Renders a lazy modal. Nothing is loaded until the modal is first opened; after that it stays mounted
 * (and keeps its state) exactly like an eagerly imported one.
 */
export function LazyModal({ as, isOpen, ...props }) {
  const [wasOpen, setWasOpen] = useState(!!isOpen);
  if (isOpen && !wasOpen) setWasOpen(true);
  if (!wasOpen) return null;
  const Modal = as;
  return (
    <Suspense fallback={null}>
      <Modal isOpen={isOpen} {...props} />
    </Suspense>
  );
}

/** Suspense wrapper for a lazy page (shows a plain placeholder while the chunk loads). */
export function LazyPage({ children }) {
  return (
    <Suspense fallback={<div role="status" style={{ padding: '24px', color: 'var(--color-text-muted, #587071)' }}>Loading…</div>}>
      {children}
    </Suspense>
  );
}
