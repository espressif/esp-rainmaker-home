/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { TFunction } from "i18next";
import type { ESPCDFGroup } from "@store";
import { ESPCDFGroupSharingRequest } from "@store";
import type { GroupSharedUser } from "@src/types/global";
import {
  GROUP_TYPE_ROOM,
  ERROR_CODES_MAP,
  GROUP_USER_ACCESS_PRIMARY,
  DEVICE_SETTINGS_SCREEN_ROUTE,
  DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER,
  DEVICE_SETTINGS_OPEN_PICKER_ROOM,
  DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_ROOM_ID,
  DEVICE_SETTINGS_ROUTE_PARAM_DEVICE,
} from "@shared/utils/constants";
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
import { getNodeDiff, mapNodeToDisplay } from "@features/group/utils/createRoomHelpers";
import {
  reconcilePendingCreatedRoom,
  rememberPendingCreatedRoom,
} from "@features/group/utils/pendingCreatedRoom";
import { useCDF } from "@shared/hooks/useCDF";
import { fetchNodesIfEmpty } from "@store";
import type { Node } from "@src/types/global";
import { getFeatures } from "@config/features.config";
import { hasGroupLevelAccess } from "@shared/utils/groupAccess";

export interface UseCreateRoomOptions {
  homeId: string | undefined;
  roomId: string | undefined;
  /** Initial room name from the router (screen should pass a single `string` via `firstRouteParam` / navigation `params`). */
  paramRoomName: string | undefined;
  /** On create success, navigate here via `router.dismissTo` (e.g. provision room picker). */
  dismissTo?: string;
  /**
   * Provisioned device node id: forwarded to `dismissTo`; when `showSelection` is false,
   * seeds the new room’s member list.
   */
  nodeId?: string;
  /** When false, device add/remove UI is hidden (use with `nodeId` for provision). */
  showSelection?: boolean;
  /** Device endpoint param to restore when returning to device settings. */
  settingsDeviceParam?: string;
  toast: {
    showSuccess: (message: string) => void;
    showError: (message: string) => void;
  };
  t: TFunction;
  router: {
    push: (href: unknown) => void;
    replace: (href: unknown) => void;
    dismissTo: (href: unknown) => void;
    back: () => void;
  };
}

export interface UseCreateRoomResult {
  roomName: string;
  setRoomName: (name: string) => void;
  room: ESPCDFGroup | undefined;
  selectedNodes: Node[];
  availableNodes: Node[];
  isLoading: { save: boolean; delete: boolean };
  showDeleteDialog: boolean;
  setShowDeleteDialog: (show: boolean) => void;
  handleCustomRoomName: () => void;
  handleAddDevice: (node: Node) => void;
  handleRemoveDevice: (node: Node) => void;
  handleSave: () => void;
  handleUpdate: () => Promise<void>;
  handleDelete: () => void;
  confirmDelete: () => Promise<void>;
  /**
   * True when the viewer has group-level access to the home (primary/secondary).
   * Gates room deletion — subgroup-only viewers cannot delete a room. Renaming
   * is available to every viewer of the room (the backend grants
   * `group:updatesubgroup` to all three access types).
   */
  canManageRoom: boolean;
  /**
   * True only for primary viewers — adding/removing a room's devices requires
   * `group:editnodes`, which secondary and subgroup access do not carry.
   */
  canEditRoomDevices: boolean;
  /**
   * True for subgroup-only viewers on an existing room — their exit affordance
   * is leaving the room. Primary/secondary users manage rooms via delete
   * instead and never see leave.
   */
  canLeaveRoom: boolean;
  showLeaveDialog: boolean;
  setShowLeaveDialog: (show: boolean) => void;
  isLeavingRoom: boolean;
  confirmLeaveRoom: () => Promise<void>;
  /** Room (subgroup) sharing — only meaningful when `room` exists and `subGroupSharing` is enabled */
  isRoomSharePrimary: boolean;
  roomSharedUsers: GroupSharedUser[];
  roomPendingUsers: GroupSharedUser[];
  roomSharedByUser: GroupSharedUser | null;
  isAddingRoomUser: boolean;
  setIsAddingRoomUser: (show: boolean) => void;
  newRoomUserInvite: string;
  setNewRoomUserInvite: (value: string) => void;
  makeRoomUserPrimary: boolean;
  setMakeRoomUserPrimary: (v: boolean) => void;
  transferRoom: boolean;
  setTransferRoom: (v: boolean) => void;
  transferRoomAndAssignRole: boolean;
  setTransferRoomAndAssignRole: (v: boolean) => void;
  isAddingRoomUserLoading: boolean;
  removeRoomUserLoading: boolean;
  handleAddRoomUser: () => Promise<void>;
  handleRemoveRoomUser: (username: string) => Promise<void>;
  handleRemoveRoomPendingUser: (username: string) => Promise<void>;
  handleCloseAddRoomUserModal: () => void;
  handleRoomInviteChange: (value: string, isValid: boolean) => void;
  roomInviteValidator: (value: string) => { isValid: boolean; error?: string };
  isRoomInviteValid: boolean;
}

