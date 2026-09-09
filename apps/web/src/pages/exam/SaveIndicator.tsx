import { AlertCircle, Check, Loader2 } from 'lucide-react';

export type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export function SaveIndicator({ state }: { state: SaveState }) {
  switch (state) {
    case 'saving':
      return (
        <span className="save-indicator unsaved">
          <Loader2 size={13} className="spin" /> Saving…
        </span>
      );
    case 'saved':
      return (
        <span className="save-indicator saved">
          <Check size={13} /> Saved
        </span>
      );
    case 'unsaved':
      return (
        <span className="save-indicator unsaved">
          <AlertCircle size={13} /> Unsaved changes
        </span>
      );
    case 'error':
      return (
        <span className="save-indicator error">
          <AlertCircle size={13} /> Failed to save — will retry on next edit
        </span>
      );
    default:
      return <span className="save-indicator" />;
  }
}
