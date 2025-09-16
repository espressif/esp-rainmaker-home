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
  ActivityIndicator,
  ScrollView,
} from "react-native";
import TimePicker from "@/components/Form/TimePicker";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSchedule } from "@/context/schedules.context";
import { useCDF } from "@/hooks/useCDF";

// Icons
import {
  Edit3,
  Check,
  Settings,
  ShieldAlert,
  Trash2,
} from "lucide-react-native";

// Components
import {
  ScreenWrapper,
  ContentWrapper,
  Input,
  Header,
  ActionButton,
} from "@/components";
import {
  ScheduleActions,
  ScheduleTime,
  ScheduleDays,
  ScheduleActionsHeader,
} from "@/components/Schedule";

import { LoadingState } from "@/types/global";

/**
 * CreateSchedule Component
 *
 * A screen component for creating and editing schedules.
 * Allows users to define schedule actions for multiple devices.
 *
 * Features:
 * - Create new schedules with custom names and actions
 * - Edit existing schedules
 * - Add/modify device actions
 * - Delete schedules
 * - Set schedule timing and repeat options
 */
const CreateSchedule = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    store: { scheduleStore },
  } = useCDF();
  const { scheduleName: paramScheduleName, scheduleId: paramScheduleId } =
    useLocalSearchParams();
  const {
    state,
    initializeSchedule,
    handleSaveSchedule,
    handleDeleteSchedule,
    checkOfflineNodes,
    setScheduleName,
    setTriggers,
    resetState,
    getScheduleActions,
    setScheduleInfo,
  } = useSchedule();

  const selectedDays = state.triggers[0]?.d
    ? Array.from({ length: 7 }, (_, i) =>
        state.triggers[0]?.d && state.triggers[0].d & (1 << i) ? i : -1
      ).filter((i) => i !== -1)
    : [];

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState<LoadingState>({
    save: false,
    delete: false,
  });

  useEffect(() => {
    const initSchedule = async () => {
      if (paramScheduleId) {
        // Edit mode - fetch schedule data
        const schedule = scheduleStore.schedulesByID[paramScheduleId as string];
        if (schedule) {
          setScheduleInfo({
            id: schedule.id,
            name: schedule.name,
            actions: schedule.action,
            nodes: schedule.nodes,
            enabled: schedule.enabled,
            triggers: schedule.triggers,
            validity: schedule.validity,
            info: schedule.info,
            flags: schedule.flags,
            outOfSyncMeta: schedule.outOfSyncMeta,
          });
        }
      } else {
        // Create mode - initialize new schedule
        initializeSchedule();
        // Initialize with current time
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        setTriggers([{ m: minutes, d: 0 }]);
      }
    };

    initSchedule();
  }, [paramScheduleId]);

  useEffect(() => {
    if (paramScheduleName) {
      setScheduleName(paramScheduleName as string);
    }
  }, [paramScheduleName]);

  const handleSave = async () => {
    setLoading((prev) => ({ ...prev, save: true }));
    try {
      const success = await handleSaveSchedule();
      if (success) {
        resetState();
        router.dismissTo("/(schedule)/Schedules");
      }
    } finally {
      setLoading((prev) => ({ ...prev, save: false }));
    }
  };

  const handleDelete = async () => {
    setLoading((prev) => ({ ...prev, delete: true }));
    try {
      const success = await handleDeleteSchedule();
      if (success) {
        resetState();
        router.dismissTo("/(schedule)/Schedules");
      }
    } finally {
      setLoading((prev) => ({ ...prev, delete: false }));
    }
  };

  const handleAddDeviceAction = () => {
    router.push({
      pathname: "/(schedule)/ScheduleDeviceSelection",
    } as any);
  };

  const disableActionButton = useMemo(() => {
    return (
      loading.save || !state.scheduleName || getScheduleActions().length === 0
    );
  }, [loading.save, state.scheduleName, getScheduleActions().length]);

  const warning: string = useMemo(() => {
    if (checkOfflineNodes()) {
      return t("schedule.schedules.someDevicesNotConnected");
    }
    return "";
  }, [state.nodes]);

  return (
    <>
      <Header
        label={
          state.isEditing
            ? t("schedule.createSchedule.editSchedule")
            : t("schedule.createSchedule.title")
        }
        showBack={true}
        onBackPress={() => resetState()}
      />
      <ScreenWrapper style={globalStyles.container}>
        {warning && (
          <View
            style={[globalStyles.warningContainer, { marginHorizontal: 0 }]}
          >
            <ShieldAlert size={tokens.fontSize.xs} color={tokens.colors.warn} />
            <Text style={globalStyles.warningText}>{warning}</Text>
          </View>
        )}
        {/* SCHEDULE NAME */}
        <ContentWrapper
          title={t("schedule.createSchedule.scheduleName")}
          style={styles.contentWrapper}
        >
          <View style={[styles.inputContainer]}>
            <Input
              placeholder={t("schedule.createSchedule.scheduleNamePlaceholder")}
              value={state.scheduleName}
              onFieldChange={setScheduleName}
              style={[styles.input]}
              border={false}
              paddingHorizontal={false}
              marginBottom={false}
            />
            <View style={[styles.editIcon]}>
              <Edit3 size={20} color={tokens.colors.text_secondary} />
            </View>
          </View>
        </ContentWrapper>

        {/* TIME SECTION */}
        <ScheduleTime
          minutes={state.triggers[0]?.m || 0}
          onTimePress={() => setShowTimePicker(true)}
        />

        {/* REPEAT SECTION */}
        <ScheduleDays
          selectedDays={selectedDays}
          onDayPress={(index) => {
            const newDays = selectedDays.includes(index)
              ? selectedDays.filter((d) => d !== index)
              : [...selectedDays, index];
            const daysBitmap = newDays.reduce(
              (acc, day) => acc | (1 << day),
              0
            );
            setTriggers([
              {
                ...state.triggers[0],
                d: daysBitmap,
              },
            ]);
          }}
        />

        {/* SCHEDULE ACTIONS */}
        <View style={[styles.section, styles.scheduleActionsContainer]}>
          <ScheduleActionsHeader
            onAddPress={handleAddDeviceAction}
          />

          {/* Device actions list */}
          <ScrollView
            style={styles.deviceList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.deviceListContent}
          >
            {getScheduleActions().length > 0 ? (
              getScheduleActions().map((action: any) => (
                <ScheduleActions
                  key={action.nodeId + action.device.name}
                  device={action.device}
                  displayDeviceName={action.displayDeviceName}
                  action={action.action}
                  onActionPress={handleAddDeviceAction}
                  nodeId={action.nodeId}
                />
              ))
            ) : (
              <View style={styles.emptyStateContainer}>
                <View style={styles.emptyStateIconContainer}>
                  <Settings size={35} color={tokens.colors.primary} />
                </View>
                <Text style={globalStyles.emptyStateTitle}>
                  {t("schedule.createSchedule.noActionsSelected")}
                </Text>
                <Text style={globalStyles.emptyStateDescription}>
                  {t("schedule.createSchedule.noActionsSelectedDescription")}
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
            onPress={handleSave}
            disabled={disableActionButton}
            variant="primary"
          >
            {loading.save ? (
              <ActivityIndicator size="small" color={tokens.colors.white} />
            ) : (
              <View style={styles.buttonContent}>
                <Check size={16} color={tokens.colors.white} />
                <Text style={[globalStyles.fontMedium, globalStyles.textWhite]}>
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
              onPress={handleDelete}
              disabled={disableActionButton}
              variant="danger"
            >
              {loading.delete ? (
                <ActivityIndicator size="small" color={tokens.colors.white} />
              ) : (
                <View style={styles.buttonContent}>
                  <Trash2 size={16} color={tokens.colors.white} />
                  <Text
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

      {/* Time Picker Modal */}
      <TimePicker
        visible={showTimePicker}
        onClose={() => setShowTimePicker(false)}
        onTimeSelected={(hours, minutes, period) => {
          let totalHours = hours;
          if (period === "PM" && hours !== 12) {
            totalHours += 12;
          } else if (period === "AM" && hours === 12) {
            totalHours = 0;
          }
          const totalMinutes = totalHours * 60 + minutes;
          setTriggers([
            {
              ...state.triggers[0],
              m: totalMinutes,
            },
          ]);
          setShowTimePicker(false);
        }}
        initialHour={
          state.triggers[0]?.m
            ? Math.floor(state.triggers[0].m / 60) % 12 || 12
            : 12
        }
        initialMinute={state.triggers[0]?.m ? state.triggers[0].m % 60 : 0}
        initialPeriod={
          state.triggers[0]?.m && Math.floor(state.triggers[0].m / 60) >= 12
            ? "PM"
            : "AM"
        }
      />
    </>
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
  settingsContainer: {
    paddingHorizontal: tokens.spacing._15,
    marginVertical: tokens.spacing._15,
  },
  settingRow: {
    ...globalStyles.scheduleRow,
  },
  sectionTitle: {
    fontSize: tokens.fontSize.sm,
    fontWeight: "500",
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    paddingLeft: tokens.spacing._5,
  },
  timeButton: {
    alignItems: "flex-end",
  },
  timeText: {
    ...globalStyles.scheduleTimeText,
  },
  daysContainer: {
    flexDirection: "row",
    gap: tokens.spacing._5,
    justifyContent: "flex-end",
  },
  dayButton: {
    ...globalStyles.scheduleDayButton,
  },
  dayButtonSelected: {
    ...globalStyles.scheduleDayButtonSelected,
  },
  dayText: {
    ...globalStyles.scheduleDayText,
  },
  dayTextSelected: {
    ...globalStyles.scheduleDayTextSelected,
  },
  scheduleAction: {
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
  scheduleActionsContainer: {
    ...globalStyles.scheduleActionsContainer,
  },
  scheduleActionsHeader: {
    ...globalStyles.scheduleActionsHeader,
  },
  scheduleActionsTitle: {
    ...globalStyles.scheduleActionsTitle,
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

export default CreateSchedule;
