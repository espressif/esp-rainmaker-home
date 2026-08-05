/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { TFunction } from "i18next";
import type { ESPCDFGroup } from "@store";
import { ESPCDFGroupSharingRequest } from "@store";
import type { GroupSharedUser } from "@src/types/global";
import { SUCESS, ERROR_CODES_MAP } from "@shared/utils/constants";
import {
  getRemainingDays,
  isRequestExpired,
  formatExpirationMessage,
  sortByExpirationDate,
} from "@features/group/utils/dateUtils";
import { generateRandomId } from "@shared/utils/common";
import {
  validateGroupSharingInvite,
  normalizeGroupSharingInviteForApi,
} from "@features/group/utils/settingsHelpers";
import { useCDF } from "@shared/hooks/useCDF";
import { getFeatures } from "@config/features.config";
import { getResolvedActiveSdk, isRmneoStackSdkId } from "@config/sdk.config";
import { hasGroupLevelAccess } from "@shared/utils/groupAccess";

export interface UseSettingsOptions {
  homeId: string | undefined;
  toast: {
    showSuccess: (message: string, message2?: string) => void;
    showError: (title: string, message?: string) => void;
  };
  t: TFunction;
  router: { push: (href: unknown) => void; dismiss: (count?: number) => void };
}

export interface UseSettingsResult {
  home: ESPCDFGroup | undefined;
  homeName: string;
  setHomeName: (name: string) => void;
  isPrimary: boolean;
  /** True when the viewer's access to this home is subgroup-only (room share, no group-level rights). */
  isSubgroupOnlyViewer: boolean;
  /**
   * Show the Room Management entry: primary users manage rooms; subgroup-only
   * viewers reach their shared rooms; secondary users are included when the
   * active SDK supports it (`secondaryGroupManagement` feature).
   */
  showRoomManagement: boolean;
  /**
   * Allow editing the home name: primary users always; secondary users when the
   * active SDK supports it (`secondaryGroupManagement` feature).
   */
  canRenameHome: boolean;
  /** Show the home-level sharing section; hidden for subgroup-only viewers (no group-level listing exists). */
  showGroupSharing: boolean;
  isLoading: boolean;
  showDelete: boolean;
  setShowDelete: (show: boolean) => void;
  sharedUsers: GroupSharedUser[];
  pendingUsers: GroupSharedUser[];
  sharedByUser: GroupSharedUser | null;
  isAddingUser: boolean;
  setIsAddingUser: (show: boolean) => void;
  newUserEmail: string;
  setNewUserEmail: (email: string) => void;
  makePrimary: boolean;
  setMakePrimary: (v: boolean) => void;
  transfer: boolean;
  setTransfer: (v: boolean) => void;
  transferAndAssignRole: boolean;
  setTransferAndAssignRole: (v: boolean) => void;
  isAddingUserLoading: boolean;
  removeUserLoading: boolean;
  handleHomeNameUpdate: () => Promise<void>;
  handleRemoveHome: () => void;
  handleRoom: () => void;
  handleControlGroups: () => void;
  handleAddUser: () => Promise<void>;
  handleRemoveUser: (username: string) => Promise<void>;
  handleRemovePendingUser: (username: string) => Promise<void>;
  handleCloseAddUserModal: () => void;
  handleInviteChange: (value: string, isValid: boolean) => void;
  inviteValidator: (value: string) => { isValid: boolean; error?: string };
  isInviteValid: boolean;
}

const norm = (s?: string) => (s || "").trim().toLowerCase();

/**
 * Hook that encapsulates Home Settings business logic and state.
 * Requires options (homeId, toast, t). Returns view model for the Settings screen.
 */
