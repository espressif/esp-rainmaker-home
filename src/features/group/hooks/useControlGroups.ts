/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { TFunction } from "i18next";
import type { ESPCDFGroup } from "@store";
import { GROUP_TYPE_ROOM } from "@shared/utils/constants";
import { getNodeDiff, mapNodeToDisplay } from "@features/group/utils/createRoomHelpers";
import {
  getLockedTypeFromSelection,
  getPrimaryHomogeneousDeviceType,
  HOMOGENEOUS_DEVICE_TYPE_KEY,
  isDeviceTypeSubgroup,
  nodeMatchesHomogeneousType,
  stripGroupControlSubgroupDisplayName,
  toGroupControlStorageName,
} from "@features/group/utils/controlGroupHelpers";
import { getDeviceGroupSubGroups } from "@features/group/utils/roomsHelpers";
import { useCDF } from "@shared/hooks/useCDF";
import { fetchNodesIfEmpty } from "@store";
import type { Node } from "@src/types/global";
import { useFocusEffect } from "expo-router";

export interface UseControlGroupsOptions {
  homeId: string | undefined;
  router: { push: (href: unknown) => void; canGoBack?: () => boolean };
}

export interface UseControlGroupsResult {
  home: ESPCDFGroup | null;
  deviceGroups: ESPCDFGroup[];
  refreshing: boolean;
  handleRefresh: () => Promise<void>;
  handleAddGroup: () => void;
  handlePressGroup: (groupId: string) => void;
}

/**
 * Lists device-type subgroups for a home (same-type device groups).
 */
export function useControlGroups(
  options: UseControlGroupsOptions
): UseControlGroupsResult {
  const { homeId, router } = options;
  const { store, syncHomeWithNodes } = useCDF();
  const { groupStore } = store;

  const [refreshing, setRefreshing] = useState(false);
  const home = groupStore?.groupsByIDMap?.[homeId as string] ?? null;

  const deviceGroups = useMemo(() => {
    const subGroups = (home?.subGroups as ESPCDFGroup[]) || [];
    return getDeviceGroupSubGroups(subGroups);
  }, [home?.subGroups]);

  const load = useCallback(async () => {
    if (!homeId) return;
    setRefreshing(true);
    try {
      await syncHomeWithNodes(true);
    } catch (error) {
      console.error("Error syncing home for device groups:", error);
    } finally {
      setRefreshing(false);
    }
  }, [homeId, syncHomeWithNodes]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      loadRef.current();
    }, [])
  );

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    await load();
  }, [load, refreshing]);

  const handleAddGroup = useCallback(() => {
    router.push({
      pathname: "/(group)/CreateControlGroup",
      params: { id: homeId },
    } as any);
  }, [router, homeId]);

  const handlePressGroup = useCallback(
    (groupId: string) => {
      router.push({
        pathname: "/(group)/ControlGroupPanel",
        params: { id: home?.id, groupId },
      } as any);
    },
    [router, home?.id]
  );

  return {
    home: home ?? null,
    deviceGroups,
    refreshing,
    handleRefresh,
    handleAddGroup,
    handlePressGroup,
  };
}

export interface UseCreateGroupOptions {
  homeId: string | undefined;
  groupId: string | undefined;
  roomName: string | undefined;
  /** When creating a group, pre-select this node (e.g. from device Settings). */
  preselectedNodeId: string | undefined;
  toast: {
    showSuccess: (message: string) => void;
    showError: (message: string) => void;
  };
  t: TFunction;
  router: {
    push: (href: unknown) => void;
    dismissTo: (href: unknown) => void;
  };
}

export interface UseCreateGroupResult {
  groupName: string;
  deviceGroup: ESPCDFGroup | undefined;
  selectedNodes: Node[];
  availableNodes: Node[];
  lockedDeviceType: string | null;
  isLoading: { save: boolean; delete: boolean };
  showDeleteDialog: boolean;
  setShowDeleteDialog: (show: boolean) => void;
  handleCustomizeName: () => void;
  handleAddDevice: (node: Node) => void;
  handleRemoveDevice: (node: Node) => void;
  handleSave: () => void;
  handleUpdate: () => Promise<void>;
  handleDelete: () => void;
  confirmDelete: () => Promise<void>;
}

