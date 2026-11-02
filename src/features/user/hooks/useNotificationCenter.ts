/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";

// Hooks
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { useTranslation } from "react-i18next";
import type { ESPCDFGroupSharingRequest } from "@store";
import { ESPCDFGroupSharingStatus } from "@store";
import type { SharingItem } from "@src/types/global";
import { bootstrapMatterFabricsForGroups } from "@features/matter/utils/matterCommissioningHelpers";

type ActionLoadingEntry = {
  acceptLoading?: boolean;
  declineLoading?: boolean;
};

function stableRequestId(item: { id: string }): string {
  return item.id;
}

/**
 * Manages notification center state and related actions.
 */
export const useNotificationCenter = () => {
  const { store, syncHomeWithNodes } = useCDF();
  const toast = useToast();
  const { t } = useTranslation();

  const user = store?.userStore.user;
  const [sharingList, setSharingList] = useState<SharingItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingById, setActionLoadingById] = useState<
    Record<string, ActionLoadingEntry>
  >({});

  useEffect(() => {
    loadSharingRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []);

  const mapGroupSharingRequestToSharingItem = (
    request: ESPCDFGroupSharingRequest,
  ): SharingItem => {
    const status: SharingItem["status"] =
      request.status === ESPCDFGroupSharingStatus.rejected
        ? "declined"
        : request.status;

    return {
      type: "group",
      id: request.id,
      request,
      groupIds: request.groupIds,
      primaryUsername: request.primaryUsername,
      timestamp: request.timestamp,
      status,
      accept: async () => {
        await request.accept();
      },
      decline: async () => {
        await request.decline();
      },
    };
  };

  const loadSharingRequests = async () => {
    setIsLoading(true);
    try {
      const groupSharingRequests =
        await user?.getReceivedGroupSharingRequests();

      const requests = groupSharingRequests?.data ?? [];
      const sharingItems = requests
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(mapGroupSharingRequestToSharingItem);

      setSharingList(sharingItems);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      console.error("Error loading sharing requests:", error);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  const handleAccept = async (item: SharingItem, accept: boolean) => {
    const key = stableRequestId(item);

    setActionLoadingById((prev) => ({
      ...prev,
      [key]: accept
        ? { acceptLoading: true, declineLoading: false }
        : { acceptLoading: false, declineLoading: true },
    }));

    try {
      if (accept) {
        await item.accept();
        toast.showSuccess(t("user.notifications.sharingRequestAccepted"));
        // Lists the accepted home. Its nodes load, and get live updates, when
        // the user opens it (loadHomeNodes). A failed refresh only logs.
        await syncHomeWithNodes({ force: true }).catch((refreshError) =>
          console.warn("[NotificationCenter] home refresh after accept failed:", refreshError),
        );
        // Shared Matter homes additionally need fabric credentials (user NOC)
        // on this phone. Fire-and-forget: never blocks or fails the accept.
        if (store) {
          void bootstrapMatterFabricsForGroups(
            store,
            item.groupIds ?? [],
            "share accepted",
          );
        }
      } else {
        await item.decline();
        toast.showSuccess(t("user.notifications.sharingRequestDeclined"));
      }
      setSharingList((prev) =>
        prev.map((item) =>
          item.id === key
            ? { ...item, status: accept ? "accepted" : "declined" }
            : item
        )
      );
      await loadSharingRequests();
    } catch (error) {
      // A failed accept may still consume the request server-side (e.g. a room
      // invite for a user who already has home access is rejected only at
      // accept time) — refresh the list so a dead request doesn't linger.
      await loadSharingRequests();
      toast.showError(t("user.notifications.sharingRequestUpdateFailed"));
      console.error("Error updating request:", error);
    } finally {
      setActionLoadingById((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const getActionLoadingForRequest = useCallback(
    (item: SharingItem) => {
      const key = stableRequestId(item);
      const s = actionLoadingById[key];
      const acceptLoading = Boolean(s?.acceptLoading);
      const declineLoading = Boolean(s?.declineLoading);
      return {
        acceptLoading,
        declineLoading,
        loading: acceptLoading || declineLoading,
      };
    },
    [actionLoadingById]
  );

  return {
    sharingList,
    isLoading,
    formatTimestamp,
    handleAccept,
    getActionLoadingForRequest,
  };
};
