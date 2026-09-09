import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import type { ButtonVariant } from './Button';

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
}

/**
 * Drop-in replacement for `window.confirm(...)`: `if (!(await requestConfirm({...}))) return;`
 * resolves the same way — true on confirm, false on cancel/dismiss — but renders a real dialog.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const requestConfirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    setOptions(null);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }

  const node = options ? (
    <ConfirmDialog
      open
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      confirmVariant={options.confirmVariant}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return [requestConfirm, node];
}
