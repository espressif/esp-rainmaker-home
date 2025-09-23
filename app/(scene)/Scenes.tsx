/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// React Native Imports
import { useCallback, useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  RefreshControl,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  useWindowDimensions,
  TouchableOpacity,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import { Scene } from "@espressif/rainmaker-base-cdf";

// Hooks
import { useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { useFocusEffect } from "@react-navigation/native";
import { useScene } from "@/context/scenes.context";

// Mobx observer
import { observer } from "mobx-react-lite";

// Icons
import {
  LayoutPanelLeft,
  Heart,
  Play,
  Edit,
  Trash2,
  RefreshCw,
} from "lucide-react-native";

// Components
import {
  Header,
  ScreenWrapper,
  SceneItem,
  Button,
  SceneMenuBottomSheet,
  InputDialog,
} from "@/components";

// Utils
import { getSceneCardDimensions } from "@/utils/common";
import { SUCESS } from "@/utils/constants";

/**
 * Scenes Component
 *
 * A screen component that displays and manages scenes.
 * Allows users to view, create, edit, and trigger scenes.
 *
 * Features:
 * - Lists all available scenes
 * - Create new scenes
 * - Edit existing scenes
 * - Trigger scenes
 * - Pull to refresh
 */
const Scenes = observer(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { store } = useCDF();
  const { sceneStore, nodeStore, groupStore, userStore } = store;
  const { setSceneInfo, resetState } = useScene();

  const { sceneList } = sceneStore;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(1);
  const [favoritesceneIds, setFavoritesceneIds] = useState<string[]>([]);
  const [addingFavoriteLoading, setAddingFavoriteLoading] = useState<
    string | null
  >(null);
  const [selectedScene, setSelectedScene] = useState<any | null>(null);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [isSceneNameDialogVisible, setIsSceneNameDialogVisible] =
    useState(false);
  const [sceneName, setSceneName] = useState("");
  const { width: screenWidth } = useWindowDimensions();

  /**
   * Handles navigation to create a new scene
   * Shows input dialog for scene name first
   */
  const handleAddScene = () => {
    setSceneName("");
    setIsSceneNameDialogVisible(true);
  };

  /**
   * Handles scene name input confirmation
   * Navigates to CreateScene with the entered name
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
   * Redirects to CreateScene.tsx with scene data in params
   * @param scene - The scene object to be edited
   */
  const handleScenePress = (scene: Scene) => {
    setSelectedScene(scene);
    setIsBottomSheetVisible(true);
  };

  /**
   * Fetches latest scene data from nodes
   * Syncs node list and triggers UI update
   */
  const fetchScenes = async () => {
    try {
      const currentHome = groupStore?._groupsByID[groupStore?.currentHomeId];
      await sceneStore.syncScenesFromNodes(currentHome.nodes || []);
      setTimeout(() => {
        setForceUpdate((prev) => prev + 1);
      }, 100);
    } catch (error) {
      console.error("Error fetching scenes:", error);
      toast.showError(t("scene.errors.fallback"));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Effect: Updates scenes when screen comes into focus
   * Ensures scene list is always current when viewing
   */
  useFocusEffect(
    useCallback(() => {
      fetchScenes();
    }, [])
  );
  useEffect(() => {
    fetchScenes();
  }, [nodeStore.nodeList, groupStore.groupList]);

  const fetchUserCustomData = async () => {
    const userCustomData = await userStore.user?.getCustomData();
    if (userCustomData?.favoritesScenes) {
      setFavoritesceneIds(userCustomData.favoritesScenes.value as string[]);
    }
  };

  useEffect(() => {
    fetchUserCustomData();
  }, []);

  /**
   * Handles favorite toggle for a scene
   * @param sceneId - The ID of the scene to toggle favorite status
   */
  const handleFavoriteToggle = async (sceneId: string) => {
    try {
      setAddingFavoriteLoading((prev) => sceneId);
      const updatedFavorites = favoritesceneIds.includes(sceneId)
        ? favoritesceneIds.filter((id) => id !== sceneId)
        : [...favoritesceneIds, sceneId];
      await userStore.user?.setCustomData({
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
      setFavoritesceneIds(updatedFavorites);
    } catch (e) {
    } finally {
      setAddingFavoriteLoading(null);
    }
  };

  const [sceneLoadingStates, setSceneLoadingStates] = useState<
    Record<string, string>
  >({});

  const handleSceneAction = async (sceneId: string, action: string) => {
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

  const handleCloseBottomSheet = () => {
    setIsBottomSheetVisible(false);
    setSelectedScene(null);
  };

  const getSceneMenuOptions = useMemo(() => {
    return [
      {
        id: "activate",
        label: t("scene.scenes.activate"),
        icon: <Play size={16} color={tokens.colors.primary} />,
        onPress: () => handleSceneAction(selectedScene?.id || "", "activate"),
        loading: sceneLoadingStates[selectedScene?.id || ""] === "activate",
      },
      {
        id: "edit",
        label: t("scene.scenes.edit"),
        icon: <Edit size={16} color={tokens.colors.text_primary} />,
        onPress: () => handleSceneAction(selectedScene?.id || "", "edit"),
        loading: sceneLoadingStates[selectedScene?.id || ""] === "edit",
      },
      {
        id: "delete",
        label: t("scene.scenes.delete"),
        icon: <Trash2 size={16} color={tokens.colors.red} />,
        onPress: () => handleSceneAction(selectedScene?.id || "", "delete"),
        loading: sceneLoadingStates[selectedScene?.id || ""] === "delete",
        destructive: true,
      },
    ];
  }, [t, sceneLoadingStates, selectedScene]);

  /**
   * Renders empty state when no scenes exist
   * Shows message and icon to indicate no content
   */
  const renderEmptyState = () => {
    return (
      <View style={[globalStyles.sceneEmptyStateContainer]}>
        {isLoading ? (
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        ) : sceneList.length === 0 ? (
          <>
            <View style={globalStyles.sceneEmptyStateIconContainerTop}>
              <LayoutPanelLeft size={35} color={tokens.colors.primary} />
            </View>
            <Text style={globalStyles.emptyStateTitle}>
              {t("scene.scenes.noScenesYet")}
            </Text>
            <Text style={globalStyles.emptyStateDescription}>
              {t("scene.scenes.noScenesYetDescription")}
            </Text>
          </>
        ) : (
          // All scenes are favorites, so "All Scenes" is empty
          <>
            <View style={globalStyles.sceneEmptyStateIconContainer}>
              <Heart size={35} color={tokens.colors.primary} />
            </View>
            <Text style={globalStyles.sceneEmptyStateTitleLarge}>
              {t("scene.scenes.allScenesFavorites")}
            </Text>
            <Text style={globalStyles.emptyStateDescription}>
              {t("scene.scenes.allScenesFavoritesDescription")}
            </Text>
          </>
        )}
      </View>
    );
  };

  // Get favorite scenes
  const favoriteScenes = useMemo(
    () => sceneList.filter((scene) => favoritesceneIds.includes(scene.id)),
    [sceneList, favoritesceneIds, forceUpdate]
  );
  const allScenes = useMemo(
    () => sceneList.filter((scene) => !favoritesceneIds.includes(scene.id)),
    [sceneList, favoritesceneIds, forceUpdate]
  );
  const sceneCardDimensions = useMemo(() => {
    // Constants
    const SIDE_PADDING = 20;
    const CARD_MARGIN_RIGHT = 10;
    const MIN_CARD_WIDTH = 90;
    const NUM_CARDS_3 = 3;
    const NUM_CARDS_2 = 2;

    // Calculate available width for cards (excluding paddings and margins)
    return getSceneCardDimensions({
      SIDE_PADDING,
      CARD_MARGIN_RIGHT,
      MIN_CARD_WIDTH,
      NUM_CARDS_3,
      NUM_CARDS_2,
      screenWidth,
    });
  }, [screenWidth]);
  return (
    <>
      <Header
        label={t("scene.scenes.title")}
        showBack={false}
        rightSlot={
          sceneList.length > 0 ? (
            <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
              <Text style={styles.editButton}>
                {isEditing ? t("scene.scenes.done") : t("scene.scenes.edit")}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={fetchScenes}>
              <RefreshCw size={20} color={tokens.colors.primary} />
            </TouchableOpacity>
          )
        }
      />
      <ScreenWrapper style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
          }}
          horizontal={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={fetchScenes} />
          }
        >
          {/* Favorites Section */}
          {favoriteScenes.length > 0 && (
            <>
              <View style={[globalStyles.sceneSection, { marginBottom: 0 }]}>
                <Text style={globalStyles.sceneSectionTitle}>
                  {t("scene.scenes.favourites")}
                </Text>

                {favoriteScenes.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                      paddingHorizontal: tokens.spacing._5,
                      paddingVertical: 10,
                      paddingRight: 100,
                    }}
                  >
                    {favoriteScenes.map((scene) => (
                      <SceneItem
                        key={scene.id}
                        name={scene.name}
                        deviceCount={scene.devicesCount}
                        devices={[]}
                        icon={null}
                        variant="horizontal"
                        isFavorite={favoritesceneIds.includes(scene.id)}
                        saveFavoriteLoading={addingFavoriteLoading === scene.id}
                        onFavoriteToggle={() => handleFavoriteToggle(scene.id)}
                        onPress={() => handleScenePress(scene)}
                        sceneCardDimensions={sceneCardDimensions}
                        onDelete={() => handleSceneAction(scene.id, "delete")}
                        deleteLoading={
                          sceneLoadingStates[scene.id] === "delete"
                        }
                        isEditing={isEditing}
                      />
                    ))}
                  </ScrollView>
                )}
              </View>
              <View style={globalStyles.darkDivider} />
            </>
          )}

          {/* All Scenes Section */}
          {allScenes.length > 0 ? (
            <View style={[globalStyles.sceneSection, { paddingBottom: 140 }]}>
              {/* Only show "All Scenes" header if there are favorite scenes */}
              {favoriteScenes.length > 0 && (
                <Text style={globalStyles.sceneSectionTitle}>
                  {t("scene.scenes.allScenes")}
                </Text>
              )}
              {allScenes.length > 0 && (
                <View style={globalStyles.sceneAllScenesGrid}>
                  {allScenes.map((scene, index) => (
                    <SceneItem
                      key={scene.id}
                      index={index + 1}
                      name={scene.name}
                      deviceCount={scene.devicesCount}
                      devices={[]}
                      icon={null}
                      variant="vertical"
                      isFavorite={favoritesceneIds.includes(scene.id)}
                      saveFavoriteLoading={addingFavoriteLoading === scene.id}
                      onFavoriteToggle={() => handleFavoriteToggle(scene.id)}
                      onPress={() => handleScenePress(scene)}
                      sceneCardDimensions={sceneCardDimensions}
                      onDelete={() => handleSceneAction(scene.id, "delete")}
                      deleteLoading={sceneLoadingStates[scene.id] === "delete"}
                      isEditing={isEditing}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            renderEmptyState()
          )}
        </ScrollView>

        {/* Fixed Add Scene Button */}
        <View style={globalStyles.footerAddButtonContainer}>
          <Button
            label={t("scene.scenes.addScene")}
            onPress={handleAddScene}
            style={globalStyles.footerAddButton}
          />
        </View>
      </ScreenWrapper>

      {/* Scene Menu Bottom Sheet */}
      <SceneMenuBottomSheet
        visible={isBottomSheetVisible}
        scene={selectedScene}
        sceneName={selectedScene?.name || ""}
        options={selectedScene ? getSceneMenuOptions : []}
        onClose={handleCloseBottomSheet}
        warning={
          selectedScene &&
          selectedScene.nodes.some(
            (node: string) =>
              !nodeStore.nodesByID[node].connectivityStatus?.isConnected
          ) &&
          t("scene.scenes.someDevicesNotConnected")
        }
      />

      {/* Scene Name Input Dialog */}
      <InputDialog
        open={isSceneNameDialogVisible}
        title={t("scene.scenes.createScene")}
        inputPlaceholder={t("scene.scenes.sceneNamePlaceholder")}
        confirmLabel={t("layout.shared.next")}
        cancelLabel={t("layout.shared.cancel")}
        onSubmit={handleSceneNameConfirm}
        onCancel={() => setIsSceneNameDialogVisible(false)}
        initialValue={sceneName}
      />
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg5,
  },
  scrollView: {
    flex: 1,
  },
  editButton: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
});

export default Scenes;
