/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  setPermissionRationalePresenter,
  type PermissionPurpose,
} from "@shared/permissions";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

interface PendingRationale {
  purpose: PermissionPurpose;
  resolve: (allowed: boolean) => void;
}

/**
 * PermissionRationaleHost
 *
 * Single app-wide dialog that explains a sensitive permission *before* the OS
 * prompt is shown. It states the permission name, the feature that needs it and
 * what the data is used for, and stays on screen until the user picks "Allow"
 * or "Not now" — it never auto-dismisses and cannot be dismissed by tapping the
 * backdrop.
 *
 * Mounted once in the root layout. The helpers in `@shared/permissions` show it
 * through `requestWithPurpose()`, which calls the OS API only after "Allow".
 * @returns The rationale dialog (rendered only while a request is pending).
 */
const PermissionRationaleHost = () => {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingRationale | null>(null);
  // Mirrors `pending` outside of render so the presenter and the unmount
  // cleanup can always settle the promise a caller is awaiting.
  const pendingRef = useRef<PendingRationale | null>(null);

  const settle = useCallback((allowed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(allowed);
  }, []);

  useEffect(() => {
    setPermissionRationalePresenter(
      (purpose) =>
        new Promise<boolean>((resolve) => {
          // A new request supersedes any still-open one, which is declined.
          pendingRef.current?.resolve(false);
          const next = { purpose, resolve };
          pendingRef.current = next;
          setPending(next);
        }),
    );
    return () => {
      setPermissionRationalePresenter(null);
      const current = pendingRef.current;
      pendingRef.current = null;
      current?.resolve(false);
    };
  }, []);

  const handleAllow = useCallback(() => settle(true), [settle]);
  const handleDecline = useCallback(() => settle(false), [settle]);

  if (!pending) {
    return null;
  }

  const purposeKey = `permissions.purposes.${pending.purpose}`;

  return (
    <Modal
      {...testProps("dialog_permission_rationale")}
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // Android back button counts as "Not now"; there is no backdrop press
      // handler, so the explanation cannot be dismissed accidentally.
      onRequestClose={handleDecline}
    >
      <View style={globalStyles.modalOverlay}>
        <View style={globalStyles.modalContent}>
          <Text
            {...testProps("text_title_permission_rationale")}
            style={globalStyles.modalTitle}
          >
            {t(`${purposeKey}.title`)}
          </Text>

          <RationaleRow
            label={t("permissions.labels.permission")}
            value={t(`${purposeKey}.permissions`)}
            qaId="permission"
          />
          <RationaleRow
            label={t("permissions.labels.feature")}
            value={t(`${purposeKey}.feature`)}
            qaId="feature"
          />
          <RationaleRow
            label={t("permissions.labels.purpose")}
            value={t(`${purposeKey}.purpose`)}
            qaId="purpose"
          />

          <Text
            {...testProps("text_note_permission_rationale")}
            style={styles.note}
          >
            {t("permissions.optionalNote")}
          </Text>

          <View style={globalStyles.modalActions}>
            <TouchableOpacity
              {...testProps("button_decline_permission_rationale")}
              style={[styles.button, styles.declineButton]}
              onPress={handleDecline}
            >
              <Text style={styles.declineText}>{t("permissions.notNow")}</Text>
            </TouchableOpacity>

            <View style={styles.buttonGap} />

            <TouchableOpacity
              {...testProps("button_allow_permission_rationale")}
              style={[styles.button, styles.allowButton]}
              onPress={handleAllow}
            >
              <Text style={styles.allowText}>{t("permissions.allow")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

/**
 * One labelled line of the explanation (permission / feature / purpose).
 * @param props - Row label, its value, and a QA id suffix.
 * @returns Labelled paragraph inside the rationale dialog.
 */
const RationaleRow = ({
  label,
  value,
  qaId,
}: {
  label: string;
  value: string;
  qaId: string;
}) => (
  <View {...testProps(`view_${qaId}_permission_rationale`)} style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text
      {...testProps(`text_${qaId}_permission_rationale`)}
      style={styles.rowValue}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  row: {
    marginBottom: tokens.spacing._10,
  },
  rowLabel: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_secondary,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },
  note: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    marginTop: tokens.spacing._5,
    marginBottom: tokens.spacing._15,
  },
  button: {
    flex: 1,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.spacing._10,
  },
  buttonGap: {
    width: tokens.spacing._10,
  },
  declineButton: {
    backgroundColor: tokens.colors.bg2,
  },
  declineText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
  },
  allowButton: {
    backgroundColor: tokens.colors.primary,
  },
  allowText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.white,
    textAlign: "center",
  },
});

export default PermissionRationaleHost;
