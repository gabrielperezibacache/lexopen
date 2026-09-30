"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Accessible confirm-before-destructive. Prefer over `window.confirm`
 * so focus stays in-app and copy goes through i18n.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-[var(--muted)]">{description}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          type="button"
          loading={busy}
          onClick={() => void onConfirm()}
        >
          {confirmLabel || t("common.delete")}
        </Button>
      </div>
    </Dialog>
  );
}
