import { PaletteIcon, BookIcon, GearIcon, FolderIcon } from '../symbols/IconLibrary';

/** Side panes in rail order. `id` is the tab id the Sidebar renders. */
export const SIDE_PANES = [
  { id: 'components', title: 'Components', Icon: PaletteIcon },
  { id: 'examples', title: 'Examples', Icon: BookIcon },
  { id: 'drawings', title: 'Drawings', Icon: FolderIcon },
  { id: 'settings', title: 'Settings', Icon: GearIcon },
];
