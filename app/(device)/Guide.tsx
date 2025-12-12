import { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Text,
  Pressable,
  Linking,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { marked } from "marked";
import RenderHTML, {
  defaultSystemFonts,
  CustomBlockRenderer,
} from "react-native-render-html";
import axios from "axios";
import { SvgUri } from "react-native-svg";
import { Header } from "@/components";
import { ScreenWrapper } from "@/components";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";

export default function Guide() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    url: string;
    title?: string;
    deviceName?: string;
    fromProvision?: string;
  }>();
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const screenWidth = useMemo(() => Dimensions.get("window").width, []);

  useEffect(() => {
    const fetchMarkdown = async () => {
      if (!params.url) {
        setError(t("device.errors.noReadmeURLProvided"));
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Fetch the markdown file from the internet
        const response = await axios.get(params.url, {
          headers: {
            Accept: "text/markdown, text/plain, application/xml, */*",
          },
          timeout: 10000, // 10 seconds timeout
        });

        setMarkdownContent(response.data);
      } catch (err: any) {
        console.error("Error fetching markdown:", err);
        setError(err.message || "Failed to load content");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarkdown();
  }, [params.url]);

  // Convert markdown to HTML (no content removal - show everything)
  const htmlContent = useMemo(() => {
    if (!markdownContent) return "";
    let html = marked.parse(markdownContent, { breaks: true }) as string;

    // Fix list item rendering - remove line breaks right after <li> tags
    // This ensures bullet points and text appear on the same line
    html = html.replace(/<li>\s*\n/g, "<li>");
    html = html.replace(/<li><p>/g, "<li>");
    html = html.replace(/<\/p><\/li>/g, "</li>");

    return html;
  }, [markdownContent]);

  // HTML styles for RenderHTML
  const htmlStyles = useMemo(
    () => ({
      body: {
        color: tokens.colors.text_primary,
        fontSize: 16,
        lineHeight: 24,
        fontFamily: tokens.fonts.regular,
        padding: 16,
      },
      h1: {
        fontSize: 24,
        fontWeight: "bold" as const,
        marginBottom: 12,
        marginTop: 16,
        color: tokens.colors.text_primary,
      },
      h2: {
        fontSize: 20,
        fontWeight: "bold" as const,
        marginBottom: 10,
        marginTop: 14,
        color: tokens.colors.text_primary,
      },
      h3: {
        fontSize: 18,
        fontWeight: "bold" as const,
        marginBottom: 8,
        marginTop: 12,
        color: tokens.colors.text_primary,
      },
      p: {
        marginBottom: 12,
        lineHeight: 24,
      },
      ul: {
        marginBottom: 12,
        paddingLeft: 20,
        marginLeft: 0,
      },
      ol: {
        marginBottom: 12,
        paddingLeft: 20,
        marginLeft: 0,
      },
      li: {
        marginBottom: 10,
        lineHeight: 24,
        paddingLeft: 4,
      },
      img: {
        marginVertical: 12,
        alignSelf: "center" as const,
      },
      code: {
        backgroundColor: tokens.colors.bg1,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        fontFamily: "monospace",
      },
      pre: {
        backgroundColor: tokens.colors.bg1,
        padding: 12,
        borderRadius: 8,
        marginVertical: 8,
      },
      a: {
        color: tokens.colors.primary,
        textDecorationLine: "underline" as const,
      },
      div: {
        marginVertical: 8,
      },
    }),
    []
  );

  // Transform GitHub wiki image URLs to raw format
  const transformImageUrl = useCallback((url: string): string => {
    if (!url) return url;

    // Transform GitHub wiki image URLs
    // From: https://github.com/espressif/esp_agents_firmware/wiki/images/xxx.jpeg
    // To: https://raw.githubusercontent.com/wiki/espressif/esp-agents-firmware/images/xxx.jpeg
    const wikiMatch = url.match(
      /https:\/\/github\.com\/([^/]+)\/([^/]+)\/wiki\/images\/(.+)/
    );
    if (wikiMatch) {
      const [, owner, repo, imagePath] = wikiMatch;
      // Fix repo name - replace underscores with hyphens (esp_agents_firmware -> esp-agents-firmware)
      const fixedRepo = repo.replace(/_/g, "-");
      return `https://raw.githubusercontent.com/wiki/${owner}/${fixedRepo}/images/${imagePath}`;
    }

    return url;
  }, []);

  // Image component with loading state
  const GuideImage = useCallback(
    ({
      src,
      width,
      height,
    }: {
      src: string;
      width: number;
      height: number;
    }) => {
      const [isLoading, setIsLoading] = useState(true);
      const [hasError, setHasError] = useState(false);

      if (hasError) {
        // Show placeholder on error
        return (
          <View
            style={{
              alignItems: "center",
              marginVertical: 12,
              width,
              height,
              backgroundColor: tokens.colors.bg1,
              borderRadius: 8,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: tokens.colors.text_secondary, fontSize: 12 }}>
              Image unavailable
            </Text>
          </View>
        );
      }

      return (
        <View style={{ alignItems: "center", marginVertical: 12 }}>
          {isLoading && (
            <View
              style={{
                position: "absolute",
                width,
                height,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: tokens.colors.bg1,
                borderRadius: 8,
              }}
            >
              <ActivityIndicator size="small" color={tokens.colors.primary} />
            </View>
          )}
          <Image
            source={{ uri: src }}
            style={{
              width,
              height,
              resizeMode: "contain",
              borderRadius: 8,
            }}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setHasError(true);
              setIsLoading(false);
            }}
          />
        </View>
      );
    },
    []
  );

  // Custom renderer for images (handles SVG and regular images)
  const customRenderers = useMemo(
    () => ({
      img: (({ tnode }) => {
        const rawSrc = tnode.attributes.src;
        const src = transformImageUrl(rawSrc);

        // Use specified width or default to responsive width
        const specifiedWidth = parseInt(tnode.attributes.width, 10);
        const specifiedHeight = parseInt(tnode.attributes.height, 10);

        // Default to 200px width for guide images, or use specified
        const width = specifiedWidth || 200;
        // For images without height, default to reasonable height
        const height = specifiedHeight || Math.round(width * 1.5);

        if (!src) return null;

        // Handle SVG images using SvgUri
        if (src.toLowerCase().endsWith(".svg")) {
          return (
            <View style={{ alignItems: "center", marginVertical: 12 }}>
              <SvgUri uri={src} width={width} height={specifiedHeight || 50} />
            </View>
          );
        }

        // Handle regular images (JPEG, PNG, etc.)
        return <GuideImage src={src} width={width} height={height} />;
      }) as CustomBlockRenderer,
    }),
    [transformImageUrl, GuideImage]
  );
  // Render configuration for links
  const renderersProps = useMemo(
    () => ({
      a: {
        onPress: (_: any, href: string) => {
          if (href) {
            Linking.openURL(href);
          }
        },
      },
    }),
    []
  );

  // System fonts for RenderHTML
  const systemFonts = useMemo(
    () => [...defaultSystemFonts, tokens.fonts.regular, tokens.fonts.medium],
    []
  );

  // Handle back button press
  const handleBackPress = () => {
    if (params.fromProvision === "true") {
      // If coming from provision flow, dismiss to Home screen
      // This removes all screens above Home from the stack
      router.dismissTo("/(group)/Home" as any);
    } else {
      // Otherwise, normal back navigation
      router.back();
    }
  };

  return (
    <>
      <Header
        label={params.title || "Guide"}
        showBack={true}
        onBackPress={handleBackPress}
      />

      <ScreenWrapper>
        {isLoading ? (
          <View style={globalStyles.chatSettingsCenterContainer}>
            <ActivityIndicator size="large" color={tokens.colors.primary} />
          </View>
        ) : error ? (
          <View
            style={[globalStyles.chatSettingsCenterContainer, { padding: 20 }]}
          >
            <Text
              style={[globalStyles.textCenter, { color: tokens.colors.error }]}
            >
              {error}
            </Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }}>
            <Pressable onPress={() => {}}>
              <RenderHTML
                contentWidth={screenWidth - 32}
                source={{ html: htmlContent }}
                tagsStyles={htmlStyles}
                renderers={customRenderers}
                renderersProps={renderersProps}
                systemFonts={systemFonts}
                enableExperimentalBRCollapsing={true}
                enableExperimentalMarginCollapsing={true}
                baseStyle={{
                  color: tokens.colors.text_primary,
                  fontSize: 16,
                  lineHeight: 24,
                }}
              />
            </Pressable>
          </ScrollView>
        )}
      </ScreenWrapper>
    </>
  );
}