/**
 * Manages create group state and related actions.
 */
export function useCreateGroup(
  options: UseCreateGroupOptions
): UseCreateGroupResult {
  const {
    homeId,
    groupId,
    roomName: roomNameParam,
    preselectedNodeId,
    toast,
    t,
    router,
  } = options;
  const { store } = useCDF();

  const [groupName, setGroupName] = useState(roomNameParam || "");
  const [selectedNodesIds, setSelectedNodesIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState({ save: false, delete: false });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const lastPreselectRef = useRef<string | undefined>(undefined);

  const home = useMemo(
    () => store?.groupStore?.groupsByIDMap?.[homeId as string],
    [store?.groupStore?.groupsByIDMap, homeId]
  );

  const deviceGroup = useMemo(
    () =>
      home?.subGroups?.find(
        (g: ESPCDFGroup) => g.id === groupId && isDeviceTypeSubgroup(g)
      ),
    [home?.subGroups, groupId]
  );

  const nodes = useMemo(
    () =>
      store?.nodeStore?.nodesList.filter((node) =>
        home?.nodeIds?.includes(node.id)
      ) ?? [],
    [store?.nodeStore?.nodesList, home?.nodeIds]
  );

  const lockedDeviceType = useMemo(
    () => getLockedTypeFromSelection(nodes, selectedNodesIds),
    [nodes, selectedNodesIds]
  );

  const selectedNodes: Node[] = useMemo(
    () =>
      nodes
        .filter((node) => selectedNodesIds.includes(node.id))
        .map(mapNodeToDisplay),
    [nodes, selectedNodesIds]
  );

  const availableNodes: Node[] = useMemo(() => {
    return nodes
      .filter((node) => !selectedNodesIds.includes(node.id))
      .filter((node) => getPrimaryHomogeneousDeviceType(node) !== null)
      .filter((node) =>
        !lockedDeviceType
          ? true
          : nodeMatchesHomogeneousType(node, lockedDeviceType)
      )
      .map(mapNodeToDisplay);
  }, [nodes, selectedNodesIds, lockedDeviceType]);

  useEffect(() => {
    if (home) fetchNodesIfEmpty(home);
  }, [home]);

  useEffect(() => {
    if (deviceGroup?.nodeIds?.length) {
      setSelectedNodesIds(deviceGroup.nodeIds);
    }
  }, [deviceGroup?.id, deviceGroup?.nodeIds]);

  useEffect(() => {
    if (groupId) return;
    const pid = preselectedNodeId?.trim();
    if (!pid) {
      lastPreselectRef.current = undefined;
      return;
    }
    if (lastPreselectRef.current === pid) return;
    const n = nodes.find((x) => x.id === pid);
    if (!n || getPrimaryHomogeneousDeviceType(n) === null) return;
    if (!home?.nodeIds?.includes(pid)) return;
    lastPreselectRef.current = pid;
    setSelectedNodesIds([pid]);
  }, [groupId, preselectedNodeId, nodes, home?.nodeIds]);

  useEffect(() => {
    if (roomNameParam) {
      setGroupName(roomNameParam);
    } else if (deviceGroup) {
      setGroupName(stripGroupControlSubgroupDisplayName(deviceGroup.name));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [roomNameParam, deviceGroup?.id, deviceGroup?.name]);

  const handleCustomizeName = useCallback(() => {
    router.push({
      pathname: "/(group)/CustomizeControlGroupName",
      params: {
        currentGroupName: groupName,
        id: homeId,
        groupId: groupId ?? "",
        ...(preselectedNodeId?.trim()
          ? { preselectedNodeId: preselectedNodeId.trim() }
          : {}),
      },
    } as any);
  }, [router, groupName, homeId, groupId, preselectedNodeId]);

  const handleAddDevice = useCallback(
    (node: Node) => {
      const n = node.node;
      if (!n) return;
      if (getPrimaryHomogeneousDeviceType(n) === null) {
        toast.showError(t("group.deviceGroups.ineligibleNode"));
        return;
      }
      const locked = getLockedTypeFromSelection(nodes, selectedNodesIds);
      if (locked && !nodeMatchesHomogeneousType(n, locked)) {
        toast.showError(t("group.deviceGroups.deviceTypeMismatch"));
        return;
      }
      setSelectedNodesIds((prev) => [...prev, node.id]);
    },
    [nodes, selectedNodesIds, toast, t]
  );

  const handleRemoveDevice = useCallback((node: Node) => {
    setSelectedNodesIds((prev) => prev.filter((id) => id !== node.id));
  }, []);

  const handleSave = useCallback(() => {
    if (!home) return;
    const locked = getLockedTypeFromSelection(nodes, selectedNodesIds);
    if (!locked) {
      toast.showError(t("group.deviceGroups.needHomogeneousSelection"));
      return;
    }
    setIsLoading((prev) => ({ ...prev, save: true }));
    home
      .createSubGroup({
        name: toGroupControlStorageName(groupName),
        nodeIds: selectedNodesIds,
        customData: { [HOMOGENEOUS_DEVICE_TYPE_KEY]: locked },
        type: GROUP_TYPE_ROOM,
        mutuallyExclusive: true,
      })
      .then(() => {
        toast.showSuccess(t("group.deviceGroups.groupCreatedSuccessfully"));
        router.dismissTo({
          pathname: "/(group)/ControlGroups",
          params: { id: homeId },
        } as any);
      })
      .catch((error: any) => {
        toast.showError(error.description ?? t("group.errors.fallback"));
      })
      .finally(() => {
        setIsLoading((prev) => ({ ...prev, save: false }));
      });
  }, [home, groupName, selectedNodesIds, nodes, toast, t, router, homeId]);

  const handleUpdate = useCallback(async () => {
    if (!deviceGroup) return;
    const locked = getLockedTypeFromSelection(nodes, selectedNodesIds);
    if (!locked) {
      toast.showError(t("group.deviceGroups.needHomogeneousSelection"));
      return;
    }
    try {
      const existing = deviceGroup.nodeIds ?? [];
      const { toAdd, toRemove } = getNodeDiff(existing, selectedNodesIds);
      await Promise.allSettled([
        deviceGroup.updateGroupInfo({
          groupName: toGroupControlStorageName(groupName),
        }),
        toAdd.length > 0 ? deviceGroup.addNodes(toAdd) : undefined,
        toRemove.length > 0 ? deviceGroup.removeNodes(toRemove) : undefined,
      ]);
      toast.showSuccess(t("group.deviceGroups.groupUpdatedSuccessfully"));
      router.dismissTo({
        pathname: "/(group)/ControlGroups",
        params: { id: homeId },
      } as any);
    } catch (error: any) {
      toast.showError(error.description ?? t("group.errors.fallback"));
    }
  }, [
    deviceGroup,
    groupName,
    selectedNodesIds,
    nodes,
    toast,
    t,
    router,
    homeId,
  ]);

  const handleDelete = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deviceGroup) return;
    setIsLoading((prev) => ({ ...prev, delete: true }));
    try {
      await deviceGroup.delete();
      toast.showSuccess(t("group.deviceGroups.groupRemovedSuccessfully"));
      router.dismissTo({
        pathname: "/(group)/ControlGroups",
        params: { id: homeId },
      } as any);
    } catch (error: any) {
      toast.showError(error.description ?? t("group.errors.fallback"));
    } finally {
      setIsLoading((prev) => ({ ...prev, delete: false }));
    }
  }, [deviceGroup, toast, t, router, homeId]);

  return {
    groupName,
    deviceGroup,
    selectedNodes,
    availableNodes,
    lockedDeviceType,
    isLoading,
    showDeleteDialog,
    setShowDeleteDialog,
    handleCustomizeName,
    handleAddDevice,
    handleRemoveDevice,
    handleSave,
    handleUpdate,
    handleDelete,
    confirmDelete,
  };
}
