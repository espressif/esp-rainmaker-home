/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  WEBRTC_MEDIA_KIND_VIDEO,
  WEBRTC_STATS_REPORT_TYPE,
} from "@shared/utils/constants";
import type { VideoStats } from "@src/types/global";

/** Minimal peer connection surface needed for stats (RN-webrtc or browser). */
type PeerConnectionWithStats = {
  getStats: () => Promise<unknown>;
};

/** Subset of RTCStats fields used when parsing inbound video reports. */
type StatsReportLike = {
  id: string;
  type: string;
  kind?: string;
  mediaType?: string;
  timestamp?: number;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  framesDropped?: number;
  bytesReceived?: number;
  packetsReceived?: number;
  packetsLost?: number;
  jitter?: number;
  codecId?: string;
  mimeType?: string;
  name?: string;
};

type BitrateSample = {
  bytesReceived: number;
  timestampMs: number;
};

/**
 * Previous inbound-rtp sample per peer connection, used to derive instantaneous
 * bitrate from the delta of cumulative `bytesReceived` over report timestamps.
 * Reset when the stream stops (null peer) or restarts (byte counter goes backwards).
 */
const previousBitrateByPc = new WeakMap<object, BitrateSample>();

/**
 * Normalizes `getStats()` results from react-native-webrtc (Map/Array) and
 * browsers (`RTCStatsReport` maplike) into a plain report array.
 * @param statsReport - Value returned by `RTCPeerConnection.getStats()`
 * @returns Flat list of stats reports
 */
function toReportsArray(statsReport: unknown): StatsReportLike[] {
  if (statsReport == null) {
    return [];
  }
  if (statsReport instanceof Map) {
    return Array.from(statsReport.values()) as StatsReportLike[];
  }
  if (Array.isArray(statsReport)) {
    return statsReport as StatsReportLike[];
  }
  if (
    typeof statsReport === "object" &&
    typeof (statsReport as RTCStatsReport).forEach === "function"
  ) {
    const out: StatsReportLike[] = [];
    (statsReport as RTCStatsReport).forEach((report) => {
      out.push(report as StatsReportLike);
    });
    return out;
  }
  return [];
}

/**
 * True when a report is video media (Chrome `kind`, legacy/RN `mediaType`).
 * Matching only `mediaType` left inbound-rtp null on web → "Loading stats…".
 * @param report - Single WebRTC stats report
 * @returns Whether the report is for video
 */
function isVideoMedia(report: StatsReportLike): boolean {
  return (
    report.kind === WEBRTC_MEDIA_KIND_VIDEO ||
    report.mediaType === WEBRTC_MEDIA_KIND_VIDEO
  );
}

/**
 * Instantaneous bitrate (kbps) from consecutive inbound-rtp samples.
 * Prefers the report `timestamp` when present; falls back to wall clock.
 * @param peerConnection - Peer used as WeakMap key
 * @param bytesReceived - Cumulative bytes from inbound-rtp
 * @param reportTimestamp - Optional RTCStats `timestamp` from the report
 * @returns Bitrate in kbps
 */
function estimateBitrateKbps(
  peerConnection: object,
  bytesReceived: number,
  reportTimestamp?: number,
): number {
  const sampleTimestamp =
    typeof reportTimestamp === "number" && reportTimestamp > 0
      ? reportTimestamp
      : Date.now();
  const previous = previousBitrateByPc.get(peerConnection);
  previousBitrateByPc.set(peerConnection, {
    bytesReceived,
    timestampMs: sampleTimestamp,
  });
  if (
    !previous ||
    sampleTimestamp <= previous.timestampMs ||
    bytesReceived < previous.bytesReceived
  ) {
    return 0;
  }
  const deltaSeconds = (sampleTimestamp - previous.timestampMs) / 1000;
  if (deltaSeconds <= 0) {
    return 0;
  }
  const deltaBytes = bytesReceived - previous.bytesReceived;
  return (deltaBytes * 8) / deltaSeconds / 1000;
}

/**
 * Fetches and parses WebRTC video + network stats from an RTCPeerConnection.
 * Works on native (Map/Array) and web (`RTCStatsReport` + `kind: "video"`).
 * @param peerConnection - The RTCPeerConnection instance to get stats from
 * @returns Parsed video stats, or null if unavailable
 */
export const getVideoStats = async (
  peerConnection: PeerConnectionWithStats | null,
): Promise<VideoStats | null> => {
  if (!peerConnection) {
    return null;
  }

  try {
    const statsReport = await peerConnection.getStats();
    const reportsArray = toReportsArray(statsReport);

    if (reportsArray.length === 0) {
      return null;
    }

    const statsMap: Record<string, StatsReportLike> = {};
    for (const report of reportsArray) {
      statsMap[report.id] = report;
    }

    let trackStats: StatsReportLike | null = null;
    let inboundRtpStats: StatsReportLike | null = null;

    for (const report of reportsArray) {
      if (
        report.type === WEBRTC_STATS_REPORT_TYPE.TRACK &&
        isVideoMedia(report)
      ) {
        trackStats = report;
      }
      // react-native-webrtc / current WebRTC spec use `kind`; older impls used `mediaType`.
      if (
        report.type === WEBRTC_STATS_REPORT_TYPE.INBOUND_RTP &&
        isVideoMedia(report)
      ) {
        inboundRtpStats = report;
      }
    }

    if (!trackStats && !inboundRtpStats) {
      return null;
    }

    const frameWidth =
      inboundRtpStats?.frameWidth || trackStats?.frameWidth || 0;
    const frameHeight =
      inboundRtpStats?.frameHeight || trackStats?.frameHeight || 0;
    const framesPerSecond =
      inboundRtpStats?.framesPerSecond || trackStats?.framesPerSecond || 0;
    const framesDropped =
      inboundRtpStats?.framesDropped || trackStats?.framesDropped || 0;
    const bytesReceived = inboundRtpStats?.bytesReceived || 0;
    const packetsReceived = inboundRtpStats?.packetsReceived || 0;
    const packetsLost = inboundRtpStats?.packetsLost || 0;
    const jitter = inboundRtpStats?.jitter || 0;
    const codecId = inboundRtpStats?.codecId;

    let codecName = "Unknown";
    if (codecId) {
      const codecReport = statsMap[codecId];
      if (codecReport) {
        codecName = codecReport.mimeType || codecReport.name || "Unknown";
      }
    }

    const bitrate = estimateBitrateKbps(
      peerConnection,
      bytesReceived,
      inboundRtpStats?.timestamp,
    );
    const totalPackets = packetsReceived + packetsLost;
    const packetLossPercent =
      totalPackets > 0 ? (packetsLost * 100.0) / totalPackets : 0;
    const bytesReceivedMB = bytesReceived / (1024.0 * 1024.0);

    return {
      resolution: `${frameWidth} x ${frameHeight}`,
      currentFps: framesPerSecond.toFixed(1),
      receivedFps: framesPerSecond.toFixed(1),
      droppedFps: framesDropped.toFixed(1),
      framesDropped: framesDropped.toString(),
      codec: codecName,
      bitrate: `${Math.round(bitrate)} kbps`,
      totalData: `${bytesReceivedMB.toFixed(2)} MB`,
      packetsRx: packetsReceived.toString(),
      packetsLost: packetsLost.toString(),
      lossPercent: `${packetLossPercent.toFixed(2)}%`,
      jitter: `${(jitter * 1000).toFixed(2)} ms`,
    };
  } catch {
    return null;
  }
};
