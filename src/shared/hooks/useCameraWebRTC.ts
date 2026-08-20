/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import type { ESPCDFAssumeRoleResponse } from "@store";
import { useCDF } from "./useCDF";
import { useToast } from "./useToast";
import { useTranslation } from "react-i18next";
import {
  WEBRTC_CONNECTION_STATE,
  WEBRTC_TRANSLATION_KEYS,
  WEBRTC_DEFAULT_MESSAGES,
  WEBRTC_SIGNALING_EVENTS,
  WEBRTC_MEDIA_KIND_VIDEO,
  WEBRTC_MEDIA_KIND_AUDIO,
  WEBRTC_TRANSCEIVER_DIRECTION_RECVONLY,
  WEBRTC_LOCAL_FALLBACK_TIMEOUT_MS,
} from "@shared/utils/constants";

// WebRTC and KVS imports
import {
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from "react-native-webrtc";
import {
  createKvsClient,
  KvsSignalingClient,
  type AwsCredentials,
  type IceServer,
} from "@modules/kvs";
import { LocalSignalingClient } from "@shared/utils/camera/localSignalingClient";
import type { SignalingTransport, LocalTransportConfig } from "@shared/utils/camera/types";
import { getVideoStats } from "@shared/utils/camera/getVideoStats";
import { getAwsRegionFromToken } from "@shared/utils/camera/getAwsRegion";
import {
  startWebRtcLoudspeakerRouting,
  stopWebRtcAudioRouting,
} from "@shared/utils/camera/webrtcAudioRoute";
import type { VideoStats } from "@src/types/global";

/**
 * Extended RTCPeerConnection type with event handler properties
 * These are defined via defineEventAttribute in react-native-webrtc but not in TypeScript types
 */
interface ExtendedRTCPeerConnection extends RTCPeerConnection {
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  ontrack: ((event: { streams: MediaStream[]; track: any; transceiver: any; receiver: any }) => void) | null;
}

/**
 * Waits for the signaling client WebSocket to open.
 * Resolves immediately on open, rejects on error, so it can be raced
 * in parallel with ICE server credential fetching.
 */
function waitForSignalingOpen(signalingClient: KvsSignalingClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      signalingClient.off(WEBRTC_SIGNALING_EVENTS.OPEN, onOpen);
      signalingClient.off(WEBRTC_SIGNALING_EVENTS.ERROR, onError);
      resolve();
    };
    const onError = (err: Error) => {
      signalingClient.off(WEBRTC_SIGNALING_EVENTS.OPEN, onOpen);
      signalingClient.off(WEBRTC_SIGNALING_EVENTS.ERROR, onError);
      reject(err);
    };
    signalingClient.on(WEBRTC_SIGNALING_EVENTS.OPEN, onOpen);
    signalingClient.on(WEBRTC_SIGNALING_EVENTS.ERROR, onError);
  });
}

/**
 * Hook for managing WebRTC video streaming for camera devices
 *
 * This hook handles:
 * - Getting AWS credentials via assume role API
 * - Setting up WebRTC connection with AWS Kinesis Video Streams
 * - Managing video stream state
 * - Error handling
 * @param nodeId - The node ID of the camera device
 * @param channelName - The channel name for video streaming
 * @returns Object containing streaming state and control functions
 */
