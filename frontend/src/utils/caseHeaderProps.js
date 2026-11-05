import { clickableRowProps } from './a11yProps';

/**
 * Props for a case column header in the Cases, Relief and Measurements tabs. A header that can switch the case
 * (not active, and a handler exists) is focusable, has a tooltip and a pointer cursor; any other header is inert.
 * `draggable` headers keep a grab cursor so the drag stays discoverable. Merge `style` into the header's own style.
 */
export function caseHeaderProps({ caseId, caseName, isActive, onSelectCase, draggable = false }) {
  const canSwitch = Boolean(onSelectCase) && !isActive;
  const cursor = canSwitch ? 'pointer' : (draggable ? 'grab' : 'default');
  if (!canSwitch) return { style: { cursor } };
  return {
    ...clickableRowProps,
    onClick: () => onSelectCase(caseId),
    title: `Switch to case "${caseName}"`,
    style: { cursor },
  };
}
