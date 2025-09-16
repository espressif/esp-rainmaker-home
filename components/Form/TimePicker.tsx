/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Modal } from "react-native";
import { useDebounce } from "@/hooks/useDebounce";
import { globalStyles } from "@/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";
import {
  TimePickerProps,
  TimePeriod,
  TimePickerScrollProps,
  TimePickerScrollHandlerProps,
} from "@/types/global";
import {
  getTimePickerScrollParams,
  calculateSelectedIndex,
  generateNumberArray,
} from "@/utils/common";
import { Platform } from "react-native";

const ITEM_HEIGHT = 46;
const VISIBLE_ITEMS = 5;

const TimePicker: React.FC<TimePickerProps> = ({
  visible,
  onClose,
  onTimeSelected,
  initialHour = 1,
  initialMinute = 0,
  initialPeriod = "AM",
}) => {
  const { t } = useTranslation();
  const [selectedHour, setSelectedHour] = useState(initialHour);
  const [selectedMinute, setSelectedMinute] = useState(initialMinute);
  const [selectedPeriod, setSelectedPeriod] =
    useState<TimePeriod>(initialPeriod);

  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);
  const periodScrollRef = useRef<ScrollView>(null);

  const hours = generateNumberArray(1, 12);
  const minutes = generateNumberArray(0, 59);
  const periods: TimePeriod[] = ["AM", "PM"];

  const debouncedScrollTo = useDebounce(
    (index: number, scrollRef: React.RefObject<ScrollView>) => {
      const targetY = index * ITEM_HEIGHT;
      scrollRef.current?.scrollTo({
        y: targetY,
        animated: true,
      });
    },
    100
  );

  useEffect(() => {
    if (visible) {
      // Scroll to initial positions
      setTimeout(() => {
        hourScrollRef.current?.scrollTo({
          y: (initialHour - 1) * ITEM_HEIGHT,
          animated: false,
        });
        minuteScrollRef.current?.scrollTo({
          y: initialMinute * ITEM_HEIGHT,
          animated: false,
        });
        periodScrollRef.current?.scrollTo({
          y: (initialPeriod === "PM" ? 1 : 0) * ITEM_HEIGHT,
          animated: false,
        });
      }, 0);
    }
  }, [visible]);

  const handleScroll = ({
    event,
    items,
    setter,
    scrollRef,
  }: TimePickerScrollHandlerProps) => {
    const y = event.nativeEvent.contentOffset.y;

    if (items.length === 2) {
      // Handle period selection (AM/PM)
      const periodIndex = Math.min(Math.max(0, Math.round(y / ITEM_HEIGHT)), 1);
      setter(items[periodIndex]);
      return;
    }

    const index = calculateSelectedIndex(y, ITEM_HEIGHT);
    if (index >= 0 && index < items.length) {
      setter(items[index]);
      debouncedScrollTo(index, scrollRef);
    }
  };

  const handleDone = () => {
    onTimeSelected(selectedHour, selectedMinute, selectedPeriod);
    onClose();
  };

  const handleItemPress = (
    item: any,
    items: any[],
    setter: (value: any) => void,
    scrollRef: React.RefObject<ScrollView>
  ) => {
    const index = items.indexOf(item);
    if (index !== -1) {
      setter(item);
      const targetY = index * ITEM_HEIGHT;
      scrollRef.current?.scrollTo({
        y: targetY,
        animated: true,
      });
    }
  };

  const renderScrollItems = ({
    items,
    selected,
    paddingZero = false,
    scrollRef,
    setter,
  }: TimePickerScrollProps) => {
    return items.map((item) => (
      <Pressable
        key={item}
        style={[globalStyles.timePickerScrollItem, { height: ITEM_HEIGHT }]}
        onPress={() => handleItemPress(item, items, setter, scrollRef)}
      >
        <Text
          style={[
            globalStyles.timePickerScrollText,
            item === selected && globalStyles.timePickerSelectedText,
            paddingZero && { minWidth: 30 },
          ]}
        >
          {paddingZero ? item.toString().padStart(2, "0") : item}
        </Text>
      </Pressable>
    ));
  };

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
              <Text style={globalStyles.textSecondary}>{t("layout.shared.cancel")}</Text>
            </Pressable>
            <Pressable onPress={handleDone}>
              <Text style={globalStyles.textPrimary}>{t("layout.shared.done")}</Text>
            </Pressable>
          </View>

          <View
            style={[
              globalStyles.timePickerScrollContainer,
              { height: ITEM_HEIGHT * VISIBLE_ITEMS },
            ]}
          >
            {/* Hour Scroll */}
            <ScrollView
              ref={hourScrollRef}
              showsVerticalScrollIndicator={false}
              {...getTimePickerScrollParams(Platform)}
              fadingEdgeLength={50}
              overScrollMode="never"
              bounces={false}
              onScroll={(event) =>
                handleScroll({
                  event,
                  items: hours,
                  setter: setSelectedHour,
                  scrollRef: hourScrollRef,
                })
              }
              contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
              style={[
                globalStyles.timePickerScrollColumn,
                { height: ITEM_HEIGHT * VISIBLE_ITEMS },
              ]}
            >
              {renderScrollItems({
                items: hours,
                selected: selectedHour,
                scrollRef: hourScrollRef,
                setter: setSelectedHour,
              })}
            </ScrollView>

            <Text style={globalStyles.timePickerSeparator}>:</Text>

            {/* Minute Scroll */}
            <ScrollView
              ref={minuteScrollRef}
              showsVerticalScrollIndicator={false}
              {...getTimePickerScrollParams(Platform)}
              onScroll={(event) =>
                handleScroll({
                  event,
                  items: minutes,
                  setter: setSelectedMinute,
                  scrollRef: minuteScrollRef,
                })
              }
              contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
              style={[
                globalStyles.timePickerScrollColumn,
                { height: ITEM_HEIGHT * VISIBLE_ITEMS },
              ]}
            >
              {renderScrollItems({
                items: minutes,
                selected: selectedMinute,
                paddingZero: true,
                scrollRef: minuteScrollRef,
                setter: setSelectedMinute,
              })}
            </ScrollView>

            {/* Period Scroll */}
            <ScrollView
              ref={periodScrollRef}
              showsVerticalScrollIndicator={false}
              {...getTimePickerScrollParams(Platform)}
              onScroll={(event) =>
                handleScroll({
                  event,
                  items: periods,
                  setter: setSelectedPeriod,
                  scrollRef: periodScrollRef,
                })
              }
              contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
              style={[
                globalStyles.timePickerScrollColumn,
                { height: ITEM_HEIGHT * VISIBLE_ITEMS, marginLeft: 15 },
              ]}
            >
              {renderScrollItems({
                items: periods,
                selected: selectedPeriod,
                scrollRef: periodScrollRef,
                setter: setSelectedPeriod,
              })}
            </ScrollView>
          </View>

          {/* Selection Indicator */}
          <View
            style={[
              globalStyles.timePickerSelectionIndicator,
              {
                top: "50%",
                marginTop: 1,
                height: ITEM_HEIGHT,
              },
            ]}
            pointerEvents="none"
          />
        </View>
      </View>
    </Modal>
  );
};

export default TimePicker;
