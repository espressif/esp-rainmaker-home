/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Plus } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import SceneActions from "./SceneActions";

type SceneActionsListProps = {
  actions: any[];
  onAddPress: () => void;
  title: string;
};

/**
 * SceneActionsList Component
 *
 * Renders the actions section header and a scrollable list of selected
 * device actions. Empty state is owned by the create-scene screen stack.
 */
export default function SceneActionsList({
  actions,
  onAddPress,
  title,
}: SceneActionsListProps) {
  const hasActions = actions.length > 0;

  return (
    <View style={[styles.container, hasActions && styles.containerWithList]}>
      <View style={styles.header}>
        <Text {...testProps("text_label_actions")} style={styles.title}>
          {title}
        </Text>
        <Pressable {...testProps("button_add_action")} onPress={onAddPress}>
          <Plus
            {...testProps("icon_add_action")}
            size={20}
            color={tokens.colors.text_secondary}
          />
        </Pressable>
      </View>

      {hasActions && (
        <ScrollView
          {...testProps("scroll_actions_scenes")}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        >
          {actions.map((action: any) => (
            <SceneActions
              qaId={`scene_action_${action.device.name}`}
              key={action.nodeId + action.device.name}
              device={action.device}
              displayDeviceName={action.displayDeviceName}
              action={action.action}
              onActionPress={onAddPress}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: tokens.spacing._15,
    marginBottom: tokens.spacing._15,
  },
  containerWithList: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: tokens.spacing._10,
  },
  title: {
    fontSize: tokens.fontSize.sm,
    fontWeight: 500,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    paddingLeft: tokens.spacing._5,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: tokens.spacing._10,
  },
});
