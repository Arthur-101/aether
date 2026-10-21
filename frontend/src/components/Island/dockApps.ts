import {
  AudioLines,
  CodeXml,
  Folders,
  Gamepad2,
  Globe,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';

export interface DockApp {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  running?: boolean;
}

/** Visual placeholders until Phase 2 wires live Windows taskbar pins. */
export const PLACEHOLDER_DOCK_APPS: DockApp[] = [
  { id: 'browser', name: 'Browser', icon: Globe, color: '#38bdf8' },
  { id: 'files', name: 'Files', icon: Folders, color: '#f0c36a', running: true },
  { id: 'terminal', name: 'Terminal', icon: SquareTerminal, color: '#a3e635' },
  { id: 'music', name: 'Music', icon: AudioLines, color: '#1ed760', running: true },
  { id: 'games', name: 'Games', icon: Gamepad2, color: '#c084fc' },
  { id: 'code', name: 'Code', icon: CodeXml, color: '#60a5fa' },
];
