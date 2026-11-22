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
  type: "offer" | "answer" | "ice-candidate" | "ready";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    setIsCameraOff(mode !== "video");
  }, [mode]);

  const attachLocalPreview = useCallback(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, []);

  const cleanupCall = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingCandidatesRef.current = [];
    setRemoteConnected(false);
    setIsMuted(false);
    setCallStatus("ended");
  }, []);

  useEffect(() => {
    if (!active || !roomCode || !userId) {
      setCallStatus("idle");
      return;
    }

    let cancelled = false;
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

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
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
          const remoteStream = event.streams[0];
          if (!remoteStream) return;
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
          }
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          setRemoteConnected(true);
          setCallStatus("connected");
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setRemoteConnected(true);
            setCallStatus("connected");
          } else if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setCallStatus("connecting");
          }
        };

        const channel = supabase.channel(`webrtc-room-${roomCode}`, {
          config: { broadcast: { self: false } },
        });
        channelRef.current = channel;

        const sendSignal = async (payload: Omit<SignalPayload, "senderId">) => {
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
          if (event.candidate) {
            sendSignal({
              type: "ice-candidate",
              candidate: event.candidate.toJSON(),
            }).catch(() => {});
          }
        };

        const flushPendingCandidates = async () => {
          if (!pc.remoteDescription) return;
          while (pendingCandidatesRef.current.length > 0) {
            const next = pendingCandidatesRef.current.shift();
            if (next) {
              await pc.addIceCandidate(new RTCIceCandidate(next));
            }
          }
        };

        const createAndSendOffer = async () => {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: wantVideo,
          });
          await pc.setLocalDescription(offer);
          await sendSignal({
            type: "offer",
            sdp: pc.localDescription ?? offer,
          });
        };

        channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
          const msg = payload as SignalPayload;
          if (!msg || msg.senderId === userId || cancelled) return;

          try {
            if (msg.type === "ready" && isInitiator) {
              await createAndSendOffer();
            } else if (msg.type === "offer" && msg.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              await flushPendingCandidates();
              const answer = await pc.createAnswer();
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
          if (status === "SUBSCRIBED" && !cancelled) {
            await sendSignal({ type: "ready" });
            if (isInitiator) {
              await createAndSendOffer();
            }
          }
        });
      } catch (err) {
        if (!cancelled) {
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
      cleanupCall();
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

  const endCall = () => {
    cleanupCall();
  };

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
