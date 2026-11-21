import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export type CallMediaStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "muted"
  | "error"
  | "ended";

interface UseWebRtcAudioCallOptions {
  roomCode: string | null | undefined;
  userId: string | null | undefined;
  isInitiator: boolean;
  active: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRtcAudioCall({
  roomCode,
  userId,
  isInitiator,
  active,
}: UseWebRtcAudioCallOptions) {
  const [callStatus, setCallStatus] = useState<CallMediaStatus>("idle");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [remoteConnected, setRemoteConnected] = useState<boolean>(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescRef = useRef<boolean>(false);

  const cleanupCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    pendingCandidatesRef.current = [];
    hasRemoteDescRef.current = false;
    setRemoteConnected(false);
    setIsMuted(false);
  }, []);

  const flushPendingCandidates = async (pc: RTCPeerConnection) => {
    while (pendingCandidatesRef.current.length > 0) {
      const candidate = pendingCandidatesRef.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore stale ICE candidates
        }
      }
    }
  };

  useEffect(() => {
    if (!active || !roomCode || !userId) {
      cleanupCall();
      setCallStatus("idle");
      return;
    }

    let cancelled = false;
    setMediaError(null);
    setCallStatus("connecting");

    const startAudioSession = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Microphone access requires a secure browser context (HTTPS or localhost)."
          );
        }

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        if (cancelled) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = localStream;

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });

        pc.ontrack = (event) => {
          const [remoteStream] = event.streams;
          if (remoteStream && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
          }
          setRemoteConnected(true);
          setCallStatus("connected");
        };

        pc.onconnectionstatechange = () => {
          if (!pcRef.current) return;
          if (pcRef.current.connectionState === "connected") {
            setRemoteConnected(true);
            setCallStatus("connected");
          } else if (
            pcRef.current.connectionState === "failed" ||
            pcRef.current.connectionState === "disconnected"
          ) {
            setRemoteConnected(false);
          }
        };

        const channelName = `call-room-${roomCode.trim()}`;
        const channel = supabase.channel(channelName, {
          config: { broadcast: { self: false } },
        });
        channelRef.current = channel;

        pc.onicecandidate = (event) => {
          if (event.candidate && channelRef.current) {
            channelRef.current.send({
              type: "broadcast",
              event: "webrtc-ice",
              payload: {
                senderId: userId,
                candidate: event.candidate.toJSON(),
              },
            });
          }
        };

        channel
          .on("broadcast", { event: "webrtc-offer" }, async ({ payload }) => {
            if (!payload || payload.senderId === userId || !pcRef.current)
              return;
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription(payload.offer)
            );
            hasRemoteDescRef.current = true;
            await flushPendingCandidates(pcRef.current);

            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);

            channel.send({
              type: "broadcast",
              event: "webrtc-answer",
              payload: {
                senderId: userId,
                answer,
              },
            });
          })
          .on("broadcast", { event: "webrtc-answer" }, async ({ payload }) => {
            if (!payload || payload.senderId === userId || !pcRef.current)
              return;
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription(payload.answer)
            );
            hasRemoteDescRef.current = true;
            await flushPendingCandidates(pcRef.current);
          })
          .on("broadcast", { event: "webrtc-ice" }, async ({ payload }) => {
            if (
              !payload ||
              payload.senderId === userId ||
              !payload.candidate ||
              !pcRef.current
            ) {
              return;
            }
            if (hasRemoteDescRef.current) {
              try {
                await pcRef.current.addIceCandidate(
                  new RTCIceCandidate(payload.candidate)
                );
              } catch {
                // Ignore invalid candidate
              }
            } else {
              pendingCandidatesRef.current.push(payload.candidate);
            }
          })
          .on(
            "broadcast",
            { event: "webrtc-peer-ready" },
            async ({ payload }) => {
              if (!payload || payload.senderId === userId || !pcRef.current)
                return;
              if (isInitiator) {
                const offer = await pcRef.current.createOffer();
                await pcRef.current.setLocalDescription(offer);
                channel.send({
                  type: "broadcast",
                  event: "webrtc-offer",
                  payload: {
                    senderId: userId,
                    offer,
                  },
                });
              }
            }
          )
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED" && !cancelled) {
              channel.send({
                type: "broadcast",
                event: "webrtc-peer-ready",
                payload: { senderId: userId },
              });

              if (isInitiator && pcRef.current) {
                const offer = await pcRef.current.createOffer();
                await pcRef.current.setLocalDescription(offer);
                channel.send({
                  type: "broadcast",
                  event: "webrtc-offer",
                  payload: {
                    senderId: userId,
                    offer,
                  },
                });
              }
            }
          });
      } catch (err) {
        if (!cancelled) {
          setCallStatus("error");
          setMediaError(
            err instanceof Error
              ? err.message
              : "Unable to initialize microphone audio call."
          );
        }
      }
    };

    startAudioSession();

    return () => {
      cancelled = true;
      cleanupCall();
    };
  }, [active, roomCode, userId, isInitiator, cleanupCall]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !isMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    setCallStatus((prev) =>
      prev === "error"
        ? prev
        : nextMuted
        ? "muted"
        : remoteConnected
        ? "connected"
        : "connecting"
    );
  }, [isMuted, remoteConnected]);

  const endAudioCall = useCallback(() => {
    cleanupCall();
    setCallStatus("ended");
  }, [cleanupCall]);

  return {
    callStatus,
    isMuted,
    remoteConnected,
    mediaError,
    remoteAudioRef,
    toggleMute,
    endAudioCall,
  };
}
