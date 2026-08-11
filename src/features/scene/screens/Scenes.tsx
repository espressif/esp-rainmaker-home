/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet, RefreshControl, ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useScenes } from "@features/scene/hooks";
import { useSkeletonReveal } from "@shared/hooks/useSkeletonReveal";
import { SKELETON_REVEAL_PHASE_READY } from "@shared/utils/constants";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ScreenWrapper, Button, InputDialog } from "@shared/components";
import {
  SceneMenuBottomSheet,
  ScenesEmptyState,
  ScenesFavoritesSection,
  ScenesAllScenesSection,
  ScenesHeader,
  ScenesLoadingSkeleton,
} from "@features/scene/components";
import { testProps } from "@shared/utils/testProps";
import type { SceneAction } from "@src/types/global";

/**
 * Scenes screen: list + favorites. Initial load uses a mild skeleton collapse
 * then content slide-up; pull-to-refresh keeps RefreshControl only.
 */
const Scenes = observer(() => {
  const { t } = useTranslation();

  const {
    isLoading,
    isRefreshing,
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
    refreshScenes,
    handleAddScene,
    handleSceneNameConfirm,
    handleScenePress,
    handleFavoriteToggle,
    handleSceneAction,
    handleCloseBottomSheet,
    setIsSceneNameDialogVisible,
  } = useScenes();

  const {
    showSkeleton,
    showContent,
    phase,
    skeletonAnimatedStyle,
    contentAnimatedStyle,
    onSkeletonLayout,
  } = useSkeletonReveal(isLoading);

  const hasScenes = favoriteScenes.length > 0 || allScenes.length > 0;
  const hasFavoritesOnly =
    favoriteScenes.length > 0 && allScenes.length === 0;
  const showFooter = phase === SKELETON_REVEAL_PHASE_READY;

  return (
    <>
      <ScenesHeader
        hasScenes={hasScenes}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
      />
      <ScreenWrapper style={styles.container} dismissKeyboard={false}>
        {showSkeleton && (
          <Animated.View
            {...testProps("view_scenes_skeleton_reveal")}
            style={[styles.skeletonSlot, skeletonAnimatedStyle]}
          >
            <View onLayout={onSkeletonLayout}>
              <ScenesLoadingSkeleton />
            </View>
          </Animated.View>
        )}

        {showContent && (
          <Animated.View style={contentAnimatedStyle}>
            {hasScenes ? (
              <ScrollView
                {...testProps("scroll_scenes")}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  flexGrow: 1,
                }}
                horizontal={false}
                bounces
                alwaysBounceVertical
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={refreshScenes}
                    colors={[tokens.colors.primary]}
                    tintColor={tokens.colors.primary}
                    progressViewOffset={10}
                  />
                }
              >
                <ScenesFavoritesSection
                  favoriteScenes={favoriteScenes}
                  favoriteSceneIds={favoriteSceneIds}
                  addingFavoriteLoading={addingFavoriteLoading}
                  sceneCardDimensions={sceneCardDimensions}
                  sceneLoadingStates={sceneLoadingStates}
                  isEditing={isEditing}
                  onFavoriteToggle={handleFavoriteToggle}
                  onScenePress={handleScenePress}
                  onSceneAction={(sceneId: string, action: string) =>
                    handleSceneAction(sceneId, action as SceneAction)
                  }
                />

                {allScenes.length > 0 ? (
                  <ScenesAllScenesSection
                    allScenes={allScenes}
                    favoriteScenes={favoriteScenes}
                    favoriteSceneIds={favoriteSceneIds}
                    addingFavoriteLoading={addingFavoriteLoading}
                    sceneCardDimensions={sceneCardDimensions}
                    sceneLoadingStates={sceneLoadingStates}
                    isEditing={isEditing}
                    onFavoriteToggle={handleFavoriteToggle}
                    onScenePress={handleScenePress}
                    onSceneAction={(sceneId: string, action: string) =>
                      handleSceneAction(sceneId, action as SceneAction)
                    }
                  />
                ) : hasFavoritesOnly ? (
                  <ScenesEmptyState embedded hasFavorites />
                ) : null}
              </ScrollView>
            ) : (
              <View
                {...testProps("view_scenes_empty")}
                style={globalStyles.flex1}
              >
                <ScenesEmptyState
                  hasFavorites={false}
                  refreshing={isRefreshing}
                  onRefresh={refreshScenes}
                />
              </View>
            )}
          </Animated.View>
        )}

        {showFooter && (
          <View style={globalStyles.footerAddButtonContainer}>
            <Button
              label={t("scene.scenes.addScene")}
              onPress={handleAddScene}
              style={globalStyles.footerAddButton}
              qaId="button_add_scenes"
            />
          </View>
        )}
      </ScreenWrapper>

      {selectedScene && (
        <SceneMenuBottomSheet
          visible={isBottomSheetVisible}
          scene={selectedScene}
          sceneName={selectedScene.name}
          options={getSceneMenuOptions}
          onClose={handleCloseBottomSheet}
          warning={getConnectionWarning}
        />
      )}

      <InputDialog
        qaId="create_scene"
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
  skeletonSlot: {
    width: "100%",
  },
});

export default Scenes;
