/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from "react";
import {
  StyleSheet,
  RefreshControl,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import { Schedule } from "@espressif/rainmaker-base-cdf";

// Hooks
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";

// Mobx observer
import { observer } from "mobx-react-lite";

// Icons
import { LayoutPanelLeft, RefreshCw } from "lucide-react-native";

// Components
import {
  Header,
  ScreenWrapper,
  ScheduleCard,
  Button,
  InputDialog,
} from "@/components";
import { useSchedule } from "@/context/schedules.context";

/**
 * Schedules  Component
 *
 * A screen component that displays and manages schedules.
 * Allows users to view, create, edit, enable, disable  schedules.
 *
 * Features:
 * - Lists all available schedules
 * - Create new schedules
 * - Edit existing schedules
 * - Enable existing schedules
 * - Disable existing schedules
 * - Pull to refresh
 */
const Schedules = observer(() => {
  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const { store } = useCDF();
  const { resetState } = useSchedule();
  const { scheduleStore, groupStore, nodeStore } = store;

  const { scheduleList } = scheduleStore;

  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [scheduleLoadingStates, setScheduleLoadingStates] = useState<
    Record<string, string>
  >({});
  const [isScheduleNameDialogVisible, setIsScheduleNameDialogVisible] =
    useState(false);
  const [scheduleName, setScheduleName] = useState("");

  /**
   * Fetches latest schedule data from nodes
   */
  const fetchSchedules = async () => {
    try {
      setIsLoading(true);
      await nodeStore.syncNodeList();
      const currentHome = groupStore?._groupsByID[groupStore?.currentHomeId];
      await scheduleStore.syncSchedulesFromNodes(currentHome.nodes || []);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      toast.showError(t("schedule.errors.fallback"));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Effect: Updates schedules when screen comes into focus
   * Ensures schedule list is always current when viewing
   */
  useFocusEffect(
    useCallback(() => {
      fetchSchedules();
    }, [])
  );

  /**
   * Handles showing the schedule name input dialog
   */
  const handleAddSchedule = () => {
    resetState();
    setScheduleName("");
    setIsScheduleNameDialogVisible(true);
  };

  /**
   * Handles schedule name input confirmation
   * Navigates to CreateSchedule with the entered name
   */
  const handleScheduleNameConfirm = (name: string) => {
    if (name.trim()) {
      setIsScheduleNameDialogVisible(false);
      router.push({
        pathname: "/(schedule)/CreateSchedule",
        params: {
          scheduleName: name.trim(),
        },
      } as any);
    }
  };

  /**
   * Handles schedule action (enable/disable/edit/delete)
   */
  const handleScheduleAction = async (schedule: Schedule, action: string) => {
    if (!schedule) return;
    setScheduleLoadingStates((prev) => ({ ...prev, [schedule.id]: action }));

    try {
      switch (action) {
        case "enable": {
          await schedule.enable();
          toast.showSuccess(
            t("schedule.schedules.scheduleEnabledSuccessfully")
          );
          break;
        }
        case "disable": {
          await schedule.disable();
          toast.showSuccess(
            t("schedule.schedules.scheduleDisabledSuccessfully")
          );
          break;
        }
        case "edit": {
          router.push({
            pathname: "/(schedule)/CreateSchedule",
            params: {
              scheduleName: schedule.name,
              scheduleId: schedule.id,
            },
          } as any);
          break;
        }
        case "delete": {
          await schedule.remove();
          toast.showSuccess(
            t("schedule.schedules.scheduleDeletedSuccessfully")
          );
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error(`Error performing ${action} on schedule:`, error);
      toast.showError(t("schedule.errors.fallback"));
    } finally {
      setTimeout(() => {
        setScheduleLoadingStates((prev) => {
          const newState = { ...prev };
          delete newState[schedule.id];
          return newState;
        });
      }, 1000);
    }
  };

  /**
   * Renders empty state when no schedules exist
   */
  const renderEmptyState = () => {
    return (
      <View style={[globalStyles.sceneEmptyStateContainer]}>
        {!isLoading && (
          <>
            <View style={globalStyles.sceneEmptyStateIconContainerTop}>
              <LayoutPanelLeft size={35} color={tokens.colors.primary} />
            </View>
            <Text style={globalStyles.emptyStateTitle}>
              {t("schedule.schedules.noSchedulesYet")}
            </Text>
            <Text style={globalStyles.emptyStateDescription}>
              {t("schedule.schedules.noSchedulesYetDescription")}
            </Text>
          </>
        )}
      </View>
    );
  };

  return (
    <>
      <Header
        label={t("schedule.schedules.title")}
        showBack={false}
        rightSlot={
          scheduleList.length > 0 ? (
            <TouchableOpacity
              onPress={() => setIsEditing(!isEditing)}
              style={styles.editButtonContainer}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.editButton}>
                {isEditing
                  ? t("schedule.schedules.done")
                  : t("schedule.schedules.edit")}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={fetchSchedules}
              style={styles.editButtonContainer}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
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
            paddingBottom: 150,
          }}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={fetchSchedules} />
          }
        >
          {scheduleList.length > 0
            ? scheduleList.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  name={schedule.name}
                  triggers={schedule.triggers}
                  deviceCount={schedule.devicesCount}
                  enabled={schedule.enabled || false}
                  isEditing={isEditing}
                  onToggle={(value) =>
                    handleScheduleAction(schedule, value ? "enable" : "disable")
                  }
                  onPress={() => handleScheduleAction(schedule, "edit")}
                  onDelete={() => handleScheduleAction(schedule, "delete")}
                  deleteLoading={
                    scheduleLoadingStates[schedule.id] === "delete"
                  }
                  toggleLoading={
                    scheduleLoadingStates[schedule.id] === "enable" ||
                    scheduleLoadingStates[schedule.id] === "disable"
                  }
                />
              ))
            : renderEmptyState()}
        </ScrollView>

        {/* Fixed Add Schedule Button */}
        <View style={globalStyles.footerAddButtonContainer}>
          <Button
            label={t("schedule.schedules.addSchedule")}
            onPress={handleAddSchedule}
            style={globalStyles.footerAddButton}
          />
        </View>
      </ScreenWrapper>

      {/* Schedule Name Input Dialog */}
      <InputDialog
        open={isScheduleNameDialogVisible}
        title={t("schedule.schedules.createSchedule")}
        inputPlaceholder={t("schedule.schedules.scheduleNamePlaceholder")}
        confirmLabel={t("layout.shared.next")}
        cancelLabel={t("layout.shared.cancel")}
        onSubmit={handleScheduleNameConfirm}
        onCancel={() => setIsScheduleNameDialogVisible(false)}
        initialValue={scheduleName}
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
    paddingBottom: 100,
  },
  editButtonContainer: {
    padding: tokens.spacing._10,
    marginRight: -tokens.spacing._10,
  },
  editButton: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
});

export default Schedules;
