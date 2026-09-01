/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useDebounce } from "@shared/hooks/useDebounce";
import {
  calculateSelectedIndex,
  generateNumberArray,
  getTimePickerScrollParams,
} from "@shared/utils/common";
import { SCHEDULE_RELATIVE_MAX_HOURS } from "@shared/utils/constants";
import { relativeHoursMinutesToSeconds } from "@features/schedule/utils/scheduleHelper";
import type { RelativeTimePickerProps } from "@src/types/global";

const ITEM_HEIGHT = 46;
const VISIBLE_ITEMS = 5;

/**
 * Modal wheel picker for relative schedule delay up to three hours.
 */
const RelativeTimePicker = ({
  visible,
  onClose,
  onDurationSelected,
  initialHours = 0,
  initialMinutes = 30,
}: RelativeTimePickerProps) => {
  const { t } = useTranslation();
  const [selectedHours, setSelectedHours] = useState(initialHours);
  const [selectedMinutes, setSelectedMinutes] = useState(initialMinutes);

  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);

  const hours = useMemo(
    () => generateNumberArray(0, SCHEDULE_RELATIVE_MAX_HOURS),
    [],
  );
  const minutes = useMemo(() => {
    if (selectedHours >= SCHEDULE_RELATIVE_MAX_HOURS) {
      return [0];
    }
    return generateNumberArray(0, 59);
  }, [selectedHours]);

  const debouncedScrollTo = useDebounce(
    (index: number, scrollRef: React.RefObject<ScrollView | null>) => {
      scrollRef.current?.scrollTo({
        y: index * ITEM_HEIGHT,
        animated: true,
      });
    },
    100,
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelectedHours(initialHours);
    setSelectedMinutes(initialMinutes);
    setTimeout(() => {
      hourScrollRef.current?.scrollTo({
        y: initialHours * ITEM_HEIGHT,
        animated: false,
      });
      minuteScrollRef.current?.scrollTo({
        y: initialMinutes * ITEM_HEIGHT,
        animated: false,
      });
    }, 0);
  }, [visible, initialHours, initialMinutes]);

  useEffect(() => {
    if (selectedHours >= SCHEDULE_RELATIVE_MAX_HOURS && selectedMinutes > 0) {
      setSelectedMinutes(0);
      minuteScrollRef.current?.scrollTo({
        y: 0,
        animated: true,
      });
    }
  }, [selectedHours, selectedMinutes]);

  const handleScroll = (
    event: { nativeEvent: { contentOffset: { y: number } } },
    items: number[],
    setter: (value: number) => void,
    scrollRef: React.RefObject<ScrollView | null>,
  ) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = calculateSelectedIndex(y, ITEM_HEIGHT);
    if (index >= 0 && index < items.length) {
      setter(items[index]);
      debouncedScrollTo(index, scrollRef);
    }
  };

  const handleItemPress = (
    item: number,
    items: number[],
    setter: (value: number) => void,
    scrollRef: React.RefObject<ScrollView | null>,
  ) => {
    const index = items.indexOf(item);
    if (index !== -1) {
      setter(item);
      scrollRef.current?.scrollTo({
        y: index * ITEM_HEIGHT,
        animated: true,
      });
    }
  };

  const handleDone = () => {
    const rsec = relativeHoursMinutesToSeconds(selectedHours, selectedMinutes);
    const { hours, minutes } = {
      hours: Math.floor(rsec / 3600),
      minutes: Math.floor((rsec % 3600) / 60),
    };
    onDurationSelected(hours, minutes);
    onClose();
  };

  const renderScrollItems = (
    items: number[],
    selected: number,
    scrollRef: React.RefObject<ScrollView | null>,
    setter: (value: number) => void,
  ) =>
    items.map((item) => (
      <Pressable
        key={item}
        style={[globalStyles.timePickerScrollItem, { height: ITEM_HEIGHT }]}
        onPress={() => handleItemPress(item, items, setter, scrollRef)}
      >
        <Text
          style={[
            globalStyles.timePickerScrollText,
            item === selected && globalStyles.timePickerSelectedText,
            { minWidth: 30 },
          ]}
        >
          {item.toString().padStart(2, "0")}
        </Text>
      </Pressable>
    ));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={globalStyles.timePickerModal}>
        <View style={globalStyles.timePickerContainer}>
          <View style={globalStyles.timePickerHeader}>
            <Pressable onPress={onClose}>
              <Text style={globalStyles.textSecondary}>
                {t("layout.shared.cancel")}
              </Text>
            </Pressable>
            <Pressable onPress={handleDone}>
              <Text style={globalStyles.textPrimary}>
                {t("layout.shared.done")}
              </Text>
            </Pressable>
          </View>

          <Text style={globalStyles.scheduleRelativePickerHint}>
            {t("schedule.time.relativeMaxHint", {
              hours: SCHEDULE_RELATIVE_MAX_HOURS,
            })}
          </Text>

          <View
            style={[
              globalStyles.timePickerScrollContainer,
              { height: ITEM_HEIGHT * VISIBLE_ITEMS },
            ]}
          >
            <ScrollView
              ref={hourScrollRef}
              showsVerticalScrollIndicator={false}
              {...getTimePickerScrollParams(Platform)}
              fadingEdgeLength={50}
              overScrollMode="never"
              bounces={false}
              onScroll={(event) =>
                handleScroll(event, hours, setSelectedHours, hourScrollRef)
              }
              contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
              style={[
                globalStyles.timePickerScrollColumn,
                { height: ITEM_HEIGHT * VISIBLE_ITEMS },
              ]}
            >
              {renderScrollItems(
                hours,
                selectedHours,
                hourScrollRef,
                setSelectedHours,
              )}
            </ScrollView>

            <Text style={globalStyles.timePickerSeparator}>:</Text>

            <ScrollView
              ref={minuteScrollRef}
              showsVerticalScrollIndicator={false}
              {...getTimePickerScrollParams(Platform)}
              fadingEdgeLength={50}
              overScrollMode="never"
              bounces={false}
              onScroll={(event) =>
                handleScroll(event, minutes, setSelectedMinutes, minuteScrollRef)
              }
              contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
              style={[
                globalStyles.timePickerScrollColumn,
                { height: ITEM_HEIGHT * VISIBLE_ITEMS },
              ]}
            >
              {renderScrollItems(
                minutes,
                selectedMinutes,
                minuteScrollRef,
                setSelectedMinutes,
              )}
            </ScrollView>
          </View>

          <View style={globalStyles.scheduleRelativePickerLabels}>
            <Text style={globalStyles.textSecondary}>
              {t("schedule.time.hours")}
            </Text>
            <Text style={globalStyles.textSecondary}>
              {t("schedule.time.minutes")}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default RelativeTimePicker;
