/**
 * The commands every page has: the Tools and Help menus. A page definition appends them to its own commands
 * (`hideShared` on the definition drops the ones that make no sense there). Entry fields: see commandList.js.
 */
import { BookIcon, FolderIcon, CrownIcon, HelpIcon, KeyboardIcon, InfoIcon } from '../components/symbols/IconLibrary';
import { defineCommands, isMod } from './define';

export const SHARED_COMMANDS = defineCommands([
  // Tools
  // A toggle: checked while the Catalogue page is open; running it there goes back to the drawing
  { id: 'tools.catalogue', label: 'Catalogue', menu: 'Tools', group: 'pages', icon: BookIcon,
    isEnabled: () => true, checked: (ctx) => ctx.page === 'catalogue', run: (ctx) => ctx.actions.toggleCatalogue() },
  { id: 'tools.projects', label: 'Manage projects…', menu: 'Tools', group: 'pages', icon: FolderIcon,
    isEnabled: (ctx) => (ctx.isAuthenticated ? true : 'Sign in to manage projects'),
    run: (ctx) => ctx.actions.openProjects() },
  { id: 'tools.admin', label: 'Admin hub…', menu: 'Tools', group: 'pages', icon: CrownIcon,
    isVisible: (ctx) => !!ctx.isAdmin,
    isEnabled: () => true, run: (ctx) => ctx.actions.openAdminHub() },

  // Help
  { id: 'help.guide', label: 'User guide', menu: 'Help', group: 'help', icon: BookIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.openHelp('guide') },
  { id: 'help.shortcuts', label: 'Keyboard shortcuts', menu: 'Help', group: 'help', icon: KeyboardIcon,
    shortcut: { keys: ['Shift', '?'], display: '?', match: (e) => e.key === '?' && !isMod(e) },
    help: 'Open this Help screen (Esc closes it)',
    isEnabled: () => true, run: (ctx) => ctx.actions.openHelp('shortcuts') },
  { id: 'help.model', label: 'Model & limits', menu: 'Help', group: 'help', icon: HelpIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.openHelp('model') },
  { id: 'help.about', label: 'About WalFlow', menu: 'Help', group: 'about', icon: InfoIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.openHelp('about') },
]);
