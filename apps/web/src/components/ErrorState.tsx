import { AlertTriangle } from 'lucide-react';

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  );
}
