import { notify, confirmDialog, askName } from '../utils/dialogs';

/** Same functions as utils/dialogs, for components that prefer a hook. */
export function useDialog() {
  return { notify, confirm: confirmDialog, askName };
}
