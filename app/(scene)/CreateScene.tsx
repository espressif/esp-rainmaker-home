/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
import { useScene } from "@/context/scenes.context";

// Icons
import {
  Edit3,
  Plus,
  Trash2,
  Check,
  Settings,
  ShieldAlert,
} from "lucide-react-native";

// Components
import {
  ScreenWrapper,
  ContentWrapper,
  Input,
  Header,
  ActionButton,
} from "@/components";
import DeviceAction from "@/components/ParamControls/DeviceAction";

import { generateRandomId } from "@/utils/common";
import { testProps } from "@/utils/testProps";

import { LoadingState, SceneActionsProps } from "@/types/global";
import { SUCESS } from "@/utils/constants";

/**
 * CreateScene Component
 *
 * A screen component for creating and editing scenes.
 * Allows users to define scene actions for multiple devices.
 *
 * Features:
 * - Create new scenes with custom names and actions
 * - Edit existing scenes
 * - Add/modify device actions
 * - Delete scenes
 * - Validate scene requirements
 
 */
const CreateScene = () => {
  // Hooks
  const { store } = useCDF();
  const { sceneStore, nodeStore } = store;
  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const { state, setSceneName, setSceneId, getSceneActions, resetState } =
    useScene();

  const [loading, setLoading] = useState<LoadingState>({
    save: false,
    delete: false,
  });

  const { sceneName } = useLocalSearchParams();

  useEffect(() => {
    if (!state.isEditing) {
      setSceneId(generateRandomId());
    }
  }, []);

  useEffect(() => {
    if (sceneName) {
      setSceneName(sceneName as string);
    }
  }, [sceneName]);

  /**
   * Handles scene creation or update
   * Sends payload to all selected nodes to create/update scene
   */
  const handleSave = async () => {
    setLoading((prev) => ({ ...prev, save: true }));
    try {
      // Prepare scene data
      const sceneData = {
        id: state.sceneId,
        name: state.sceneName,
        description: "",
        nodes: Object.keys(state.actions),
        actions: state.actions || {},
      };

      if (state.isEditing) {
        // Update scene
        const resp = (await sceneStore.scenesByID[state.sceneId]?.edit({
          name: sceneData.name,
          actions: sceneData.actions,
          nodes: sceneData.nodes,
        })) as any;

        if (resp && resp.some((resp: any) => resp.status !== SUCESS)) {
          toast.showError(t("scene.scenes.someDevicesFailedUpdate"));
        } else {
          toast.showSuccess(t("scene.createScene.sceneUpdatedSuccessfully"));
        }
      } else {
        // Create scene
        await sceneStore.createScene(sceneData as any);
        toast.showSuccess(t("scene.createScene.sceneCreatedSuccessfully"));
      }

      resetState();
      router.dismissTo("/(scene)/Scenes");
    } catch (error) {
      console.error("Error saving scene:", error);
      toast.showError(t("scene.errors.sceneCreationFailed"));
    } finally {
      setLoading((prev) => ({ ...prev, save: false }));
    }
  };

  /**
   * Handles scene deletion
   * Sends remove operation to all nodes containing the scene
   */
  const handleDelete = async () => {
    setLoading((prev) => ({ ...prev, delete: true }));
    try {
      const resp = (await sceneStore.scenesByID[
        state.sceneId
      ]?.remove()) as any;
      if (resp && resp.some((resp: any) => resp.status !== SUCESS)) {
        toast.showError(t("scene.scenes.someDevicesFailedDelete"));
      } else {
        toast.showSuccess(t("scene.createScene.sceneDeletedSuccessfully"));
      }
      resetState();
      router.dismissTo("/(scene)/Scenes");
    } catch (error) {
      console.error("Error deleting scene:", error);
      toast.showError(t("scene.errors.sceneDeletionFailed"));
    } finally {
      setLoading((prev) => ({ ...prev, delete: false }));
    }
  };

  /**
   * Navigates to device action selection screen
   * Passes current scene data for context
   */
  const handleAddDeviceAction = () => {
    router.push({
      pathname: "/(scene)/DeviceSelection",
    } as any);
  };

  const disableActionButton = useMemo(() => {
    return loading.save || !state.sceneName || getSceneActions().length === 0;
  }, [loading.save, state.sceneName, getSceneActions().length]);

  const warning: string = useMemo(() => {
    if (
      state.nodes.some(
        (node) => !nodeStore.nodesByID[node.id].connectivityStatus?.isConnected
      )
    ) {
      return t("scene.scenes.someDevicesNotConnected");
    }
    return "";
  }, [state.nodes]);

  return (
    <>
      <Header
        label={
          state.isEditing
            ? t("scene.createScene.editScene")
            : t("scene.createScene.title")
        }
        showBack={true}
        onBackPress={() => {
          resetState();
        }}
      />
      <ScreenWrapper style={globalStyles.container}>
        {warning && (
          <View
            style={[globalStyles.warningContainer, { marginHorizontal: 0 }]}
          >
            <ShieldAlert size={tokens.fontSize.xs} color={tokens.colors.warn} />
            <Text {...testProps("text_warning")} style={globalStyles.warningText}>{warning}</Text>
          </View>
        )}
        {/* SCENE NAME */}
        <ContentWrapper
          qaId="scene_name"
          title={t("scene.createScene.sceneName")}
          style={styles.contentWrapper}
        >
          <View style={[styles.inputContainer]}>
            <Input
              qaId="scene_name"
              placeholder={t("scene.createScene.sceneNamePlaceholder")}
              value={state.sceneName}
              onFieldChange={setSceneName}
              style={[styles.input]}
              border={false}
              paddingHorizontal={false}
              marginBottom={false}
            />
            <View style={[styles.editIcon]}>
              <Edit3 {...testProps("icon_edit_scene_name")} size={20} color={tokens.colors.text_secondary} />
            </View>
          </View>
        </ContentWrapper>

        {/* SCENE ACTIONS */}
        <View style={[styles.section, styles.sceneActionsContainer]}>
          {/* Header with title and add button */}
          <View style={styles.sceneActionsHeader}>
            <Text {...testProps("text_label_actions")} style={styles.sceneActionsTitle}>
              {t("scene.createScene.sceneActions")}
            </Text>
            <Pressable {...testProps("button_add_action")} onPress={handleAddDeviceAction}>
              <Plus {...testProps("icon_add_action")} size={20} color={tokens.colors.text_secondary} />
            </Pressable>
          </View>

          {/* Device actions list */}
          <ScrollView
            {...testProps("scroll_actions_scenes")}
            style={styles.deviceList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.deviceListContent}
          >
            {getSceneActions().length > 0 ? (
              getSceneActions().map((action: any) => (
                // RENDER SCENE ACTIONS
                <SceneActions
                  qaId={`scene_action_${action.device.name}`}
                  key={action.nodeId + action.device.name}
                  device={action.device}
                  displayDeviceName={action.displayDeviceName}
                  action={action.action}
                  onActionPress={handleAddDeviceAction}
                />
              ))
            ) : (
              <View {...testProps("view_empty_actions_scenes")} style={styles.emptyStateContainer}>
                <View style={styles.emptyStateIconContainer}>
                  <Settings size={35} color={tokens.colors.primary} />
                </View>
                <Text {...testProps("text_title_empty_scenes")} style={globalStyles.emptyStateTitle}>
                  {t("scene.createScene.noActionsSelected")}
                </Text>
                <Text {...testProps("text_description_empty_scenes")} style={globalStyles.emptyStateDescription}>
                  {t("scene.createScene.noActionsSelectedDescription")}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* ACTION BUTTONS */}
        <View
          style={[globalStyles.actionButtonContainer, styles.buttonContainer]}
        >
          {/* SAVE ACTION */}
          <ActionButton
            qaId="button_save_scene"
            onPress={handleSave}
            disabled={disableActionButton}
            variant="primary"
          >
            {loading.save ? (
              <ActivityIndicator size="small" color={tokens.colors.white} />
            ) : (
              <View style={styles.buttonContent}>
                <Check size={16} color={tokens.colors.white} />
                <Text {...testProps("text_save_scene")} style={[globalStyles.fontMedium, globalStyles.textWhite]}>
                  {state.isEditing
                    ? t("layout.shared.update")
                    : t("layout.shared.save")}
                </Text>
              </View>
            )}
          </ActionButton>

          {/* DELETE ACTION */}
          {state.isEditing && (
            <ActionButton
              qaId="button_delete_scene"
              onPress={handleDelete}
              disabled={disableActionButton}
              variant="danger"
            >
              {loading.delete ? (
                <ActivityIndicator size="small" color={tokens.colors.white} />
              ) : (
                <View style={styles.buttonContent}>
                  <Trash2 size={16} color={tokens.colors.white} />
                  <Text {...testProps("text_delete_scene")}
                    style={[globalStyles.fontMedium, globalStyles.textWhite]}
                  >
                    {t("layout.shared.delete")}
                  </Text>
                </View>
              )}
            </ActionButton>
          )}
        </View>
      </ScreenWrapper>
    </>
  );
};

/**
 * SceneActions Component
 *
 * Renders a list of device actions for a scene
 * Allows interaction with individual actions
 *
 * @param {string} device - Device name (e.g. "light")
 * @param {string} displayDeviceName - Display device name
 * @param {Record<string, any>} action - Action object
 * @param {Function} onActionPress - Handler for action press events
 */
const SceneActions = ({
  device,
  displayDeviceName,
  action,
  onActionPress,
  qaId,
}: SceneActionsProps & { qaId?: string }) => {
  return (
    <DeviceAction
      qaId={qaId}
      displayDeviceName={displayDeviceName}
      device={device.type}
      actions={action}
      onPress={() => onActionPress(device.name)}
    />
  );
};

/**
 * Component styles
 * Uses design tokens for consistent theming
 */
const styles = StyleSheet.create({
  section: {
    marginTop: tokens.spacing._15,
  },
  sceneAction: {
    marginBottom: tokens.spacing._10,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: tokens.spacing._10,
  },
  input: {
    flex: 1,
    paddingRight: tokens.spacing._40,
  },
  editIcon: {
    top: tokens.spacing._10,
    position: "absolute",
    right: 0,
  },
  conditionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacing._15,
  },
  sceneActionsContainer: {
    flex: 1,
    marginBottom: tokens.spacing._15,
  },
  sceneActionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: tokens.spacing._10,
  },
  sceneActionsTitle: {
    fontSize: tokens.fontSize.sm,
    fontWeight: 500,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    paddingLeft: tokens.spacing._5,
  },
  deviceList: {
    flex: 1,
  },
  deviceListContent: {
    gap: tokens.spacing._10,
  },
  addDeviceButton: {
    padding: tokens.spacing._15,
    gap: tokens.spacing._10,
  },
  buttonContainer: {
    marginTop: "auto",
    flexDirection: "column",
    alignItems: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    marginTop: "35%",
  },
  emptyStateIconContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: 48,
    padding: 20,
    marginBottom: 24,
  },
  contentWrapper: {
    backgroundColor: tokens.colors.white,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
});

export default CreateScene;
