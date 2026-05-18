import { useCallback, useState } from "react";
import ConfirmActionModal from "../components/saved-results/ConfirmActionModal.jsx";

/**
 * @returns {{
 *   confirm: (opts: {
 *     title: string,
 *     message?: string,
 *     confirmLabel?: string,
 *     cancelLabel?: string,
 *     destructive?: boolean,
 *     onConfirm: () => void | Promise<void>,
 *   }) => void,
 *   modalElement: import("react").ReactNode,
 *   busy: boolean,
 * }}
 */
export function useConfirmAction() {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    if (!busy) setConfig(null);
  }, [busy]);

  const confirm = useCallback((opts) => {
    setConfig(opts);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!config?.onConfirm) return;
    setBusy(true);
    try {
      await config.onConfirm();
      setConfig(null);
    } finally {
      setBusy(false);
    }
  }, [config]);

  const modalElement = config ? (
    <ConfirmActionModal
      open
      title={config.title}
      message={config.message}
      confirmLabel={config.confirmLabel}
      cancelLabel={config.cancelLabel}
      destructive={config.destructive}
      busy={busy}
      onConfirm={handleConfirm}
      onCancel={close}
    />
  ) : null;

  return { confirm, modalElement, busy };
}
