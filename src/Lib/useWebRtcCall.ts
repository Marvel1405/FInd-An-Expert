import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export type CallMediaMode = "audio" | "video";

interface UseWebRtcCallOptions {
  roomCode?: string | null;
  userId?: string | null;
  isInitiator: boolean;
  active: boolean;
  mode: CallMediaMode;
}

interface SignalPayload {
  senderId: string;
  type: "offer" | "answer" | "ice-candidate" | "ready" | "hangup";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function stopAllTracks(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore already-stopped track errors
    }
  });
}

function clearMediaElement(el: HTMLMediaElement | null) {
  if (!el) return;
  stopAllTracks(el.srcObject instanceof MediaStream ? el.srcObject : null);
  el.srcObject = null;
  try {
    el.load();
  } catch {
    // Ignore media element reset errors
  }
}

export function useWebRtcCall({
  roomCode,
  userId,
  isInitiator,
  active,
  mode,
}: UseWebRtcCallOptions) {
  const [callStatus, setCallStatus] = useState<
    "idle" | "connecting" | "connected" | "ended"
  >("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(mode !== "video");
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const sessionGenerationRef = useRef<number>(0);

  useEffect(() => {
    setIsCameraOff(mode !== "video");
  }, [mode]);

  const attachLocalPreview = useCallback(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, []);

  const cleanupCall = useCallback(
    (nextStatus: "idle" | "ended" = "ended") => {
      sessionGenerationRef.current += 1;

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        try {
          pcRef.current.close();
        } catch {
          // Ignore already-closed peer connection errors
        }
        pcRef.current = null;
      }

      stopAllTracks(localStreamRef.current);
      localStreamRef.current = null;

      stopAllTracks(remoteStreamRef.current);
      remoteStreamRef.current = null;

      clearMediaElement(localVideoRef.current);
      clearMediaElement(remoteVideoRef.current);
      clearMediaElement(remoteAudioRef.current);

      pendingCandidatesRef.current = [];
      setRemoteConnected(false);
      setIsMuted(false);
      setIsCameraOff(mode !== "video");
      setCallStatus(nextStatus);
    },
    [mode]
  );

  useEffect(() => {
    if (!active || !roomCode || !userId) {
      cleanupCall("idle");
      return;
    }

    const generation = ++sessionGenerationRef.current;
    let cancelled = false;
    const isStale = () =>
      cancelled || sessionGenerationRef.current !== generation;

    setCallStatus("connecting");
    setMediaError(null);
    setRemoteConnected(false);

    const startPeerSession = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Media devices are unavailable in this browser. Open the site over HTTPS and grant mic/camera permission."
          );
        }

        const wantVideo = mode === "video";
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: wantVideo
            ? {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 },
              }
            : false,
        });

        if (isStale()) {
          stopAllTracks(stream);
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current && wantVideo) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        pc.ontrack = (event) => {
          if (isStale()) return;
          const incomingStream = event.streams[0] || remoteStreamRef.current;
          if (!incomingStream) return;
          remoteStreamRef.current = incomingStream;
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = incomingStream;
          }
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = incomingStream;
          }
          setRemoteConnected(true);
          setCallStatus("connected");
        };

        const handleConnectionState = () => {
          if (isStale()) return;
          if (pc.connectionState === "connected") {
            setRemoteConnected(true);
            setCallStatus("connected");
          } else if (pc.connectionState === "closed") {
            cleanupCall("ended");
          } else if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setRemoteConnected(false);
            setCallStatus("connecting");
          }
        };

        pc.onconnectionstatechange = handleConnectionState;
        pc.oniceconnectionstatechange = handleConnectionState;

        const channel = supabase.channel(`webrtc-room-${roomCode}`, {
          config: { broadcast: { self: false } },
        });
        channelRef.current = channel;

        const sendSignal = async (payload: Omit<SignalPayload, "senderId">) => {
          if (isStale()) return;
          await channel.send({
            type: "broadcast",
            event: "signal",
            payload: {
              ...payload,
              senderId: userId,
            } satisfies SignalPayload,
          });
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && !isStale()) {
            sendSignal({
              type: "ice-candidate",
              candidate: event.candidate.toJSON(),
            }).catch(() => {});
          }
        };

        const flushPendingCandidates = async () => {
          if (!pc.remoteDescription || isStale()) return;
          while (pendingCandidatesRef.current.length > 0) {
            const next = pendingCandidatesRef.current.shift();
            if (next) {
              await pc.addIceCandidate(new RTCIceCandidate(next));
            }
          }
        };

        const createAndSendOffer = async () => {
          if (isStale()) return;
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: wantVideo,
          });
          if (isStale()) return;
          await pc.setLocalDescription(offer);
          await sendSignal({
            type: "offer",
            sdp: pc.localDescription ?? offer,
          });
        };

        channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
          const msg = payload as SignalPayload;
          if (!msg || msg.senderId === userId || isStale()) return;

          try {
            if (msg.type === "hangup") {
              cleanupCall("ended");
            } else if (msg.type === "ready" && isInitiator) {
              await createAndSendOffer();
            } else if (msg.type === "offer" && msg.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              await flushPendingCandidates();
              if (isStale()) return;
              const answer = await pc.createAnswer();
              if (isStale()) return;
              await pc.setLocalDescription(answer);
              await sendSignal({
                type: "answer",
                sdp: pc.localDescription ?? answer,
              });
            } else if (msg.type === "answer" && msg.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              await flushPendingCandidates();
            } else if (msg.type === "ice-candidate" && msg.candidate) {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } else {
                pendingCandidatesRef.current.push(msg.candidate);
              }
            }
          } catch {
            // Ignore transient signaling race conditions
          }
        });

        channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !isStale()) {
            await sendSignal({ type: "ready" });
            if (isInitiator) {
              await createAndSendOffer();
            }
          }
        });
      } catch (err) {
        if (!isStale()) {
          cleanupCall("ended");
          setMediaError(
            err instanceof Error
              ? err.message
              : "Could not access microphone or camera for the call."
          );
        }
      }
    };

    startPeerSession();

    return () => {
      cancelled = true;
      const activeChannel = channelRef.current;
      if (activeChannel && userId) {
        activeChannel
          .send({
            type: "broadcast",
            event: "signal",
            payload: {
              type: "hangup",
              senderId: userId,
            } satisfies SignalPayload,
          })
          .catch(() => {});
      }
      cleanupCall("idle");
    };
  }, [active, roomCode, userId, isInitiator, mode, cleanupCall]);

  useEffect(() => {
    if (active && mode === "video") {
      attachLocalPreview();
    }
  }, [active, mode, attachLocalPreview]);

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !isMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;
    const nextOff = !isCameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !nextOff;
    });
    setIsCameraOff(nextOff);
  };

  const endCall = useCallback(() => {
    const activeChannel = channelRef.current;
    if (activeChannel && userId) {
      activeChannel
        .send({
          type: "broadcast",
          event: "signal",
          payload: {
            type: "hangup",
            senderId: userId,
          } satisfies SignalPayload,
        })
        .catch(() => {});
    }
    cleanupCall("ended");
  }, [cleanupCall, userId]);

  return {
    callStatus,
    isMuted,
    isCameraOff,
    remoteConnected,
    mediaError,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    toggleMute,
    toggleCamera,
    endCall,
  };
}