export const useCameraWebRTC = (
  nodeId: string,
  channelName: string | null,
  localTransport?: LocalTransportConfig | null
) => {
  const { espCDFUser } = useCDF();
  const toast = useToast();
  const { t } = useTranslation();

  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [credentials, setCredentials] = useState<ESPCDFAssumeRoleResponse | null>(null);
  const [stats, setStats] = useState<VideoStats | null>(null);
  const statsUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const peerConnectionRef = useRef<ExtendedRTCPeerConnection | null>(null);
  const signalingClientRef = useRef<SignalingTransport | null>(null);
  const channelARNRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const remoteDescriptionSetRef = useRef<boolean>(false);
  const videoStreamSetRef = useRef<boolean>(false);
  const videoStreamRef = useRef<MediaStream | null>(null);

  // Two-way audio: local mic (send) starts muted; remote audio (receive) can be
  // muted client-side. Refs let the track/cleanup handlers read current state.
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(false);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<any>(null);
  const remoteAudioTrackRef = useRef<any>(null);
  const isSpeakerMutedRef = useRef<boolean>(false);

  const awsRegionRef = useRef<string>("us-east-1");

  /** Returns true when temporary AWS keys from assume_role are present. */
  const validateCredentials = (creds: ESPCDFAssumeRoleResponse | null): boolean => {
    if (!creds) return false;
    return Boolean(
      creds.accessKey && creds.secretKey && creds.sessionToken
    );
  };

  /**
   * This function gets the AWS credentials
   * @returns AWS credentials from assume role, or null on failure
   * @throws If the user is not authenticated
   */
  const getCredentials = useCallback(async (): Promise<ESPCDFAssumeRoleResponse | null> => {
    if (!espCDFUser) {
      throw new Error("User not authenticated");
    }
    try {
      const creds = await espCDFUser.assumeRole({
        userRole: "videostream",
        nodeIds: [nodeId],
      });
      setCredentials(creds);
      return creds;
    } catch (err: any) {
      const errorHeader = t("layout.shared.errorHeader") || "Error";
      const errorMessage = err.message || t("device.camera.errors.failedToGetCredentials") || "Failed to get AWS credentials";
      toast.showError(
        errorHeader,
        errorMessage
      );
      setError(errorMessage);
      if (__DEV__) {
        console.error(errorMessage);
      }
      return null;
    }
  }, [espCDFUser, nodeId, toast, t]);

  /**
   * This function validates the channel name
   * @returns True if the channel name is valid, false otherwise
   */
  const validateChannelName = useCallback((): boolean => {
    if (!channelName) {
      const errorMsg = t("device.camera.errors.channelNameRequired") || "Channel name is required";
      const errorHeader = t("layout.shared.errorHeader") || "Error";

      toast.showError(
        errorHeader,
        errorMsg
      );

      setError(errorMsg);
      return false;
    }
    return true;
  }, [channelName, toast, t]);

  /**
   * Reset state for a new stream
   */
  const resetStreamState = useCallback(() => {
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    videoStreamSetRef.current = false;
  }, []);

  /**
   * Obtain and validate AWS credentials
   */
  const ensureValidCredentials = useCallback(async (): Promise<AwsCredentials | null> => {
    let creds = credentials;
    if (!creds || !validateCredentials(creds)) {
      creds = await getCredentials();
      if (!creds) {
        return null;
      }
    }

    return {
      accessKeyId: creds.accessKey,
      secretAccessKey: creds.secretKey,
      sessionToken: creds.sessionToken,
    };
  }, [credentials, getCredentials]);

  /**
   * Builds a credentials-bound KVS client for the current region.
   * @param awsCredentials - Temporary AWS credentials from assume-role.
   * @returns A {@link createKvsClient} instance for signaling helpers.
   */
  const getKvsClient = useCallback((awsCredentials: AwsCredentials) => {
    return createKvsClient({
      region: awsRegionRef.current,
      credentials: awsCredentials,
    });
  }, []);

  /**
   * Discovers the KVS signaling channel (ARN + endpoints) via `@modules/kvs`.
   * Results are cached inside the module with in-flight deduplication.
   * @param name - The name of the channel to discover.
   * @param awsCredentials - The AWS credentials to use for the discovery.
   * @returns Channel ARN and signaling endpoints.
   */
  const discoverKVSChannel = useCallback(async (
    name: string,
    awsCredentials: AwsCredentials
  ): Promise<{ channelARN: string; wssEndpoint: string; httpsEndpoint: string }> => {
    const info = await getKvsClient(awsCredentials).signaling.discoverChannel(name);
    channelARNRef.current = info.channelARN;
    return info;
  }, [getKvsClient]);

  /**
   * Fetches ICE servers for WebRTC via `@modules/kvs` (cached).
   * @param name - Channel name used as the cache key.
   * @param channelARN - Signaling channel ARN.
   * @param httpsEndpoint - HTTPS signaling endpoint from discovery.
   * @param awsCredentials - Temporary AWS credentials.
   * @returns ICE server list for RTCPeerConnection.
   */
  const getIceServerConfiguration = useCallback(async (
    name: string,
    channelARN: string,
    httpsEndpoint: string,
    awsCredentials: AwsCredentials
  ): Promise<IceServer[]> => {
    return getKvsClient(awsCredentials).signaling.getIceServers(
      name,
      channelARN,
      httpsEndpoint,
    );
  }, [getKvsClient]);

  /**
   * Generate UUID v4
   * Responsibility: Generate unique client ID
   */
  const generateUUID = useCallback((): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }, []);

  /**
   * Create signaling client only (without a peer connection).
   * Called before ICE server fetch so the WebSocket handshake can overlap
   * with the GetIceServerConfig round-trip.
   * @param channelARN - Signaling channel ARN.
   * @param wssEndpoint - WSS resource endpoint.
   * @param awsCredentials - Temporary AWS credentials.
   * @returns Viewer {@link KvsSignalingClient}.
   */
  const createSignalingClient = useCallback((
    channelARN: string,
    wssEndpoint: string,
    awsCredentials: AwsCredentials
  ): KvsSignalingClient => {
    const signalingClient = getKvsClient(awsCredentials).signaling.createViewerClient({
      channelARN,
      channelEndpoint: wssEndpoint,
      clientId: generateUUID(),
    });
    signalingClientRef.current = signalingClient;
    return signalingClient;
  }, [generateUUID, getKvsClient]);

  /**
   * Create peer connection with resolved ICE servers.
   * Called after both the signaling WebSocket is open and ICE servers are ready.
   */
  const createPeerConnection = useCallback((
    iceServers: IceServer[]
  ): ExtendedRTCPeerConnection => {
    const peerConnection = new RTCPeerConnection({ iceServers }) as ExtendedRTCPeerConnection;
    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, []);

  /**
   * Requests Android microphone permission for mic-send. iOS/other return true
   * (handled by the OS prompt on getUserMedia). Returns false when unavailable
   * so audio gracefully degrades to receive-only.
   * @returns Whether mic capture may proceed.
   */
  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }, []);

  /**
   * Configures the peer connection media for one-way video + two-way audio:
   * a recvonly video transceiver, plus a sendrecv audio path carrying the local
   * mic (started muted). If the mic is unavailable/denied, falls back to a
   * recvonly audio transceiver so incoming device audio is still received.
   * @param peerConnection - The RTCPeerConnection instance to configure
   */
  const configurePeerConnectionMedia = useCallback(async (
    peerConnection: ExtendedRTCPeerConnection
  ) => {
    peerConnection.addTransceiver(WEBRTC_MEDIA_KIND_VIDEO, {
      direction: WEBRTC_TRANSCEIVER_DIRECTION_RECVONLY,
    });

    try {
      if (!(await ensureMicPermission())) {
        throw new Error("Microphone permission not granted");
      }
      const micStream = (await mediaDevices.getUserMedia({
        audio: true,
      })) as MediaStream;
      const micTrack = micStream.getAudioTracks()[0];
      if (!micTrack) throw new Error("No microphone track");
      // Start muted — the user unmutes via the mic toggle.
      micTrack.enabled = false;
      localAudioStreamRef.current = micStream;
      localAudioTrackRef.current = micTrack;
      peerConnection.addTrack(micTrack, micStream);
      setIsMicEnabled(false);
    } catch (err) {
      if (__DEV__) {
        console.log("Mic unavailable; receiving audio only:", err);
      }
      // Still negotiate to RECEIVE remote audio even without a local mic.
      peerConnection.addTransceiver(WEBRTC_MEDIA_KIND_AUDIO, {
        direction: WEBRTC_TRANSCEIVER_DIRECTION_RECVONLY,
      });
    }
  }, [ensureMicPermission]);

  /**
   * Setup signaling client event handlers
   * Responsibility: Handle signaling protocol events (SDP_ANSWER, ICE_CANDIDATE, CLOSE, ERROR).
   * NOTE: The OPEN handler is intentionally omitted – offer creation is done
   * explicitly in startStreaming after the parallel ICE + connect phase.
   */
  const setupSignalingClientHandlers = useCallback((
    signalingClient: SignalingTransport,
    peerConnection: ExtendedRTCPeerConnection
  ) => {
    signalingClient.on(WEBRTC_SIGNALING_EVENTS.SDP_ANSWER, async (answer: RTCSessionDescription) => {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("setRemoteDescription timeout after 10 seconds")), 10000);
        });

        await Promise.race([
          peerConnection.setRemoteDescription(answer),
          timeoutPromise,
        ]);

        remoteDescriptionSetRef.current = true;

        // Flush ICE candidates that arrived before the SDP answer
        const pendingCandidates = pendingIceCandidatesRef.current;
        if (pendingCandidates.length > 0) {
          for (let i = 0; i < pendingCandidates.length; i++) {
            try {
              await peerConnection.addIceCandidate(pendingCandidates[i]);
            } catch {
              // ICE candidate errors are often non-fatal
            }
          }
          pendingIceCandidatesRef.current = [];
        }
      } catch (err: any) {
        setError(err?.message || "Failed to set remote description");
        setIsLoading(false);
      }
    });

    signalingClient.on(WEBRTC_SIGNALING_EVENTS.ICE_CANDIDATE, async (candidate: RTCIceCandidate) => {
      if (!remoteDescriptionSetRef.current) {
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch {
        // ICE candidate errors are often non-fatal
      }
    });

    signalingClient.on(WEBRTC_SIGNALING_EVENTS.CLOSE, () => {
      setIsStreaming(false);
    });

    signalingClient.on(WEBRTC_SIGNALING_EVENTS.ERROR, (err: Error) => {
      const errorMessage = err.message || t("device.camera.errors.signalingError") || "Signaling error occurred";
      setError(errorMessage);
      setIsStreaming(false);
      setIsLoading(false);
      toast.showError(
        t("layout.shared.errorHeader") || "Error",
        errorMessage
      );
    });
  }, [toast, t]);

  /**
   * Create ICE candidate handler
   * Responsibility: Create handler function for ICE candidate events
   * @param signalingClient - The signaling client to send candidates through
   * @returns Handler function for onicecandidate event
   */
  const createIceCandidateHandler = useCallback((
    signalingClient: SignalingTransport
  ): ((event: { candidate: RTCIceCandidate | null }) => void) => {
    return ({ candidate }: { candidate: RTCIceCandidate | null }) => {
      if (candidate && candidate.candidate) {
        signalingClient.sendIceCandidate(candidate);
      }
    };
  }, []);

  /**
   * Create connection state change handler
   * Responsibility: Create handler function for connection state changes
   * @param peerConnection - The RTCPeerConnection instance to track state
   * @returns Handler function for onconnectionstatechange event
   */
  const createConnectionStateChangeHandler = useCallback((
    peerConnection: ExtendedRTCPeerConnection
  ): (() => void) => {
    let previousState = peerConnection.connectionState;

    return () => {
      const state = peerConnection.connectionState;

      if (state !== previousState) {
        previousState = state;

        if (state === WEBRTC_CONNECTION_STATE.CONNECTED || state === WEBRTC_CONNECTION_STATE.CONNECTING) {
          setIsStreaming(true);
          if (state === WEBRTC_CONNECTION_STATE.CONNECTED) {
            startWebRtcLoudspeakerRouting();
          }
        } else if (state === WEBRTC_CONNECTION_STATE.DISCONNECTED || state === WEBRTC_CONNECTION_STATE.CLOSED) {
          setIsStreaming(false);
        } else if (state === WEBRTC_CONNECTION_STATE.FAILED) {
          const errorHeader = t(WEBRTC_TRANSLATION_KEYS.ERROR_HEADER) || WEBRTC_DEFAULT_MESSAGES.ERROR;
          const errorMsg = t(WEBRTC_TRANSLATION_KEYS.CONNECTION_FAILED) || WEBRTC_DEFAULT_MESSAGES.CONNECTION_FAILED;

          setError(errorMsg);
          setIsLoading(false);
          setIsStreaming(false);
          toast.showError(errorHeader, errorMsg);
        }
      }
    };
  }, [toast, t]);

  /**
   * Create track handler
   * Responsibility: Create handler function for incoming media tracks
   * @returns Handler function for ontrack event
   */
  const createTrackHandler = useCallback((): ((event: { streams: MediaStream[]; track: any; transceiver: any; receiver: any }) => void) => {
    return (event: { streams: MediaStream[]; track: any; transceiver: any; receiver: any }) => {
      // Incoming audio: keep a ref so it can be muted, and apply current state.
      if (event.track && event.track.kind === WEBRTC_MEDIA_KIND_AUDIO) {
        remoteAudioTrackRef.current = event.track;
        event.track.enabled = !isSpeakerMutedRef.current;
        startWebRtcLoudspeakerRouting();
        return;
      }

      if (videoStreamSetRef.current) return;
      if (!event.track || event.track.kind !== WEBRTC_MEDIA_KIND_VIDEO) return;

      if (event.streams && event.streams.length > 0) {
        const stream = event.streams[0] as MediaStream;
        const remoteVideoTracks = stream.getVideoTracks();
        if (remoteVideoTracks.length > 0) {
          const videoOnlyStream = new MediaStream(remoteVideoTracks);
          videoStreamSetRef.current = true;
          videoStreamRef.current = videoOnlyStream;
          setVideoStream(videoOnlyStream);
          setIsStreaming(true);
          setIsLoading(false);
        }
      }
    };
  }, []);

  /**
   * Setup peer connection event handlers
   * Responsibility: Attach all peer connection event handlers inline
   * @param peerConnection - The RTCPeerConnection instance
   * @param signalingClient - The signaling client instance
   */
  const setupPeerConnectionHandlers = useCallback((
    peerConnection: ExtendedRTCPeerConnection,
    signalingClient: SignalingTransport
  ) => {
    peerConnection.onicecandidate = createIceCandidateHandler(signalingClient);
    peerConnection.onconnectionstatechange = createConnectionStateChangeHandler(peerConnection);
    peerConnection.ontrack = createTrackHandler();
  }, [createIceCandidateHandler, createConnectionStateChangeHandler, createTrackHandler]);

  /**
   * Reusable cleanup function for WebRTC resources
   * @param updateState - Whether to update React state (set to false for unmount cleanup)
   */
  const cleanupResources = useCallback((updateState: boolean = true) => {
    try {
      stopWebRtcAudioRouting();

      if (updateState) {
        setIsStreaming(false);
        setVideoStream(null);
        setError(null);
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (signalingClientRef.current) {
        signalingClientRef.current.close();
        signalingClientRef.current = null;
      }

      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((track) => track.stop());
        videoStreamRef.current = null;
      }

      // Release the local mic and reset audio toggle state.
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach((track) => track.stop());
        localAudioStreamRef.current = null;
      }
      localAudioTrackRef.current = null;
      remoteAudioTrackRef.current = null;
      isSpeakerMutedRef.current = false;
      if (updateState) {
        setIsMicEnabled(false);
        setIsSpeakerMuted(false);
      }

      channelARNRef.current = null;
      pendingIceCandidatesRef.current = [];
      remoteDescriptionSetRef.current = false;
      videoStreamSetRef.current = false;
    } catch (err) {
      if (__DEV__) {
        console.error("Error during cleanup:", err);
      }
    }
  }, []);

  /**
   * Handle streaming errors
   * Responsibility: Handle errors and cleanup
   */
  const handleStreamingError = useCallback((err: any) => {
    const errorMessage = err?.message || t("device.camera.errors.failedToStartStreaming") || "Failed to start streaming";
    setError(errorMessage);
    setIsStreaming(false);
    setIsLoading(false);
    toast.showError(
      t("layout.shared.errorHeader") || "Error",
      errorMessage
    );
    if (__DEV__) {
      console.error(err);
    }
    cleanupResources(true);
  }, [toast, t, cleanupResources]);

  /**
   * Attempts to establish the stream over the device's local-control (LAN)
   * signaling path. Resolves true once an SDP answer is applied, or false on
   * any error/timeout so the caller can fall back to cloud KVS. Uses empty ICE
   * servers — the device is on the same LAN, so host candidates connect directly.
   * @param cfg - Local transport parameters (baseUrl, securityType, pop).
   * @returns Whether the local signaling path produced an SDP answer.
   */
  const runLocalStreaming = useCallback((cfg: LocalTransportConfig): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(ok);
      };

      try {
        const peerConnection = createPeerConnection([]);
        const client = new LocalSignalingClient({
          nodeId,
          baseUrl: cfg.baseUrl,
          securityType: cfg.securityType,
          pop: cfg.pop,
        });
        signalingClientRef.current = client;

        client.on(WEBRTC_SIGNALING_EVENTS.SDP_ANSWER, async (answer: RTCSessionDescription) => {
          try {
            await peerConnection.setRemoteDescription(answer);
            remoteDescriptionSetRef.current = true;
            const pending = pendingIceCandidatesRef.current;
            for (let i = 0; i < pending.length; i++) {
              try {
                await peerConnection.addIceCandidate(pending[i]);
              } catch {
                // ICE candidate errors are often non-fatal
              }
            }
            pendingIceCandidatesRef.current = [];
            finish(true);
          } catch {
            finish(false);
          }
        });

        client.on(WEBRTC_SIGNALING_EVENTS.ICE_CANDIDATE, async (candidate: RTCIceCandidate) => {
          if (!remoteDescriptionSetRef.current) {
            pendingIceCandidatesRef.current.push(candidate);
            return;
          }
          try {
            await peerConnection.addIceCandidate(candidate);
          } catch {
            // ICE candidate errors are often non-fatal
          }
        });

        // Any signaling error → give up on local; the caller falls back to KVS.
        client.on(WEBRTC_SIGNALING_EVENTS.ERROR, () => finish(false));

        peerConnection.onicecandidate = createIceCandidateHandler(client);
        peerConnection.onconnectionstatechange = createConnectionStateChangeHandler(peerConnection);
        peerConnection.ontrack = createTrackHandler();

        timeoutId = setTimeout(() => finish(false), WEBRTC_LOCAL_FALLBACK_TIMEOUT_MS);

        (async () => {
          await client.open();
          await configurePeerConnectionMedia(peerConnection);
          const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await peerConnection.setLocalDescription(offer);
          client.sendSdpOffer(offer);
        })().catch(() => finish(false));
      } catch {
        finish(false);
      }
    });
  }, [
    nodeId,
    createPeerConnection,
    createIceCandidateHandler,
    createConnectionStateChangeHandler,
    createTrackHandler,
    configurePeerConnectionMedia,
  ]);

  /**
   * Start video streaming
   * Flow:
   * 1. Region + credentials resolved in parallel.
   * 2. Channel info fetched (from cache or API).
   * 3. Signaling WebSocket opened AND ICE credentials fetched in parallel.
   * 4. Peer connection created with ICE servers (already available by step 3).
   * 5. SDP offer created and sent immediately
   */
  const startStreaming = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      resetStreamState();

      // Prefer local-control (LAN) signaling when the node is locally reachable;
      // fall back to cloud KVS on any local failure or timeout.
      if (localTransport) {
        const localOk = await runLocalStreaming(localTransport);
        if (localOk) return;
        if (__DEV__) {
          console.log("Local signaling unavailable; falling back to cloud KVS");
        }
        cleanupResources(false);
        resetStreamState();
      }

      // Cloud KVS path (primary when there's no LAN transport, or the fallback).
      if (!validateChannelName()) {
        setIsLoading(false);
        return;
      }

      // Resolve region + credentials in parallel
      const [, awsCredentials] = await Promise.all([
        getAwsRegionFromToken().then((r) => {
          awsRegionRef.current = r;
          return r;
        }),
        ensureValidCredentials(),
      ]);
      if (!awsCredentials) return;

      // Channel discovery (cache hit skips two API calls)
      const { channelARN, wssEndpoint, httpsEndpoint } = await discoverKVSChannel(
        channelName!,
        awsCredentials
      );

      // Create signaling client early so the WebSocket handshake starts
      // immediately, overlapping with the ICE credential fetch below.
      const signalingClient = createSignalingClient(channelARN, wssEndpoint, awsCredentials);

      // ICE credential fetch and signaling connect run in parallel.
      // By the time both settle, ICE servers are ready and the WebSocket is open.
      const [iceServers] = await Promise.all([
        getIceServerConfiguration(channelName!, channelARN, httpsEndpoint, awsCredentials),
        (async () => {
          signalingClient.open();
          await waitForSignalingOpen(signalingClient);
        })(),
      ]);

      // Create peer connection with the ICE servers that are now available
      const peerConnection = createPeerConnection(iceServers);

      // Attach signaling handlers (SDP_ANSWER, ICE_CANDIDATE, CLOSE, ERROR)
      setupSignalingClientHandlers(signalingClient, peerConnection);

      // Attach peer connection handlers
      setupPeerConnectionHandlers(peerConnection, signalingClient);

      // Negotiate recvonly video + (best-effort) two-way audio before the offer.
      await configurePeerConnectionMedia(peerConnection);

      // Send offer immediately – WebSocket is already open, no onopen wait needed
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peerConnection.setLocalDescription(offer);
      signalingClient.sendSdpOffer(offer);
    } catch (err: any) {
      handleStreamingError(err);
    }
  }, [
    channelName,
    localTransport,
    runLocalStreaming,
    cleanupResources,
    validateChannelName,
    resetStreamState,
    ensureValidCredentials,
    discoverKVSChannel,
    getIceServerConfiguration,
    createSignalingClient,
    createPeerConnection,
    setupSignalingClientHandlers,
    setupPeerConnectionHandlers,
    configurePeerConnectionMedia,
    handleStreamingError,
  ]);

  /**
   * Stop video streaming
   */
  const stopStreaming = useCallback(() => {
    cleanupResources(true);
  }, [cleanupResources]);

  /**
   * Toggles the local microphone (audio sent to the device). No-op until a mic
   * track exists (i.e. permission granted and stream started).
   */
  const toggleMic = useCallback(() => {
    const track = localAudioTrackRef.current;
    if (!track) return;
    const next = !track.enabled;
    track.enabled = next;
    setIsMicEnabled(next);
  }, []);

  /**
   * Toggles muting of the incoming device audio (speaker). Tracks the desired
   * state in a ref so a not-yet-arrived remote audio track adopts it on arrival.
   */
  const toggleSpeaker = useCallback(() => {
    const nextMuted = !isSpeakerMutedRef.current;
    isSpeakerMutedRef.current = nextMuted;
    setIsSpeakerMuted(nextMuted);
    const track = remoteAudioTrackRef.current;
    if (track) track.enabled = !nextMuted;
  }, []);

  // Cleanup WebRTC resources on unmount
  useEffect(() => {
    return () => {
      cleanupResources(false);
    };
  }, [cleanupResources]);

  /**
   * Credentials + channel info + ICE server fetch when the
   * hook mounts so credentials, channel info, and ICE servers are resolved before the user taps play.
   */
  useEffect(() => {
    if (!channelName?.trim() || !nodeId || !espCDFUser) return;
    let cancelled = false;

    (async () => {
      try {
        const [region, creds] = await Promise.all([
          getAwsRegionFromToken(),
          ensureValidCredentials(),
        ]);
        if (cancelled || !creds) return;
        awsRegionRef.current = region;

        const channelInfo = await discoverKVSChannel(channelName.trim(), creds);
        if (cancelled) return;

        await getIceServerConfiguration(
          channelName.trim(),
          channelInfo.channelARN,
          channelInfo.httpsEndpoint,
          creds
        );
      } catch {
        if (__DEV__) {
          console.error("Error fetching credentials, channel info, and ICE servers");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [channelName, nodeId, espCDFUser, ensureValidCredentials, discoverKVSChannel, getIceServerConfiguration]);

  /**
   * Get stats from peer connection
   * Uses the shared getVideoStats utility function
   * @param peerConnection - The RTCPeerConnection instance to get stats from
   * @returns Parsed video stats or null if unavailable
   */
  const getStats = useCallback(async (
    peerConnection: ExtendedRTCPeerConnection | null
  ): Promise<VideoStats | null> => {
    return getVideoStats(peerConnection);
  }, []);

  /**
   * Enable or disable periodic stats updates
   * Responsibility: Manage stats update interval based on visibility and playing state
   * @param enabled - Whether to enable stats updates
   * @param isPlaying - Whether video is currently playing
   */
  const setStatsUpdatesEnabled = useCallback((enabled: boolean, isPlaying: boolean) => {
    if (statsUpdateTimerRef.current) {
      clearInterval(statsUpdateTimerRef.current);
      statsUpdateTimerRef.current = null;
    }

    if (enabled && isPlaying && peerConnectionRef.current) {
      getStats(peerConnectionRef.current)
        .then((statsData) => {
          setStats(statsData);
        })
        .catch(() => {
          // Error fetching stats - silently handle
        });

      statsUpdateTimerRef.current = setInterval(() => {
        if (peerConnectionRef.current) {
          getStats(peerConnectionRef.current).then(setStats);
        }
      }, 1000);
    } else {
      if (!enabled) {
        setStats(null);
      }
    }
  }, [getStats]);

  // Cleanup stats timer on unmount
  useEffect(() => {
    return () => {
      if (statsUpdateTimerRef.current) {
        clearInterval(statsUpdateTimerRef.current);
        statsUpdateTimerRef.current = null;
      }
    };
  }, []);

  const getConnectionState = (): "connected" | "disconnected" | "live" | "error" => {
    if (error) return "error";
    if (isStreaming && videoStream) return "live";
    if (isStreaming || isLoading) return "connected";
    return "disconnected";
  };

  return {
    isStreaming,
    isLoading,
    error,
    videoStream,
    startStreaming,
    stopStreaming,
    peerConnection: peerConnectionRef.current,
    connectionState: getConnectionState(),
    stats,
    getStats,
    setStatsUpdatesEnabled,
    isMicEnabled,
    toggleMic,
    isSpeakerMuted,
    toggleSpeaker,
  };
};
