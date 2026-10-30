import React, { useState, useRef, useEffect, useCallback } from 'react';
import walflowLogo from '../../assets/Logo_WalFlow.svg';
import { useAuth } from '../../hooks/useAuth';
import { APP_VERSION, RELEASE_STAGE } from '../../constants';
import { describeLockState } from '../../utils/lockState';
import { COMMANDS, MENU_ORDER, formatShortcut, runCommand } from '../../commands';
import { CaretDownIcon, CaretRightIcon, CheckIcon, CloudIcon, CrownIcon, FileIcon, LockIcon, SignInIcon, SignOutIcon } from '../symbols/IconLibrary';

/** Save state shown next to the drawing name: a dot tone + a short label. */
function describeSaveState({ saveStatus, isCloudDoc, isLockedByOther, lastSavedTimestamp }) {
  if (isLockedByOther || saveStatus === 'locked') return { tone: 'warn', label: 'Read-only' };
  if (saveStatus === 'saving_cloud' || saveStatus === 'saving_local') return { tone: 'warn', label: 'Saving…' };
  if (saveStatus === 'error') return { tone: 'bad', label: 'Not saved' };
  if (saveStatus === 'saved_cloud') return { tone: 'ok', label: lastSavedTimestamp ? `Saved to cloud ${lastSavedTimestamp}` : 'Saved to cloud' };
  return { tone: 'idle', label: isCloudDoc ? 'Saved in this browser' : 'Draft in this browser' };
}

/** Short lock chip text for narrow windows: the holder's name for another user's lock, else a short word. */
function shortLockLabel(lockState) {
  if (lockState.kind === 'mine') return 'Editing';
  if (lockState.kind === 'my_other_tab') return 'Other tab';
  return lockState.holder || 'Locked';
}

const itemsOf =(menuEl) => (menuEl
  ? [...menuEl.querySelectorAll('[data-menu-item]')].filter((el) => el.closest('[role="menu"]') === menuEl)
  : []);

/** The visible commands of one menu, in list order, with `separator` markers between groups. */
function menuEntries(menu, ctx) {
  const entries = [];
  let lastGroup = null;
  COMMANDS.filter((c) => c.menu === menu && c.isVisible(ctx)).forEach((command) => {
    if (lastGroup !== null && command.group !== lastGroup) entries.push({ separator: `${menu}/${command.group}` });
    lastGroup = command.group;
    entries.push({ command });
  });
  return entries;
}

