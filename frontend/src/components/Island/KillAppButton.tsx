import React from 'react';
import { Power } from 'lucide-react';

/**
 * Temporary dev kill switch. Asks the backend to free the Aether ports
 * (8765/1420/8089), close the overlay, and exit — same as stop_aether.bat.
 * Remove this component together with the KILL_APP handler.
 */
export const KillAppButton: React.FC<{ onKill: () => void }> = ({ onKill }) => (
  <button
    onClick={onKill}
    className="rounded-md bg-[#442726]/70 p-1.5 text-[#ff99a4] transition hover:bg-[#5b2f2d] hover:text-[var(--aether-text-1)]"
    title="Kill Aether (dev): free ports 8765/1420/8089 and stop the app"
  >
    <Power size={14} />
  </button>
);
