/** Helpers shared by the command definition files (the drawing's list, the shared Tools and Help commands, the pages). */

export const isMod = (e) => e.ctrlKey || e.metaKey;
export const key = (e) => e.key.toLowerCase();

/** Fills the defaults of a command entry: visible to everyone, in no canvas context menu. */
export const defineCommands = (list) => list.map((c) => ({ isVisible: () => true, contexts: [], ...c }));