/** Account area: Sign in, or the user name with a small menu holding Sign out. */
function AccountMenu({ onOpenAuthModal, onLogoutClear }) {
  const { currentUser, isAuthenticated, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    rootRef.current?.querySelector('[role="menuitem"]')?.focus();
    const onOutside = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onOutside, true);
    return () => document.removeEventListener('pointerdown', onOutside, true);
  }, [open]);

  if (!isAuthenticated) {
    return (
      <button type="button" className="btn-secondary menubar-signin" onClick={onOpenAuthModal}>
        <SignInIcon size={12} />
        Sign in
      </button>
    );
  }

  const signOut = () => {
    setOpen(false);
    logout();
    if (onLogoutClear) onLogoutClear();
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab' && open) {
      setOpen(false);
    }
  };

  return (
    <div className="menubar-account" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="menubar-item menubar-user"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account"
        onClick={() => setOpen((v) => !v)}
      >
        {isAdmin && <CrownIcon size={12} color="var(--color-text-secondary)" aria-label="Administrator" />}
        <span className="menubar-user-name">{currentUser?.username}</span>
        <CaretDownIcon size={10} />
      </button>
      {open && (
        <div className="menu menu-right" role="menu" aria-label="Account">
          <button type="button" role="menuitem" className="menu-item menu-item-danger" onClick={signOut}>
            <SignOutIcon size={16} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function MenuBar({
  ctx,
  onOpenAuthModal,
  onLogoutClear,
  activeProject,
  activeDiagram,
  saveStatus = 'saved_local',
  lastSavedTimestamp = null,
  isLockedByOther = false,
  lockInfo = null,
}) {
  const { currentUser, isAuthenticated, adminStatus } = useAuth();
  const [openMenu, setOpenMenu] = useState(null); // index into MENU_ORDER
  const [openSub, setOpenSub] = useState(null); // id of the item whose submenu is open
  const [tabStop, setTabStop] = useState(0); // roving tabindex: the one trigger Tab reaches
  const barRef = useRef(null);
  const triggerRefs = useRef([]);
  const focusRequest = useRef(null); // { sub: bool, where: 'first' | 'last' } applied after the next render

  const closeAll = useCallback(() => { setOpenMenu(null); setOpenSub(null); }, []);

  useEffect(() => {
    const req = focusRequest.current;
    if (!req || openMenu === null) return;
    focusRequest.current = null;
    const menuEl = req.sub
      ? barRef.current?.querySelector(`[data-submenu-of="${openSub}"]`)
      : barRef.current?.querySelector('[data-menu-level="top"]');
    const items = itemsOf(menuEl);
    (req.where === 'last' ? items[items.length - 1] : items[0])?.focus();
  }, [openMenu, openSub]);

  useEffect(() => {
    if (openMenu === null) return undefined;
    const onOutside = (e) => { if (barRef.current && !barRef.current.contains(e.target)) closeAll(); };
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('blur', closeAll);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('blur', closeAll);
    };
  }, [openMenu, closeAll]);

  const openTop = (index, where = 'first') => {
    focusRequest.current = { sub: false, where };
    setOpenSub(null);
    setOpenMenu(index);
  };
  const focusTrigger = (index) => triggerRefs.current[index]?.focus();

  const moveTop = (from, step) => {
    const next = (from + step + MENU_ORDER.length) % MENU_ORDER.length;
    if (openMenu !== null) openTop(next);
    else focusTrigger(next);
  };

  const onTriggerKeyDown = (e, index) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); moveTop(index, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); moveTop(index, -1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); openTop(index, 'first'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); openTop(index, 'last'); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (openMenu === index) closeAll(); else openTop(index, 'first'); }
    else if (e.key === 'Escape' && openMenu !== null) { e.preventDefault(); closeAll(); }
  };

  const onItemKeyDown = (e, index, entry) => {
    const menuEl = e.currentTarget.closest('[role="menu"]');
    const inSub = menuEl?.hasAttribute('data-submenu-of');
    const items = itemsOf(menuEl);
    const at = items.indexOf(e.currentTarget);
    const focusAt = (i) => items[(i + items.length) % items.length]?.focus();
    const hasSub = !inSub && !!entry.command.children;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(at + 1); break;
      case 'ArrowUp': e.preventDefault(); focusAt(at - 1); break;
      case 'Home': e.preventDefault(); focusAt(0); break;
      case 'End': e.preventDefault(); focusAt(items.length - 1); break;
      case 'ArrowRight':
        e.preventDefault();
        if (hasSub) { focusRequest.current = { sub: true, where: 'first' }; setOpenSub(entry.command.id); }
        else if (!inSub) moveTop(index, 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (inSub) {
          const parent = barRef.current?.querySelector(`[data-menu-item][data-command-id="${openSub}"]`);
          setOpenSub(null);
          parent?.focus();
        } else moveTop(index, -1);
        break;
      case 'Escape':
        e.preventDefault();
        if (inSub) {
          const parent = barRef.current?.querySelector(`[data-menu-item][data-command-id="${openSub}"]`);
          setOpenSub(null);
          parent?.focus();
        } else { closeAll(); focusTrigger(index); }
        break;
      case 'Tab': closeAll(); break;
      default:
    }
  };

  const runAndClose = (index, run) => {
    closeAll();
    focusTrigger(index);
    run();
  };

  const renderMenu = (menu, index) => {
    const entries = menuEntries(menu, ctx);
    return (
      <div className="menu" role="menu" aria-label={menu} data-menu-level="top">
        {entries.map((entry) => {
          if (entry.separator) return <div key={entry.separator} role="separator" className="menu-separator" />;
          const { command } = entry;
          const enabled = command.isEnabled(ctx);
          const disabled = enabled !== true;
          const hasChecked = !!command.checked;
          const isChecked = hasChecked && !!command.checked(ctx);
          const Icon = command.icon;
          const hasSub = !!command.children;
          const shortcut = formatShortcut(command.shortcut);
          const badge = command.id === 'tools.admin' ? adminStatus?.pendingCount : 0;
          return (
            <div key={command.id} role="none" className="menu-item-anchor">
              <button
                type="button"
                role={hasChecked ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={hasChecked ? isChecked : undefined}
                aria-disabled={disabled || undefined}
                aria-haspopup={hasSub ? 'menu' : undefined}
                aria-expanded={hasSub ? openSub === command.id : undefined}
                title={disabled ? enabled : undefined}
                tabIndex={-1}
                data-menu-item=""
                data-command-id={command.id}
                className={`menu-item${command.danger ? ' menu-item-danger' : ''}`}
                onMouseEnter={() => setOpenSub(hasSub && !disabled ? command.id : null)}
                onKeyDown={(e) => onItemKeyDown(e, index, entry)}
                onClick={() => {
                  if (hasSub) {
                    if (!disabled) { focusRequest.current = { sub: true, where: 'first' }; setOpenSub(command.id); }
                    return;
                  }
                  runAndClose(index, () => runCommand(command.id, ctx));
                }}
              >
                <span className="menu-item-icon">
                  {hasChecked ? (isChecked && <CheckIcon size={14} />) : (Icon && <Icon size={16} />)}
                </span>
                <span className="menu-item-label">{command.label}</span>
                {badge > 0 && <span className="menu-item-badge" aria-label={`${badge} pending registration requests`}>{badge}</span>}
                {hasSub ? <CaretRightIcon size={10} /> : shortcut && <kbd>{shortcut}</kbd>}
              </button>
              {hasSub && openSub === command.id && !disabled && (
                <div className="menu menu-sub" role="menu" aria-label={command.label} data-submenu-of={command.id}>
                  {command.children(ctx).map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={!!child.checked}
                      tabIndex={-1}
                      data-menu-item=""
                      className="menu-item"
                      onKeyDown={(e) => onItemKeyDown(e, index, entry)}
                      onClick={() => runAndClose(index, () => child.run())}
                    >
                      <span className="menu-item-icon">{child.checked && <CheckIcon size={14} />}</span>
                      <span className="menu-item-label">{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const saveState = describeSaveState({ saveStatus, isCloudDoc: !!activeDiagram, isLockedByOther, lastSavedTimestamp });
  const lockState = activeDiagram && isAuthenticated ? describeLockState(lockInfo, currentUser ? currentUser.id : null) : null;
  const lockEditing = lockState && lockState.kind === 'mine';
  const docName = activeDiagram
    ? `${activeProject ? `${activeProject.title} / ` : ''}${activeDiagram.title}`
    : 'Local draft';

  return (
    <div className="shell-menubar">
      <div className="menubar-left">
        <button
          type="button"
          className="menubar-brand"
          title="About WälFlow"
          aria-label={`About WälFlow, version ${APP_VERSION}`}
          onClick={() => runCommand('help.about', ctx)}
        >
          <img src={walflowLogo} alt="" className="menubar-logo" />
          <span className="menubar-version">v{APP_VERSION} {RELEASE_STAGE ? `• ${RELEASE_STAGE}` : ''}</span>
        </button>

        <div role="menubar" aria-label="Main menu" className="menubar-menus" ref={barRef}>
          {MENU_ORDER.map((menu, index) => (
            <div key={menu} className="menubar-menu" role="none">
              <button
                ref={(el) => { triggerRefs.current[index] = el; }}
                type="button"
                role="menuitem"
                className="menubar-item"
                aria-haspopup="menu"
                aria-expanded={openMenu === index}
                tabIndex={index === tabStop ? 0 : -1}
                onFocus={() => setTabStop(index)}
                onClick={() => (openMenu === index ? closeAll() : openTop(index, 'first'))}
                onMouseEnter={() => { if (openMenu !== null && openMenu !== index) { setOpenSub(null); setOpenMenu(index); } }}
                onKeyDown={(e) => onTriggerKeyDown(e, index)}
              >
                {menu}
              </button>
              {openMenu === index && renderMenu(menu, index)}
            </div>
          ))}
        </div>
      </div>

      <div className="menubar-doc" title={`${docName}, ${saveState.label}`}>
        {activeDiagram ? <CloudIcon size={14} color="var(--color-text-secondary)" /> : <FileIcon size={14} color="var(--color-text-secondary)" />}
        <span className="menubar-doc-name">
          {activeDiagram && activeProject && <span className="menubar-doc-project">{activeProject.title} / </span>}
          {activeDiagram ? activeDiagram.title : 'Local draft'}
        </span>
        <span role="status" className="menubar-save">
          <span aria-hidden="true" className={`save-dot save-dot-${saveState.tone}`} />
          {saveState.label}
        </span>
        {lockState && lockState.kind !== 'free' && (
          <span
            role="status"
            title={lockState.label}
            aria-label={lockState.label}
            className={`lock-chip${lockEditing ? ' lock-chip-mine' : ''}`}
          >
            <LockIcon size={12} />
            <span className="lock-chip-label">{lockState.label}</span>
            <span className="lock-chip-short" aria-hidden="true">{shortLockLabel(lockState)}</span>
          </span>
        )}
      </div>

      <div className="menubar-right">
        <AccountMenu onOpenAuthModal={onOpenAuthModal} onLogoutClear={onLogoutClear} />
      </div>
    </div>
  );
}
