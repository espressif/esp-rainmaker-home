/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation } from "react-i18next";
import { tokens } from "@shared/theme/tokens";
import ConfirmationDialog from "./ConfirmationDialog";

export interface UnsavedChangesDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Called when the user confirms discarding their edits. */
  onDiscard: () => void;
  /** Called when the user chooses to keep editing. */
  onKeepEditing: () => void;
  /** QA automation identifier. */
  qaId?: string;
}

/**
 * Standard discard-confirmation dialog for screens with unsaved edits.
 * Pairs with `useUnsavedChangesGuard`; uses the shared
 * `layout.shared.unsavedChanges*` strings.
 */
export default function UnsavedChangesDialog({
  open,
  onDiscard,
  onKeepEditing,
  qaId,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <ConfirmationDialog
      open={open}
      title={t("layout.shared.unsavedChangesTitle")}
      description={t("layout.shared.unsavedChangesDescription")}
      confirmText={t("layout.shared.discardChanges")}
      cancelText={t("layout.shared.keepEditing")}
      onConfirm={onDiscard}
      onCancel={onKeepEditing}
      confirmColor={tokens.colors.red}
      qaId={qaId}
    />
  );
}
