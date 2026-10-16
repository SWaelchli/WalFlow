import React from 'react';
// Per-icon imports keep the bundle and test start-up small (the package index holds ~1,500 icons).
import { PlusIcon as PhPlus } from '@phosphor-icons/react/Plus';
import { CloudIcon as PhCloud } from '@phosphor-icons/react/Cloud';
import { UploadSimpleIcon as PhUpload } from '@phosphor-icons/react/UploadSimple';
import { DownloadSimpleIcon as PhDownload } from '@phosphor-icons/react/DownloadSimple';
import { TrashIcon as PhTrash } from '@phosphor-icons/react/Trash';
import { CrownIcon as PhCrown } from '@phosphor-icons/react/Crown';
import { SignOutIcon as PhSignOut } from '@phosphor-icons/react/SignOut';
import { SignInIcon as PhSignIn } from '@phosphor-icons/react/SignIn';
import { PaletteIcon as PhPalette } from '@phosphor-icons/react/Palette';
import { StackIcon as PhStack } from '@phosphor-icons/react/Stack';
import { QuestionIcon as PhQuestion } from '@phosphor-icons/react/Question';
import { CheckIcon as PhCheck } from '@phosphor-icons/react/Check';
import { XIcon as PhX } from '@phosphor-icons/react/X';
import { PlayIcon as PhPlay } from '@phosphor-icons/react/Play';
import { InfoIcon as PhInfo } from '@phosphor-icons/react/Info';
import { UserIcon as PhUser } from '@phosphor-icons/react/User';
import { BookOpenIcon as PhBookOpen } from '@phosphor-icons/react/BookOpen';
import { KeyboardIcon as PhKeyboard } from '@phosphor-icons/react/Keyboard';
import { FolderIcon as PhFolder } from '@phosphor-icons/react/Folder';
import { MagnifyingGlassIcon as PhMagnifyingGlass } from '@phosphor-icons/react/MagnifyingGlass';
import { GlobeIcon as PhGlobe } from '@phosphor-icons/react/Globe';
import { LightningIcon as PhLightning } from '@phosphor-icons/react/Lightning';
import { CircleNotchIcon as PhCircleNotch } from '@phosphor-icons/react/CircleNotch';
import { FlameIcon as PhFlame } from '@phosphor-icons/react/Flame';
import { LockIcon as PhLock } from '@phosphor-icons/react/Lock';
import { LockOpenIcon as PhLockOpen } from '@phosphor-icons/react/LockOpen';
import { FolderOpenIcon as PhFolderOpen } from '@phosphor-icons/react/FolderOpen';
import { CopyIcon as PhCopy } from '@phosphor-icons/react/Copy';
import { PencilSimpleIcon as PhPencil } from '@phosphor-icons/react/PencilSimple';
import { WarningIcon as PhWarning } from '@phosphor-icons/react/Warning';
import { CheckCircleIcon as PhCheckCircle } from '@phosphor-icons/react/CheckCircle';
import { ArrowsClockwiseIcon as PhArrowsClockwise } from '@phosphor-icons/react/ArrowsClockwise';
import { FloppyDiskIcon as PhFloppyDisk } from '@phosphor-icons/react/FloppyDisk';
import { FileTextIcon as PhFileText } from '@phosphor-icons/react/FileText';
import { GearSixIcon as PhGear } from '@phosphor-icons/react/GearSix';
import { NotePencilIcon as PhNotePencil } from '@phosphor-icons/react/NotePencil';
import { RulerIcon as PhRuler } from '@phosphor-icons/react/Ruler';
import { ClipboardTextIcon as PhClipboardText } from '@phosphor-icons/react/ClipboardText';
import { ConfettiIcon as PhConfetti } from '@phosphor-icons/react/Confetti';
import { CaretDownIcon as PhCaretDown } from '@phosphor-icons/react/CaretDown';
import { CaretRightIcon as PhCaretRight } from '@phosphor-icons/react/CaretRight';
import { ArrowUpIcon as PhArrowUp } from '@phosphor-icons/react/ArrowUp';
import { ArrowDownIcon as PhArrowDown } from '@phosphor-icons/react/ArrowDown';
import { ArrowsDownUpIcon as PhArrowsDownUp } from '@phosphor-icons/react/ArrowsDownUp';
import { ArrowRightIcon as PhArrowRight } from '@phosphor-icons/react/ArrowRight';
import { ArrowLeftIcon as PhArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import { ArrowCounterClockwiseIcon as PhArrowCounterClockwise } from '@phosphor-icons/react/ArrowCounterClockwise';
import { ArrowClockwiseIcon as PhArrowClockwise } from '@phosphor-icons/react/ArrowClockwise';
import { ArrowsLeftRightIcon as PhArrowsLeftRight } from '@phosphor-icons/react/ArrowsLeftRight';
import { DotsSixVerticalIcon as PhDotsSixVertical } from '@phosphor-icons/react/DotsSixVertical';
import { CircleIcon as PhCircle } from '@phosphor-icons/react/Circle';
import { TrayArrowDownIcon as PhTrayArrowDown } from '@phosphor-icons/react/TrayArrowDown';

/*
 * WalFlow icon set. Every UI icon goes through this file so the app uses one
 * family (Phosphor, regular weight) at consistent sizes. Do not use emoji as icons.
 * Sizes: 12 (inline in dense text), 14 (buttons/tabs), 16 (default), 20+ (modal headers).
 */
const wrap = (PhIcon, defaults = {}) => {
  const Icon = ({ size = 16, color = 'currentColor', weight = defaults.weight || 'regular', style, ...props }) => (
    <PhIcon
      className={defaults.className}
      aria-hidden={props['aria-label'] ? undefined : true}
      focusable="false"
      {...props}
      size={size}
      color={color}
      weight={weight}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    />
  );
  return Icon;
};

export const PlusIcon = wrap(PhPlus, { weight: 'bold' });
export const CloudIcon = wrap(PhCloud);
export const ExportIcon = wrap(PhUpload);
export const ImportIcon = wrap(PhDownload);
export const DownloadIcon = wrap(PhDownload);
export const TrashIcon = wrap(PhTrash);
export const CrownIcon = wrap(PhCrown);
export const SignOutIcon = wrap(PhSignOut);
export const SignInIcon = wrap(PhSignIn);
export const PaletteIcon = wrap(PhPalette);
export const CaseIcon = wrap(PhStack);
export const HelpIcon = wrap(PhQuestion);
export const CheckIcon = wrap(PhCheck, { weight: 'bold' });
export const CrossIcon = wrap(PhX);
export const PlayIcon = wrap(PhPlay, { weight: 'fill' });
export const InfoIcon = wrap(PhInfo);
export const UserIcon = wrap(PhUser);
export const BookIcon = wrap(PhBookOpen);
export const KeyboardIcon = wrap(PhKeyboard);
export const FolderIcon = wrap(PhFolder);
export const SearchIcon = wrap(PhMagnifyingGlass);
export const GlobeIcon = wrap(PhGlobe);
export const BoltIcon = wrap(PhLightning);
export const SpinnerIcon = wrap(PhCircleNotch, { className: 'spinner-loader', weight: 'bold' });
export const FlameIcon = wrap(PhFlame);
export const LockIcon = wrap(PhLock);
export const UnlockIcon = wrap(PhLockOpen);
export const FolderOpenIcon = wrap(PhFolderOpen);
export const CopyIcon = wrap(PhCopy);
export const EditIcon = wrap(PhPencil);
export const WarningIcon = wrap(PhWarning);
export const CheckCircleIcon = wrap(PhCheckCircle);
export const RefreshIcon = wrap(PhArrowsClockwise);
export const SaveIcon = wrap(PhFloppyDisk);
export const FileIcon = wrap(PhFileText);
export const GearIcon = wrap(PhGear);
export const NoteEditIcon = wrap(PhNotePencil);
export const RulerIcon = wrap(PhRuler);
export const ClipboardIcon = wrap(PhClipboardText);
export const ConfettiIcon = wrap(PhConfetti);
export const CaretDownIcon = wrap(PhCaretDown, { weight: 'bold' });
export const CaretRightIcon = wrap(PhCaretRight, { weight: 'bold' });
export const ArrowUpIcon = wrap(PhArrowUp, { weight: 'bold' });
export const ArrowDownIcon = wrap(PhArrowDown, { weight: 'bold' });
export const SortIcon = wrap(PhArrowsDownUp);
export const ArrowRightIcon = wrap(PhArrowRight);
export const ArrowLeftIcon = wrap(PhArrowLeft);
export const ResetIcon = wrap(PhArrowCounterClockwise);
export const RotateIcon = wrap(PhArrowClockwise, { weight: 'bold' });
export const SwapIcon = wrap(PhArrowsLeftRight);
export const DragHandleIcon = wrap(PhDotsSixVertical, { weight: 'bold' });
export const DotIcon = wrap(PhCircle, { weight: 'fill' });
export const InboxIcon = wrap(PhTrayArrowDown);