const norm = (s?: string) => (s || "").trim().toLowerCase();

/**
 * Hook that encapsulates Create Room business logic and state.
 */
export function useCreateRoom(
  options: UseCreateRoomOptions
): UseCreateRoomResult {
  const {
    homeId,
    roomId,
    paramRoomName,
    dismissTo,
    nodeId,
    showSelection = true,
    settingsDeviceParam,
    toast,
    t,
    router,
  } = options;
  const { store, syncHomeWithNodes } = useCDF();

  const [roomName, setRoomName] = useState(paramRoomName || "");
  const [selectedNodesIds, setSelectedNodesIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState({
    save: false,
    delete: false,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);

  const [isRoomSharePrimary, setIsRoomSharePrimary] = useState(false);
  const [roomSharedUsers, setRoomSharedUsers] = useState<GroupSharedUser[]>(
    []
  );
  const [roomPendingUsers, setRoomPendingUsers] = useState<GroupSharedUser[]>(
    []
  );
  const [roomSharedByUser, setRoomSharedByUser] =
    useState<GroupSharedUser | null>(null);
  const [isAddingRoomUser, setIsAddingRoomUser] = useState(false);
  const [newRoomUserInvite, setNewRoomUserInvite] = useState("");
  const [isAddingRoomUserLoading, setIsAddingRoomUserLoading] = useState(false);
  const [removeRoomUserLoading, setRemoveRoomUserLoading] = useState(false);
  const [makeRoomUserPrimary, setMakeRoomUserPrimary] = useState(false);
  const [transferRoom, setTransferRoom] = useState(false);
  const [transferRoomAndAssignRole, setTransferRoomAndAssignRole] =
    useState(false);
  const [isRoomInviteValid, setIsRoomInviteValid] = useState(false);

  const roomInviteValidator = validateGroupSharingInvite;

  const user = store?.userStore?.user;

  const home = useMemo(
    () => store?.groupStore?.groupsByIDMap?.[homeId as string],
    [store?.groupStore?.groupsByIDMap, homeId]
  );

  const room = useMemo(
    () => home?.subGroups?.find((r: ESPCDFGroup) => r.id === roomId),
    [home?.subGroups, roomId]
  );

  // Subgroup-only viewers get a read-only room screen (rename/devices/save/
  // delete not allowed).
  const canManageRoom = hasGroupLevelAccess(home?.accessType);
  const canEditRoomDevices =
    !home?.accessType || home.accessType === GROUP_USER_ACCESS_PRIMARY;
  const canLeaveRoom = !!room && !canManageRoom;

  const nodes = useMemo(
    () =>
      store?.nodeStore?.nodesList.filter((node) =>
        home?.nodeIds?.includes(node.id),
      ) ?? [],
    [store?.nodeStore?.nodesList, home?.nodeIds],
  );

  const selectedNodes: Node[] = useMemo(
    () =>
      nodes
        .filter((node) => selectedNodesIds.includes(node.id))
        .map(mapNodeToDisplay),
    [nodes, selectedNodesIds]
  );

  const availableNodes: Node[] = useMemo(() => {
    if (!showSelection) {
      return [];
    }
    return nodes
      .filter((node) => !selectedNodesIds.includes(node.id))
      .map(mapNodeToDisplay);
  }, [nodes, selectedNodesIds, showSelection]);

  useEffect(() => {
    if (home) fetchNodesIfEmpty(home);
  }, [home]);

  useEffect(() => {
    if (room) {
      if (room.name !== paramRoomName) {
        setRoomName(paramRoomName || room.name || "");
      }
      if (room.nodeIds?.length) {
        setSelectedNodesIds(room.nodeIds);
      }
    }
  }, [room, paramRoomName]);

  useEffect(() => {
    if (paramRoomName) setRoomName(paramRoomName);
  }, [paramRoomName]);

  useEffect(() => {
    if (roomId || showSelection || !nodeId) {
      return;
    }
    if (!home?.nodeIds?.includes(nodeId)) {
      return;
    }
    setSelectedNodesIds((prev) =>
      prev.includes(nodeId) ? prev : [nodeId],
    );
  }, [roomId, showSelection, nodeId, home?.nodeIds]);

  const handleCustomRoomName = useCallback(() => {
    router.push({
      pathname: "/(group)/CustomizeRoomName",
      params: {
        currentRoomName: roomName,
        id: homeId,
        roomId,
        ...(dismissTo ? { dismissTo } : {}),
        ...(nodeId ? { nodeId } : {}),
        ...(settingsDeviceParam ? { settingsDevice: settingsDeviceParam } : {}),
        ...(!showSelection ? { showSelection: "0" } : {}),
      },
    } as any);
  }, [
    router,
    roomName,
    homeId,
    roomId,
    dismissTo,
    nodeId,
    settingsDeviceParam,
    showSelection,
  ]);

  const handleAddDevice = useCallback(
    (node: Node) => {
      if (!showSelection) return;
      setSelectedNodesIds((prev) => [...prev, node.id]);
    },
    [showSelection]
  );

  const handleRemoveDevice = useCallback(
    (node: Node) => {
      if (!showSelection) return;
      setSelectedNodesIds((prev) => prev.filter((id) => id !== node.id));
    },
    [showSelection]
  );

  /**
   * After create/update, show toast and return to the caller screen (provision picker,
   * Rooms list, or previous route).
   */
  const navigateAfterRoomFlow = useCallback(
    (options: { selectedRoomId?: string }) => {
      if (dismissTo) {
        const isDeviceSettingsReturn = dismissTo === DEVICE_SETTINGS_SCREEN_ROUTE;
        router.dismissTo({
          pathname: dismissTo as any,
          params: isDeviceSettingsReturn
            ? ({
                ...(nodeId ? { id: nodeId } : {}),
                ...(settingsDeviceParam
                  ? { [DEVICE_SETTINGS_ROUTE_PARAM_DEVICE]: settingsDeviceParam }
                  : {}),
                ...(options.selectedRoomId
                  ? {
                      [DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_ROOM_ID]:
                        options.selectedRoomId,
                    }
                  : {}),
                [DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER]:
                  DEVICE_SETTINGS_OPEN_PICKER_ROOM,
              } as Record<string, string>)
            : ({
                ...(homeId ? { id: homeId } : {}),
                ...(nodeId ? { nodeId } : {}),
                ...(options.selectedRoomId
                  ? { selectedRoomId: options.selectedRoomId }
                  : {}),
              } as Record<string, string>),
        } as any);
        return;
      }
      if (homeId) {
        router.dismissTo({
          pathname: "/(group)/Rooms",
          params: { id: homeId },
        } as any);
        return;
      }
      router.back();
    },
    [router, homeId, dismissTo, nodeId, settingsDeviceParam]
  );

  const handleSave = useCallback(() => {
    if (!home) return;
    setIsLoading((prev) => ({ ...prev, save: true }));
    home
      .createSubGroup({
        name: roomName,
        nodeIds: selectedNodesIds,
        customData: {},
        type: GROUP_TYPE_ROOM,
        mutuallyExclusive: true,
      })
      .then(async (group) => {
        if (group) {
          // Rooms focus-sync can return a pre-create getGroups snapshot and wipe
          // this subgroup from the store — remember it until cloud lists it.
          if (homeId) {
            rememberPendingCreatedRoom(homeId, group);
          }
          toast.showSuccess(t("group.createRoomSuccess.title"));
          try {
            await syncHomeWithNodes(true);
            reconcilePendingCreatedRoom(homeId, store?.groupStore);
          } catch (error) {
            console.warn("[CreateRoom] sync after create failed:", error);
            reconcilePendingCreatedRoom(homeId, store?.groupStore);
          }
          const runNavigation = () =>
            navigateAfterRoomFlow({
              selectedRoomId: group.id,
            });
          if (dismissTo) {
            requestAnimationFrame(runNavigation);
          } else {
            runNavigation();
          }
        }
      })
      .catch((error: any) => {
        toast.showError(error.description ?? t("group.errors.fallback"));
      })
      .finally(() => {
        setIsLoading((prev) => ({ ...prev, save: false }));
      });
  }, [
    home,
    roomName,
    selectedNodesIds,
    toast,
    t,
    router,
    homeId,
    dismissTo,
    syncHomeWithNodes,
    store,
    navigateAfterRoomFlow,
  ]);

  const handleUpdate = useCallback(async () => {
    if (!room) return;
    try {
      const existing = room.nodeIds ?? [];
      const { toAdd, toRemove } = getNodeDiff(existing, selectedNodesIds);
      // Sequential — parallel add/remove raced MQTT shadow resync (same as CG edit).
      await room.updateGroupInfo({ groupName: roomName });
      if (toRemove.length > 0) {
        await room.removeNodes(toRemove);
      }
      if (toAdd.length > 0) {
        await room.addNodes(toAdd);
      }
      toast.showSuccess(t("group.createRoomSuccess.title"));
      navigateAfterRoomFlow({});
    } catch (error: any) {
      toast.showError(error.description ?? t("group.errors.fallback"));
    }
  }, [
    room,
    roomName,
    selectedNodesIds,
    toast,
    t,
    navigateAfterRoomFlow,
  ]);

  const handleDelete = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!room) return;
    setIsLoading((prev) => ({ ...prev, delete: true }));
    try {
      await room.delete();
      toast.showSuccess(t("group.createRoom.roomRemovedSuccessfully"));
      router.dismissTo({
        pathname: "/(group)/Rooms",
        params: { id: homeId },
      } as any);
    } catch (error: any) {
      toast.showError(error.description ?? t("group.errors.fallback"));
    } finally {
      setIsLoading((prev) => ({ ...prev, delete: false }));
    }
  }, [room, toast, t, router, homeId]);

  const confirmLeaveRoom = useCallback(async () => {
    if (!room) return;
    setIsLeavingRoom(true);
    try {
      await room.leave();
      toast.showSuccess(t("group.createRoom.roomLeftSuccessfully"));
      // Leaving the only shared room removes the user's whole home association
      // on the backend, so Rooms/Settings for this home may no longer exist —
      // land on the Home screen, which re-syncs the home list on focus.
      router.dismissTo("/(group)/Home");
    } catch (error: any) {
      toast.showError(error.description ?? t("group.errors.errorLeavingRoom"));
    } finally {
      setIsLeavingRoom(false);
      setShowLeaveDialog(false);
    }
  }, [room, toast, t, router]);

  const getRoomSharedUsers = useCallback(async () => {
    if (!room) return;
    if (!getFeatures().subGroupSharing) {
      setIsRoomSharePrimary(true);
      setRoomSharedUsers([]);
      setRoomPendingUsers([]);
      setRoomSharedByUser(null);
      return;
    }
    try {
      const res = await room.getSharingInfo({
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
      setIsRoomSharePrimary(isCurrentUserPrimary);

      if (!isCurrentUserPrimary && primaryUsers.length > 0) {
        setRoomSharedByUser({
          id: generateRandomId(),
          username: primaryUsers[0].username,
          metadata: primaryUsers[0].metadata,
        });
        setRoomSharedUsers([]);
        setRoomPendingUsers([]);
        return;
      }

      if (isCurrentUserPrimary) {
        const unifiedIssuedSharingInfo =
          await user?.getIssuedGroupSharingRequests();
        let allSharingRequests: ESPCDFGroupSharingRequest[] = [];
        if (unifiedIssuedSharingInfo) {
          allSharingRequests = unifiedIssuedSharingInfo.data ?? [];
        }

        const roomIdStr = room.id as string;
        const pendingRequests = allSharingRequests
          .filter((req: ESPCDFGroupSharingRequest) => {
            const isPending = req.status === "pending";
            const isForThisRoom = req.groupIds?.includes(roomIdStr);
            const isNotExpired = !isRequestExpired(req.timestamp);
            return isPending && isForThisRoom && isNotExpired;
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

        setRoomPendingUsers(sortByExpirationDate(pendingRequests));

        const acceptedUsers = [
          ...primaryUsers.filter((u) => u.username !== currentUsername),
          ...secondaryUsers.filter((u) => u.username !== currentUsername),
        ].map((u) => ({
          id: generateRandomId(),
          username: u.username,
          metadata: u.metadata,
        }));

        setRoomSharedUsers(acceptedUsers);
        setRoomSharedByUser(null);
      }
    } catch {
      // Subgroup-only viewers may not be able to fetch the sharing list —
      // degrade silently instead of toasting on every visit.
      if (!canManageRoom) {
        setIsRoomSharePrimary(false);
        setRoomSharedUsers([]);
        setRoomPendingUsers([]);
        setRoomSharedByUser(null);
        return;
      }
      toast.showError(t("group.errors.errorGettingSharedUsers"));
    }
  }, [room, user, t, toast, canManageRoom]);

  const getRoomSharedUsersRef = useRef(getRoomSharedUsers);
  getRoomSharedUsersRef.current = getRoomSharedUsers;

  useEffect(() => {
    if (room && getFeatures().subGroupSharing) {
      getRoomSharedUsersRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [room?.id]);

  const handleAddRoomUser = useCallback(async () => {
    if (!room) return;
    if (!validateGroupSharingInvite(newRoomUserInvite).isValid) return;
    const toUserName = normalizeGroupSharingInviteForApi(newRoomUserInvite);
    setIsAddingRoomUserLoading(true);
    try {
      if (transferRoomAndAssignRole) {
        await room.transfer({
          toUserName,
          assignRoleToSelf: "secondary",
          metadata: {},
        });
      } else if (transferRoom) {
        await room.transfer({
          toUserName,
          metadata: {},
        });
      } else {
        await room.share({
          toUserName,
          makePrimary: makeRoomUserPrimary,
        });
      }
      toast.showSuccess(
        transferRoom || transferRoomAndAssignRole
          ? t("group.settings.transferRequestedSuccessfully")
          : t("group.settings.sharingRequestedSuccessfully")
      );
      setIsAddingRoomUser(false);
      setNewRoomUserInvite("");
      setMakeRoomUserPrimary(false);
      setTransferRoom(false);
      setTransferRoomAndAssignRole(false);
    } catch (err: any) {
      switch (err.errorCode) {
        case ERROR_CODES_MAP.USER_NOT_FOUND:
          toast.showError(t("group.errors.userNotFound"));
          break;
        case ERROR_CODES_MAP.ADDING_SELF_NOT_ALLOWED:
          toast.showError(t("group.errors.addingSelfNotAllowed"));
          break;
        default:{
          if (err.responseData.status) {
            toast.showError(err.responseData.status);
          }
          toast.showError(
            err.description ?? t("group.errors.fallback")
          );
          break;
        }
      }
    } finally {
      setIsAddingRoomUserLoading(false);
      setTimeout(() => {
        getRoomSharedUsersRef.current();
      }, 1000);
    }
  }, [
    room,
    newRoomUserInvite,
    makeRoomUserPrimary,
    transferRoom,
    transferRoomAndAssignRole,
    t,
    toast,
  ]);

  const handleRemoveRoomUser = useCallback(
    async (username: string) => {
      if (!room) return;
      setRemoveRoomUserLoading(true);
      try {
        await room.removeSharingFor(username);
        toast.showSuccess(t("group.settings.sharingRemovedSuccessfully"));
        getRoomSharedUsersRef.current();
      } catch {
        toast.showError(t("group.errors.errorRemovingUser"));
      } finally {
        setRemoveRoomUserLoading(false);
      }
    },
    [room, t, toast]
  );

  const handleRemoveRoomPendingUser = useCallback(
    async (username: string) => {
      if (!user || !room) return;
      setRemoveRoomUserLoading(true);
      try {
        const unifiedIssuedSharingInfo =
          await user.getIssuedGroupSharingRequests();
        let allSharingRequests: ESPCDFGroupSharingRequest[] = [];
        if (unifiedIssuedSharingInfo) {
          allSharingRequests = unifiedIssuedSharingInfo.data ?? [];
        }
        const roomIdStr = room.id as string;
        const pendingRequest = allSharingRequests.find(
          (req: ESPCDFGroupSharingRequest) => {
            const isMatchingUser = norm(req.username) === norm(username);
            const isForThisRoom = req.groupIds?.includes(roomIdStr);
            const isPending = req.status === "pending";
            return isMatchingUser && isForThisRoom && isPending;
          }
        );
        if (pendingRequest) {
          await pendingRequest.remove();
          toast.showSuccess(t("group.settings.sharingRemovedSuccessfully"));
          getRoomSharedUsersRef.current();
        } else {
          throw new Error("Pending request not found");
        }
      } catch {
        toast.showError(t("group.errors.errorRemovingUser"));
      } finally {
        setRemoveRoomUserLoading(false);
      }
    },
    [user, room, t, toast]
  );

  const handleCloseAddRoomUserModal = useCallback(() => {
    setIsAddingRoomUser(false);
    setNewRoomUserInvite("");
    setIsRoomInviteValid(false);
    setMakeRoomUserPrimary(false);
    setTransferRoom(false);
    setTransferRoomAndAssignRole(false);
  }, []);

  const handleRoomInviteChange = useCallback(
    (value: string, isValid: boolean) => {
      setNewRoomUserInvite(value);
      setIsRoomInviteValid(isValid);
    },
    []
  );

  return {
    roomName,
    setRoomName,
    room,
    canManageRoom,
    canEditRoomDevices,
    canLeaveRoom,
    showLeaveDialog,
    setShowLeaveDialog,
    isLeavingRoom,
    confirmLeaveRoom,
    selectedNodes,
    availableNodes,
    isLoading,
    showDeleteDialog,
    setShowDeleteDialog,
    handleCustomRoomName,
    handleAddDevice,
    handleRemoveDevice,
    handleSave,
    handleUpdate,
    handleDelete,
    confirmDelete,
    isRoomSharePrimary,
    roomSharedUsers,
    roomPendingUsers,
    roomSharedByUser,
    isAddingRoomUser,
    setIsAddingRoomUser,
    newRoomUserInvite,
    setNewRoomUserInvite,
    makeRoomUserPrimary,
    setMakeRoomUserPrimary,
    transferRoom,
    setTransferRoom,
    transferRoomAndAssignRole,
    setTransferRoomAndAssignRole,
    isAddingRoomUserLoading,
    removeRoomUserLoading,
    handleAddRoomUser,
    handleRemoveRoomUser,
    handleRemoveRoomPendingUser,
    handleCloseAddRoomUserModal,
    handleRoomInviteChange,
    roomInviteValidator,
    isRoomInviteValid,
  };
}
