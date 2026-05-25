/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useObserver } from "mobx-react-lite";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { useScene } from "@context/scenes.context";
import { useWindowDimensions } from "react-native";
import { ESPCDFScene } from "@store";
import { SUCESS } from "@shared/utils/constants";
import { filterScenes } from "@features/scene/utils/sceneHelper";
import { getSceneCardDimensions } from "@shared/utils/common";
import type { SceneAction, SceneLoadingState } from "@src/types/global";
import { Play, Edit, Trash2 } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";

/**
 * Hook for managing scenes screen business logic
 *
 * Handles:
 * - Scene fetching and refreshing
 * - Favorite scene management
 * - Scene actions (activate, edit, delete)
 * - Scene filtering
 * - Loading states
 */
export const useScenes = (): {
  isLoading: boolean;
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;
  favoriteSceneIds: string[];
  addingFavoriteLoading: string | null;
  selectedScene: ESPCDFScene | null;
  isBottomSheetVisible: boolean;
  isSceneNameDialogVisible: boolean;
  sceneName: string;
  sceneLoadingStates: SceneLoadingState;
  favoriteScenes: ESPCDFScene[];
  allScenes: ESPCDFScene[];
  sceneCardDimensions: { width: number; height: number; cardsPerRow: number };
  getSceneMenuOptions: {
    id: string;
    label: string;
    icon: React.JSX.Element;
    onPress: () => void;
    loading: boolean;
    destructive?: boolean;
  }[];
  getConnectionWarning: string | undefined;
  fetchScenes: () => Promise<void>;
  handleAddScene: () => void;
  handleSceneNameConfirm: (name: string) => void;
  handleScenePress: (scene: ESPCDFScene) => void;
  handleFavoriteToggle: (sceneId: string) => Promise<void>;
  handleSceneAction: (sceneId: string, action: SceneAction) => Promise<void>;
  handleCloseBottomSheet: () => void;
  setIsSceneNameDialogVisible: (value: boolean) => void;
} => {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { store } = useCDF();
  const { sceneStore, nodeStore } = store;
  const { setSceneInfo, resetState } = useScene();
  const { width: screenWidth } = useWindowDimensions();

  // Don't destructure sceneList - access it directly to maintain MobX reactivity
  // The component is wrapped with observer, so accessing sceneStore.sceneList will trigger re-renders
  const user = store?.userStore.user;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [favoriteSceneIds, setFavoriteSceneIds] = useState<string[]>([]);
  const [addingFavoriteLoading, setAddingFavoriteLoading] = useState<
    string | null
  >(null);
  const [selectedScene, setSelectedScene] = useState<ESPCDFScene | null>(null);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [isSceneNameDialogVisible, setIsSceneNameDialogVisible] =
    useState(false);
  const [sceneName, setSceneName] = useState("");
  const [sceneLoadingStates, setSceneLoadingStates] =
    useState<SceneLoadingState>({});

  // Refs to store latest values for stable callbacks
  // MobX stores are stable, so we can use them directly
  // Only toast and t need refs since they might change
  const toastRef = useRef(toast);
  const tRef = useRef(t);

  // Initialize refs immediately
  toastRef.current = toast;
  tRef.current = t;

  /**
   * Fetches latest scene data from ESPCDFGroup instance
   * Uses group.getScenes() which reads from the group's nodeDetails to get latest data.
   * The operation uses the ESPCDFGroup instance directly, ensuring we always get the latest data.
   * Follows the same pattern as getSceneCapableDevices — reads directly from the ESPCDFGroup instance.
   * Stable callback (no deps) to avoid useFocusEffect recursion; reads store at call time.
   * MobX stores are stable references, so we can access them via closure.
   */
  const fetchScenes = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      setIsLoading(true);
      // Clear existing scenes before fetching new ones
      sceneStore.clear();

      // Get current home group - this is an ESPCDFGroup instance
      const currentHome = store.getCurrentHome();
      if (currentHome && currentHome.operations.getScenes) {
        await currentHome.getScenes();
      }
    } catch (error) {
      console.error("Error fetching scenes:", error);
      // Use refs for toast and t since they might change
      // Safety check to ensure refs are initialized
      if (toastRef.current && tRef.current) {
        toastRef.current.showError(tRef.current("scene.errors.fallback"));
      }
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []); // Empty deps - MobX stores are stable and accessed via closure

  // Update refs when values change (after fetchScenes is defined)
  useEffect(() => {
    toastRef.current = toast;
    tRef.current = t;
  }, [toast, t]);

  /**
   * Effect: Updates scenes when screen comes into focus.
   * Empty deps so this runs only on focus change, not when fetchScenes identity changes (avoids recursion).
   */
  useFocusEffect(
    useCallback(() => {
      fetchScenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
    }, []), // Empty deps - only run on focus change
  );

  /**
   * Fetches user custom data for favorite scenes
   */
  const fetchUserCustomData = async () => {
    const userCustomData = await user?.getCustomData();
    if (userCustomData?.favoritesScenes) {
      setFavoriteSceneIds(userCustomData.favoritesScenes.value as string[]);
    }
  };

  useEffect(() => {
    fetchUserCustomData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [user]);

  /**
   * Handles favorite toggle for a scene
   */
  const handleFavoriteToggle = async (sceneId: string) => {
    try {
      setAddingFavoriteLoading(sceneId);
      const updatedFavorites = favoriteSceneIds.includes(sceneId)
        ? favoriteSceneIds.filter((id) => id !== sceneId)
        : [...favoriteSceneIds, sceneId];

      await user?.setCustomData({
        favoritesScenes: {
          value: updatedFavorites,
          perms: [
            {
              read: ["user"],
            },
            {
              write: ["user"],
            },
          ],
        },
      });
      setFavoriteSceneIds(updatedFavorites);
    } catch (e) {
      console.error("Error toggling favorite:", e);
    } finally {
      setAddingFavoriteLoading(null);
    }
  };

  /**
   * Handles scene actions (activate, edit, delete)
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  const handleSceneAction = async (sceneId: string, action: SceneAction) => {
    const selectedScene = sceneStore.scenesByID[sceneId];
    if (!selectedScene) return;
    setSceneLoadingStates((prev) => ({ ...prev, [sceneId]: action }));

    try {
      switch (action) {
        case "activate": {
          const resp = (await selectedScene.activate()) as any;
          if (resp && resp.some((resp: any) => resp.status !== SUCESS)) {
            toast.showError(t("scene.scenes.someDevicesFailedTrigger"));
          } else {
            toast.showSuccess(t("scene.scenes.sceneTriggeredSuccessfully"));
          }
          break;
        }
        case "edit": {
          setSceneInfo(selectedScene);
          router.push({
            pathname: "/(scene)/CreateScene",
          });
          break;
        }
        case "delete": {
          const resp = (await selectedScene.remove()) as any;
          if (resp && resp.some((resp: any) => resp.status !== SUCESS)) {
            toast.showError(t("scene.scenes.someDevicesFailedDelete"));
          } else {
            toast.showSuccess(t("scene.scenes.sceneDeletedSuccessfully"));
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error(`Error performing ${action} on scene:`, error);
      toast.showError(t("scene.errors.fallback"));
    } finally {
      setTimeout(() => {
        setSceneLoadingStates((prev) => {
          const newState = { ...prev };
          delete newState[sceneId];
          return newState;
        });
      }, 1000);
      handleCloseBottomSheet();
    }
  };

  /**
   * Handles navigation to create a new scene
   */
  const handleAddScene = () => {
    setSceneName("");
    setIsSceneNameDialogVisible(true);
  };

  /**
   * Handles scene name input confirmation
   */
  const handleSceneNameConfirm = (name: string) => {
    if (name.trim()) {
      resetState();
      setIsSceneNameDialogVisible(false);
      router.push({
        pathname: "/(scene)/CreateScene",
        params: {
          sceneName: name.trim(),
        },
      } as any);
    }
  };

  /**
   * Handles navigation to edit an existing scene
   */
  const handleScenePress = (scene: ESPCDFScene) => {
    setSelectedScene(scene);
    setIsBottomSheetVisible(true);
  };

  const handleCloseBottomSheet = () => {
    setIsBottomSheetVisible(false);
    setSelectedScene(null);
  };

  /**
   * Builds scene menu options for bottom sheet
   */
  const getSceneMenuOptions = useMemo(() => {
    if (!selectedScene) return [];

    return [
      {
        id: "activate",
        label: t("scene.scenes.activate"),
        icon: <Play size={16} color={tokens.colors.primary} />,
        onPress: () => handleSceneAction(selectedScene.id, "activate"),
        loading: sceneLoadingStates[selectedScene.id] === "activate",
      },
      {
        id: "edit",
        label: t("scene.scenes.edit"),
        icon: <Edit size={16} color={tokens.colors.text_primary} />,
        onPress: () => handleSceneAction(selectedScene.id, "edit"),
        loading: sceneLoadingStates[selectedScene.id] === "edit",
      },
      {
        id: "delete",
        label: t("scene.scenes.delete"),
        icon: <Trash2 size={16} color={tokens.colors.red} />,
        onPress: () => handleSceneAction(selectedScene.id, "delete"),
        loading: sceneLoadingStates[selectedScene.id] === "delete",
        destructive: true,
      },
    ];
  }, [t, sceneLoadingStates, selectedScene, handleSceneAction]);

  /**
   * Filters scenes into favorite and all scenes
   * Use useObserver to track MobX observable changes
   * When scenes are added/updated in the store via getScenes(), this will automatically update
   */
  const filteredScenes = useObserver(() => {
    // Access sceneStore.sceneList inside useObserver to track MobX observable changes
    const scenes = sceneStore.sceneList;
    return filterScenes(scenes, favoriteSceneIds);
  });
  const favoriteScenes = filteredScenes.favoriteScenes;
  const allScenes = filteredScenes.allScenes;

  /**
   * Calculates scene card dimensions based on screen width
   */
  const sceneCardDimensions = useMemo(() => {
    const SIDE_PADDING = 20;
    const CARD_MARGIN_RIGHT = 10;
    const MIN_CARD_WIDTH = 90;
    const NUM_CARDS_3 = 3;
    const NUM_CARDS_2 = 2;

    return getSceneCardDimensions({
      SIDE_PADDING,
      CARD_MARGIN_RIGHT,
      MIN_CARD_WIDTH,
      NUM_CARDS_3,
      NUM_CARDS_2,
      screenWidth,
    });
  }, [screenWidth]);

  /**
   * Gets warning message if any nodes are not connected
   */
  const getConnectionWarning = useMemo(() => {
    if (
      selectedScene &&
      selectedScene.nodes.some(
        (node: string) =>
          !nodeStore.nodesByIDMap[node]?.connectivityStatus?.isConnected,
      )
    ) {
      return t("scene.scenes.someDevicesNotConnected");
    }
    return undefined;
  }, [selectedScene, nodeStore, t]);

  return {
    // State
    isLoading,
    isEditing,
    setIsEditing,
    favoriteSceneIds,
    addingFavoriteLoading,
    selectedScene,
    isBottomSheetVisible,
    isSceneNameDialogVisible,
    sceneName,
    sceneLoadingStates,
    favoriteScenes,
    allScenes,
    sceneCardDimensions,
    getSceneMenuOptions,
    getConnectionWarning,

    // Handlers
    fetchScenes,
    handleAddScene,
    handleSceneNameConfirm,
    handleScenePress,
    handleFavoriteToggle,
    handleSceneAction,
    handleCloseBottomSheet,
    setIsSceneNameDialogVisible,
  };
};