export function useSettings(options: UseSettingsOptions): UseSettingsResult {
  const { homeId, toast, t, router } = options;
  const { store } = useCDF();
  const user = store?.userStore?.user;
  const home = store?.groupStore?.groupsByIDMap?.[homeId as string];

  const isPrimary = home?.isPrimaryUser ?? false;
  const [homeName, setHomeName] = useState(home?.name || "");
  const [isLoading, setIsLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<GroupSharedUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<GroupSharedUser[]>([]);
  const [sharedByUser, setSharedByUser] = useState<GroupSharedUser | null>(
    null
  );
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [isAddingUserLoading, setIsAddingUserLoading] = useState(false);
  const [removeUserLoading, setRemoveUserLoading] = useState(false);
  const [makePrimary, setMakePrimary] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [transferAndAssignRole, setTransferAndAssignRole] = useState(false);
  const [isInviteValid, setIsInviteValid] = useState(false);

  const inviteValidator = validateGroupSharingInvite;

  const getSharedUsers = useCallback(async () => {
    if (!home) return;
    if (!getFeatures().groupSharing) {
      setSharedUsers([]);
      setPendingUsers([]);
      setSharedByUser(null);
      return;
    }
    // Subgroup-only viewers have no group-level access: the backend rejects the
    // home users listing, so skip the call instead of surfacing an error toast.
    if (!hasGroupLevelAccess(home.accessType)) {
      setSharedUsers([]);
      setPendingUsers([]);
      setSharedByUser(null);
      return;
    }
    try {
      const res = await home.getSharingInfo({
        metadata: false,
        withSubGroups: false,
        withParentGroups: false,
      });
      if (!res.data) return;
      const currentUsername = norm(user?.userInfo?.email);
      const primaryUsers = (res.data.primaryUsers || []).map((u) => ({
        ...u,
        username: norm(u.username),
      }));
      const secondaryUsers = (res.data.secondaryUsers || []).map((u) => ({
        ...u,
        username: norm(u.username),
      }));

      const isCurrentUserPrimary = primaryUsers.some(
        (u) => u.username === currentUsername
      );

      if (!isCurrentUserPrimary && primaryUsers.length > 0) {
        setSharedByUser({
          id: generateRandomId(),
          username: primaryUsers[0].username,
          metadata: primaryUsers[0].metadata,
        });
        setSharedUsers([]);
        setPendingUsers([]);
        return;
      }

      if (isCurrentUserPrimary) {
        const unifiedIssuedSharingInfo =
          await user?.getIssuedGroupSharingRequests();
        let allSharingRequests: ESPCDFGroupSharingRequest[] = [];
        if (unifiedIssuedSharingInfo) {
          allSharingRequests = unifiedIssuedSharingInfo.data;
        }

        const pendingRequests = allSharingRequests
          .filter((req: ESPCDFGroupSharingRequest) => {
            const isPending = req.status === "pending";
            const isForThisGroup = req.groupIds?.includes(home?.id as string);
            const isNotExpired = !isRequestExpired(req.timestamp);
            return isPending && isForThisGroup && isNotExpired;
          })
          .map((req: ESPCDFGroupSharingRequest) => ({
            id: req.id || generateRandomId(),
            username: norm(req.username),
            metadata: req.metadata || {},
            requestId: req.id,
            timestamp: req.timestamp,
            remainingDays: getRemainingDays(req.timestamp),
            expirationMessage: formatExpirationMessage(req.timestamp, t),
          }));

        setPendingUsers(sortByExpirationDate(pendingRequests));

        const acceptedUsers = [
          ...primaryUsers.filter((u) => u.username !== currentUsername),
          ...secondaryUsers.filter((u) => u.username !== currentUsername),
        ].map((u) => ({
          id: generateRandomId(),
          username: u.username,
          metadata: u.metadata,
        }));

        setSharedUsers(acceptedUsers);
        setSharedByUser(null);
      }
    } catch {
      toast.showError(t("group.errors.errorGettingSharedUsers"));
    }
  }, [home, user, t, toast]);

  const getSharedUsersRef = useRef(getSharedUsers);
  getSharedUsersRef.current = getSharedUsers;

  // Fetch sharing info only when home changes; avoid [getSharedUsers] to prevent
  // recursive calls (getSharedUsers changes when t/toast identity changes).
  useEffect(() => {
    if (home) getSharedUsersRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [home?.id]);

  useEffect(() => {
    setHomeName(home?.name || "");
  }, [home?.name]);

  const handleHomeNameUpdate = useCallback(async () => {
    if (!homeName?.trim() || !home) return;
    setIsLoading(true);
    try {
      const res: any = await home.updateGroupInfo({ groupName: homeName });
      if (res.status === SUCESS) {
        toast.showSuccess(t("group.settings.homeNameUpdatedSuccessfully"));
      } else {
        toast.showError(
          t("group.errors.homeNameUpdateFailed"),
          res.description || t("group.errors.fallback")
        );
      }
    } catch (error: any) {
      toast.showError(
        t("group.errors.homeNameUpdateFailed"),
        error.description || t("group.errors.fallback")
      );
    } finally {
      setIsLoading(false);
    }
  }, [home, homeName, t, toast]);

  const handleRemoveHome = useCallback(() => {
    if (!home) return;
    setIsLoading(true);
    const action = isPrimary ? home.delete() : home.leave();
    const successMessage = isPrimary
      ? t("group.settings.homeRemovedSuccessfully")
      : t("group.settings.homeLeftSuccessfully");
    const errorMessage = isPrimary
      ? t("group.errors.errorRemovingHome")
      : t("group.errors.errorLeavingHome");
    
    action
      .then((res: any) => {
        if (res.status === SUCESS) {
          toast.showSuccess(successMessage);
          router.dismiss(1);
        } else {
          toast.showError(res.description || errorMessage);
        }
      })
      .catch((error: any) => {
        toast.showError(errorMessage, error?.description || t("group.errors.fallback"));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [home, isPrimary, t, toast, router]);

  const handleAddUser = useCallback(async () => {
    if (!home) return;
    if (!validateGroupSharingInvite(newUserEmail).isValid) return;
    const toUserName = normalizeGroupSharingInviteForApi(newUserEmail);
    setIsAddingUserLoading(true);
    try {
      let shareResult: unknown;
      if (transferAndAssignRole) {
        shareResult = await home.transfer({
          toUserName,
          assignRoleToSelf: "secondary",
          metadata: {},
        });
      } else if (transfer) {
        shareResult = await home.transfer({
          toUserName,
          metadata: {},
        });
      } else {
        shareResult = await home.share({
          toUserName,
          makePrimary: makePrimary,
        });
      }
      // Neo share/transfer maps API `message` → CDF `description`; prefer it for toast.
      const neoShareMessage =
        isRmneoStackSdkId(getResolvedActiveSdk()) &&
        shareResult &&
        typeof shareResult === "object" &&
        "description" in shareResult &&
        typeof (shareResult as { description?: unknown }).description ===
          "string"
          ? (shareResult as { description: string }).description.trim()
          : "";
      toast.showSuccess(
        neoShareMessage ||
          (transfer || transferAndAssignRole
            ? t("group.settings.transferRequestedSuccessfully")
            : t("group.settings.sharingRequestedSuccessfully"))
      );
      setIsAddingUser(false);
      setNewUserEmail("");
      setMakePrimary(false);
      setTransfer(false);
      setTransferAndAssignRole(false);

    } catch (err: any) {
      switch (err.errorCode) {
        case ERROR_CODES_MAP.USER_NOT_FOUND:
          toast.showError(t("group.errors.userNotFound"));
          break;
        case ERROR_CODES_MAP.ADDING_SELF_NOT_ALLOWED:
          toast.showError(t("group.errors.addingSelfNotAllowed"));
          break;
        default:
          toast.showError(t("group.errors.fallback"), err.description);
          break;
      }
    } finally {
      setIsAddingUserLoading(false);
      getSharedUsersRef.current();
    }
  }, [
    home,
    newUserEmail,
    makePrimary,
    transfer,
    transferAndAssignRole,
    t,
    toast,
  ]);

  const handleRemoveUser = useCallback(
    async (username: string) => {
      if (!home) return;
      setRemoveUserLoading(true);
      try {
        await home.removeSharingFor(username);
        toast.showSuccess(t("group.settings.sharingRemovedSuccessfully"));
        getSharedUsersRef.current();
      } catch {
        toast.showError(t("group.errors.errorRemovingUser"));
      } finally {
        setRemoveUserLoading(false);
      }
    },
    [home, t, toast]
  );

  const handleRemovePendingUser = useCallback(
    async (username: string) => {
      if (!user || !home) return;
      setRemoveUserLoading(true);
      try {
        const unifiedIssuedSharingInfo =
          await user.getIssuedGroupSharingRequests();
        let allSharingRequests: ESPCDFGroupSharingRequest[] = [];
        if (unifiedIssuedSharingInfo) {
          allSharingRequests = unifiedIssuedSharingInfo.data;
        }
        const pendingRequest = allSharingRequests.find(
          (req: ESPCDFGroupSharingRequest) => {
            const isMatchingUser = norm(req.username) === norm(username);
            const isForThisGroup = req.groupIds?.includes(home?.id as string);
            const isPending = req.status === "pending";
            return isMatchingUser && isForThisGroup && isPending;
          }
        );
        if (pendingRequest) {
          await pendingRequest.remove();
          toast.showSuccess(t("group.settings.sharingRemovedSuccessfully"));
          getSharedUsersRef.current();
        } else {
          throw new Error("Pending request not found");
        }
      } catch {
        toast.showError(t("group.errors.errorRemovingUser"));
      } finally {
        setRemoveUserLoading(false);
      }
    },
    [user, home, t, toast]
  );

  const handleCloseAddUserModal = useCallback(() => {
    setIsAddingUser(false);
    setNewUserEmail("");
    setIsInviteValid(false);
    setMakePrimary(false);
    setTransfer(false);
    setTransferAndAssignRole(false);
  }, []);

  const handleInviteChange = useCallback((value: string, isValid: boolean) => {
    setNewUserEmail(value);
    setIsInviteValid(isValid);
  }, []);

  const handleRoom = useCallback(() => {
    router.push({
      pathname: "/(group)/Rooms",
      params: { id: homeId },
    } as any);
  }, [router, homeId]);

  const handleControlGroups = useCallback(() => {
    router.push({
      pathname: "/(group)/ControlGroups",
      params: { id: homeId },
    } as any);
  }, [router, homeId]);

  // Visibility for the Settings screen, derived from the viewer's access to this
  // home (known from the store — no API call needed). Subgroup-only viewers get
  // the Room Management entry (their only path to their shared rooms) and no
  // home-level sharing section (the backend rejects the group users listing).
  // Secondary users get the group-management surface (Room Management entry,
  // home rename) only where the active SDK supports it — see the
  // `secondaryGroupManagement` feature in the SDK capability map.
  const isSubgroupOnlyViewer = !hasGroupLevelAccess(home?.accessType);
  const isSecondaryManagementEnabled =
    getFeatures().secondaryGroupManagement && hasGroupLevelAccess(home?.accessType);
  const showRoomManagement =
    isPrimary || isSubgroupOnlyViewer || isSecondaryManagementEnabled;
  const showGroupSharing = !isSubgroupOnlyViewer;
  const canRenameHome = isPrimary || isSecondaryManagementEnabled;

  return {
    home,
    homeName,
    setHomeName,
    isPrimary,
    isSubgroupOnlyViewer,
    showRoomManagement,
    showGroupSharing,
    canRenameHome,
    isLoading,
    showDelete,
    setShowDelete,
    sharedUsers,
    pendingUsers,
    sharedByUser,
    isAddingUser,
    setIsAddingUser,
    newUserEmail,
    setNewUserEmail,
    makePrimary,
    setMakePrimary,
    transfer,
    setTransfer,
    transferAndAssignRole,
    setTransferAndAssignRole,
    isAddingUserLoading,
    removeUserLoading,
    handleHomeNameUpdate,
    handleRemoveHome,
    handleRoom,
    handleControlGroups,
    handleAddUser,
    handleRemoveUser,
    handleRemovePendingUser,
    handleCloseAddUserModal,
    handleInviteChange,
    inviteValidator,
    isInviteValid,
  };
}
