/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  Modal,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ChevronLeft, Play, ImageOff, X, Cloud, HardDrive, Trash2, Check } from "lucide-react-native";

import { useGallery } from "@features/gallery/hooks/useGallery";
import { useRecordings } from "@features/gallery/hooks/useRecordings";
import ZoomableImage from "@features/gallery/components/ZoomableImage";
import {
  GALLERY_FILTER_ALL,
  GALLERY_MEDIA_TYPE_IMAGE,
  GALLERY_MEDIA_TYPE_VIDEO,
  GALLERY_SOURCE_CLOUD,
  GALLERY_SOURCE_DEVICE,
  type GallerySource,
} from "@features/gallery/utils/constants";
import type { GalleryFilter } from "@features/gallery/types";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

const GRID_COLUMNS = 3;
const GRID_GAP = 4;
const FILTERS: { key: GalleryFilter; label: string }[] = [
  { key: GALLERY_FILTER_ALL, label: "All" },
  { key: GALLERY_MEDIA_TYPE_IMAGE, label: "Photos" },
  { key: GALLERY_MEDIA_TYPE_VIDEO, label: "Videos" },
];

/** A unified grid tile spanning snapshots (images) and recordings (videos). */
interface Tile {
  id: string;
  /** Image URI to render (presigned URL or a base64 data URI). */
  uri?: string;
  isVideo: boolean;
  /** Storage source, shown as a bottom-right badge (cloud vs device-SD). */
  source: GallerySource;
  /**
   * RainMaker `file_id` for deletable `/user/file` items (snapshots/clips).
   * Undefined for KVS recordings, which aren't deletable via the file API.
   */
  fileId?: string;
}

/**
 * Device media gallery screen. Merges RainMaker snapshots (Photos) and KVS
 * recording thumbnails (Videos) into one grid, filterable by All/Photos/Videos,
 * with a full-screen viewer. Live video (HLS) playback is a follow-up — tapping
 * a recording currently enlarges its thumbnail.
 * @returns The gallery screen.
 */
