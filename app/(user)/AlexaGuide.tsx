/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
  Modal,
  ScrollView,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";

// Icons
import { X } from "lucide-react-native";

// Components
import Header from "@/components/Navigations/Header";
import ScreenWrapper from "@/components/Layout/ScreenWrapper";
import PhonePair from "@/components/Layout/PhonePair";

const { width: screenWidth } = Dimensions.get("window");

// types
import { GuideStep } from "@/types/global";

// Constants
const ALEXA_IMAGES = {
  "nova-alexa-1": require("../../assets/images/nova-alexa-1.jpg"),
  "nova-alexa-2": require("../../assets/images/nova-alexa-2.jpg"),
  "nova-alexa-3": require("../../assets/images/nova-alexa-3.jpg"),
  "nova-alexa-4": require("../../assets/images/nova-alexa-4.jpg"),
  "nova-alexa-5": require("../../assets/images/nova-alexa-5.jpg"),
  "nova-alexa-6": require("../../assets/images/nova-alexa-6.jpg"),
  "nova-alexa-7": require("../../assets/images/nova-alexa-7.jpg"),
  "nova-alexa-8": require("../../assets/images/nova-alexa-8.jpg"),
};

/**
 * AlexaGuide
 *
 * A component that displays a step-by-step guide for Alexa integration
 * with interactive image preview functionality
 * @returns JSX component
 */
const AlexaGuide = () => {
  // 1. Hooks
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);

  // 2. State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [allImages, setAllImages] = useState<any[]>([]);

  // 3. Constants
  const images: GuideStep[] = [
    {
      icon1: "nova-alexa-1",
      icon2: "nova-alexa-2",
      title: t("alexa.step1"),
    },
    {
      icon1: "nova-alexa-3",
      icon2: "nova-alexa-4",
      title: t("alexa.step2"),
    },
    {
      icon1: "nova-alexa-5",
      icon2: "nova-alexa-6",
      title: t("alexa.step3"),
    },
    {
      icon1: "nova-alexa-7",
      icon2: "nova-alexa-8",
      title: t("alexa.step4"),
    },
  ];

  // 4. Effects
  useEffect(() => {
    setTitle(images[0].title);

    // Prepare all images for preview using the predefined images
    const imageList: any[] = [];
    images.forEach((item) => {
      imageList.push(ALEXA_IMAGES[item.icon1 as keyof typeof ALEXA_IMAGES]);
      imageList.push(ALEXA_IMAGES[item.icon2 as keyof typeof ALEXA_IMAGES]);
    });
    setAllImages(imageList);
  }, []);

  // 5. Handlers
  const handleScroll = (event: any) => {
    const contentOffset = event.nativeEvent.contentOffset;
    const viewSize = event.nativeEvent.layoutMeasurement;
    const pageNum = Math.floor(contentOffset.x / viewSize.width);
    if (pageNum !== currentIndex && pageNum >= 0 && pageNum < images?.length) {
      setCurrentIndex(pageNum);
      setTitle(images[pageNum].title);
    }
  };

  const handleImagePress = (stepIndex: number, imageIndex: number) => {
    const globalIndex = stepIndex * 2 + imageIndex;
    setPreviewIndex(globalIndex);
    setShowImagePreview(true);
  };

  // 6. Sub-components
  const ImagePreviewModal = () => (
    <Modal
      visible={showImagePreview}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowImagePreview(false)}
    >
      <View style={styles.previewOverlay}>
        <Pressable
          style={styles.closeButton}
          onPress={() => setShowImagePreview(false)}
        >
          <X size={24} color={tokens.colors.white} />
        </Pressable>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.previewScrollView}
          contentOffset={{ x: previewIndex * screenWidth, y: 0 }}
        >
          {allImages.map((image, index) => (
            <View key={index} style={styles.previewImageContainer}>
              <Image
                source={image}
                style={styles.previewImage}
                resizeMode="contain"
              />
              <Text style={styles.previewIndex}>
                {index + 1} / {allImages?.length}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  // 7. Render
  return (
    <>
      <Header label={t("alexa.guide")} showBack={true} />
      <ScreenWrapper style={globalStyles.container}>
        <View style={styles.mainContent}>
          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            style={styles.scrollView}
          >
            {images.map((item, index) => (
              <PhonePair
                key={`step-${index}`}
                leftImage={
                  ALEXA_IMAGES[item.icon1 as keyof typeof ALEXA_IMAGES]
                }
                rightImage={
                  ALEXA_IMAGES[item.icon2 as keyof typeof ALEXA_IMAGES]
                }
                onLeftImagePress={() => handleImagePress(index, 0)}
                onRightImagePress={() => handleImagePress(index, 1)}
              />
            ))}
          </ScrollView>

          <View style={styles.descriptionContainer}>
            <Text style={styles.description}>{title}</Text>
          </View>

          <View style={styles.pageIndicators}>
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.pageIndicator,
                  currentIndex === index && styles.activePageIndicator,
                ]}
              />
            ))}
          </View>
        </View>
        <ImagePreviewModal />
      </ScreenWrapper>
    </>
  );
};

// 8. Styles
const styles = StyleSheet.create({
  mainContent: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    flex: 1,
    padding: tokens.spacing._20,
  },
  scrollView: {
    flex: 1,
  },
  descriptionContainer: {
    marginTop: tokens.spacing._20,
    paddingHorizontal: tokens.spacing._15,
    minHeight: 80,
  },
  description: {
    ...globalStyles.fontRegular,
    fontSize: 16,
    color: tokens.colors.primary,
    textAlign: "left",
    lineHeight: 24,
  },
  pageIndicators: {
    ...globalStyles.flex,
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
    marginTop: tokens.spacing._15,
    marginBottom: tokens.spacing._10,
    gap: tokens.spacing._5,
  },
  pageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.bg2,
  },
  activePageIndicator: {
    backgroundColor: tokens.colors.primary,
    width: 20,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
  },
  closeButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 1,
    padding: tokens.spacing._10,
  },
  previewScrollView: {
    width: screenWidth,
    height: "80%",
  },
  previewImageContainer: {
    width: screenWidth,
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
    paddingHorizontal: tokens.spacing._20,
  },
  previewImage: {
    width: "100%",
    height: "90%",
  },
  previewIndex: {
    ...globalStyles.fontRegular,
    fontSize: 16,
    color: tokens.colors.white,
    textAlign: "center",
    marginTop: tokens.spacing._10,
  },
});

export default AlexaGuide;