const Gallery: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, device } = useLocalSearchParams<{ id: string; device?: string }>();
  const {
    files,
    loading: snapLoading,
    error: snapError,
    refresh: snapRefresh,
    deleteFile,
  } = useGallery(id);
  const {
    thumbnails,
    loading: recLoading,
    error: recError,
    refresh: recRefresh,
  } = useRecordings(id);

  const [filter, setFilter] = useState<GalleryFilter>(GALLERY_FILTER_ALL);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Multi-select mode: entered via long-press, holds the selected deletable ids.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  const tileSize = Math.floor((width - GRID_GAP * (GRID_COLUMNS + 1)) / GRID_COLUMNS);

  // Build the displayed tiles from both sources according to the active filter.
  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];
    if (filter === GALLERY_FILTER_ALL || filter === GALLERY_MEDIA_TYPE_IMAGE) {
      for (const f of files) {
        if (f.mediaType === GALLERY_MEDIA_TYPE_IMAGE)
          out.push({ id: f.fileId, uri: f.url, isVideo: false, source: GALLERY_SOURCE_CLOUD, fileId: f.fileId });
      }
    }
    if (filter === GALLERY_FILTER_ALL || filter === GALLERY_MEDIA_TYPE_VIDEO) {
      for (const f of files) {
        if (f.mediaType === GALLERY_MEDIA_TYPE_VIDEO)
          out.push({ id: f.fileId, uri: f.url, isVideo: true, source: GALLERY_SOURCE_CLOUD, fileId: f.fileId });
      }
      thumbnails.forEach((t, i) =>
        out.push({
          id: `rec-${t.timestampMs}-${i}`,
          uri: `data:image/jpeg;base64,${t.base64Jpeg}`,
          isVideo: true,
          source: GALLERY_SOURCE_CLOUD,
        }),
      );
    }
    return out;
  }, [files, thumbnails, filter]);

  const loading = snapLoading || recLoading;
  // Only surface an error if everything failed and there is nothing to show.
  const error = snapError && recError && tiles.length === 0 ? snapError : null;

  /**
   * Refreshes both snapshot and recording sources.
   * @returns Resolves when both refreshes settle.
   */
  const refresh = async (): Promise<void> => {
    await Promise.allSettled([snapRefresh(), recRefresh()]);
  };

  /**
   * Renders a single grid tile (image thumbnail with a play badge for videos).
   * @param item - The tile to render.
   * @returns The tile element.
   */
  /**
   * Confirms then deletes a snapshot/clip from RainMaker storage, closing the
   * viewer on success. No-op for KVS recordings (no `fileId`).
   * @param tile - The tile to delete.
   */
  const handleDelete = (tile: Tile): void => {
    if (!tile.fileId) return;
    Alert.alert(
      "Delete this item?",
      "It will be permanently removed from cloud storage.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteFile(tile.fileId!);
              setSelectedTile(null);
            } catch (e) {
              Alert.alert(
                "Delete failed",
                e instanceof Error ? e.message : "Please try again.",
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  /** Exits multi-select mode and clears the selection. */
  const exitSelection = (): void => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  /** Toggles a tile's membership in the current selection. */
  const toggleSelected = (tile: Tile): void => {
    if (!tile.fileId) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tile.id)) next.delete(tile.id);
      else next.add(tile.id);
      return next;
    });
  };

  /** Long-press a deletable tile to enter selection mode with it selected. */
  const handleLongPress = (tile: Tile): void => {
    if (!tile.fileId) return;
    setSelectionMode(true);
    setSelectedIds((prev) => new Set(prev).add(tile.id));
  };

  /**
   * Confirms then deletes every selected file, then exits selection mode.
   * Deletes run concurrently; partial failures are surfaced.
   */
  const handleDeleteSelected = (): void => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      `Delete ${ids.length} item${ids.length > 1 ? "s" : ""}?`,
      "They will be permanently removed from cloud storage.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const results = await Promise.allSettled(ids.map((id) => deleteFile(id)));
            setDeleting(false);
            exitSelection();
            const failed = results.filter((r) => r.status === "rejected").length;
            if (failed > 0) {
              Alert.alert("Delete failed", `${failed} of ${ids.length} could not be deleted.`);
            }
          },
        },
      ],
    );
  };

  const renderTile = ({ item }: { item: Tile }) => (
    <Pressable
      style={[styles.tile, { width: tileSize, height: tileSize }]}
      onPress={() =>
        selectionMode
          ? toggleSelected(item)
          : item.uri && setSelectedTile(item)
      }
      onLongPress={() => handleLongPress(item)}
      {...testProps(`gallery_tile_${item.id}`)}
    >
      {item.uri ? (
        <Image source={{ uri: item.uri }} style={styles.tileImage} resizeMode="cover" />
      ) : (
        <View style={styles.tilePlaceholder}>
          <ImageOff size={28} color={tokens.colors.gray} />
        </View>
      )}
      {item.isVideo && (
        <View style={styles.playBadge}>
          <Play size={16} color="#fff" fill="#fff" />
        </View>
      )}
      {/* Source badge (bottom-right): cloud vs device-SD */}
      <View style={styles.sourceBadge}>
        {item.source === GALLERY_SOURCE_DEVICE ? (
          <HardDrive size={12} color="#fff" />
        ) : (
          <Cloud size={12} color="#fff" />
        )}
      </View>
      {/* Selection check (multi-select mode, deletable items only) */}
      {selectionMode && item.fileId ? (
        <View
          style={[
            styles.selectCheck,
            selectedIds.has(item.id) && styles.selectCheckActive,
          ]}
        >
          {selectedIds.has(item.id) ? <Check size={14} color="#fff" /> : null}
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} {...testProps("view_gallery")}>
      <View style={styles.header}>
        {selectionMode ? (
          <>
            <Pressable onPress={exitSelection} {...testProps("button_gallery_selection_cancel")}>
              <X size={26} color={tokens.colors.primary} />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {selectedIds.size} selected
            </Text>
            <Pressable
              onPress={handleDeleteSelected}
              disabled={deleting || selectedIds.size === 0}
              {...testProps("button_gallery_delete_selected")}
            >
              <Trash2
                size={24}
                color={
                  deleting || selectedIds.size === 0
                    ? tokens.colors.gray
                    : tokens.colors.primary
                }
              />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={() => router.back()} {...testProps("button_gallery_back")}>
              <ChevronLeft size={26} color={tokens.colors.primary} />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {device ? `${device} — Gallery` : "Gallery"}
            </Text>
            <View style={styles.headerSpacer} />
          </>
        )}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
            {...testProps(`gallery_filter_${f.key}`)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={tiles}
          keyExtractor={(item) => item.id}
          renderItem={renderTile}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No media captured yet</Text>
              </View>
            ) : null
          }
        />
      )}

      <Modal visible={!!selectedTile} transparent onRequestClose={() => setSelectedTile(null)}>
        <GestureHandlerRootView style={styles.viewer}>
          {selectedTile?.uri ? <ZoomableImage uri={selectedTile.uri} /> : null}
          <Pressable
            style={[styles.viewerClose, { top: insets.top + 8 }]}
            onPress={() => setSelectedTile(null)}
            {...testProps("button_gallery_close")}
          >
            <X size={28} color="#fff" />
          </Pressable>
          {selectedTile?.fileId ? (
            <Pressable
              style={[styles.viewerDelete, { top: insets.top + 8 }]}
              onPress={() => selectedTile && handleDelete(selectedTile)}
              disabled={deleting}
              {...testProps("button_gallery_delete")}
            >
              <Trash2 size={26} color={deleting ? tokens.colors.gray : "#fff"} />
            </Pressable>
          ) : null}
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.white },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: "600", marginLeft: 8 },
  headerSpacer: { width: 26 },
  filters: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: tokens.colors.lightGray,
  },
  chipActive: { backgroundColor: tokens.colors.primary },
  chipText: { fontSize: 13, color: tokens.colors.gray },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  grid: { padding: GRID_GAP },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  tile: { borderRadius: 6, overflow: "hidden", backgroundColor: tokens.colors.lightGray },
  tileImage: { width: "100%", height: "100%" },
  tilePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  playBadge: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  sourceBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  errorText: { color: tokens.colors.error, textAlign: "center", paddingHorizontal: 24 },
  emptyText: { color: tokens.colors.gray },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerClose: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerDelete: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectCheck: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectCheckActive: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
});

export default Gallery;
