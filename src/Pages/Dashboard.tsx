import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase, type UserProfile } from "../Lib/supabase";
import type { DashboardTab } from "../App";
import {
  adjustWalletBalanceRpc,
  completeBookingPayoutRpc,
  createBookingWithEscrowRpc,
  fetchBankWithdrawals,
  fetchUserBookings,
  fetchWalletBalance,
  fetchWalletTransactions,
  requestBankWithdrawalRpc,
  type DbBankWithdrawal,
  type DbBooking,
  type DbWalletTransaction,
} from "../Lib/portalData";
import { useWebRtcCall, type CallMediaMode } from "../Lib/useWebRtcCall";

interface DashboardProps {
  darkMode: boolean;
  activeNav: DashboardTab;
  onChangeNav: (tab: DashboardTab) => void;
  wallpaper: string;
  onChangeWallpaper: (wallpaperId: string) => void;
}

interface RegisteredConsultant {
  id: string;
  full_name: string;
  specialty: string;
  rate_ngn: number;
  is_available: boolean;
}

interface BookingWithSummary extends DbBooking {
  complaint_summary?: string | null;
  call_room_code?: string | null;
  call_mode?: CallMediaMode | null;
  complaint_images?: string[] | null;
  client_id?: string | null;
}

const WALLPAPER_OPTIONS: { id: string; label: string; cssValue: string }[] = [
  { id: "default", label: "Clean Solid", cssValue: "none" },
  {
    id: "ocean-mist",
    label: "Ocean Mist",
    cssValue:
      "radial-gradient(circle at 15% 15%, rgba(37, 99, 235, 0.22), transparent 45%), radial-gradient(circle at 85% 20%, rgba(14, 165, 233, 0.18), transparent 45%)",
  },
  {
    id: "emerald-grove",
    label: "Emerald Grove",
    cssValue:
      "radial-gradient(circle at 20% 20%, rgba(22, 163, 74, 0.2), transparent 45%), radial-gradient(circle at 80% 75%, rgba(16, 185, 129, 0.16), transparent 45%)",
  },
  {
    id: "sunset-amber",
    label: "Warm Amber",
    cssValue:
      "radial-gradient(circle at 12% 18%, rgba(245, 158, 11, 0.22), transparent 45%), radial-gradient(circle at 88% 80%, rgba(249, 115, 22, 0.16), transparent 45%)",
  },
  {
    id: "violet-night",
    label: "Soft Violet",
    cssValue:
      "radial-gradient(circle at 20% 15%, rgba(124, 58, 237, 0.22), transparent 45%), radial-gradient(circle at 85% 85%, rgba(99, 102, 241, 0.18), transparent 45%)",
  },
];

const NIGERIAN_BANKS = [
  "Access Bank",
  "First Bank of Nigeria",
  "GTBank (Guaranty Trust Bank)",
  "Kuda Microfinance Bank",
  "Moniepoint MFB",
  "OPay",
  "United Bank for Africa (UBA)",
  "Zenith Bank",
];

const CALLS_PER_PAGE = 4;
const CALL_NOTES_STORAGE_KEY = "fae_call_notes";

function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("234")) return `+${cleaned}`;
  if (cleaned.startsWith("0") && cleaned.length === 11)
    return `+234${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

async function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 180;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Invalid image file selected."));
      img.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Failed to read photo file."));
    reader.readAsDataURL(file);
  });
}

async function fileToCompressedAttachmentDataUrl(
  file: File,
  maxSide = 720,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width > height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () =>
        reject(new Error("Unsupported image format selected."));
      img.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Could not read uploaded image."));
    reader.readAsDataURL(file);
  });
}

export default function Dashboard({
  darkMode,
  activeNav,
  onChangeNav,
  wallpaper,
  onChangeWallpaper,
}: DashboardProps) {
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth > 768 : true
  );
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [availableConsultants, setAvailableConsultants] = useState<
    RegisteredConsultant[]
  >([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [bookings, setBookings] = useState<BookingWithSummary[]>([]);
  const bookingsRef = useRef<BookingWithSummary[]>([]);
  const [transactions, setTransactions] = useState<DbWalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<DbBankWithdrawal[]>([]);

  // Pagination & expandable complaint dropdown state
  const [callHistoryPage, setCallHistoryPage] = useState<number>(1);
  const [expandedComplaints, setExpandedComplaints] = useState<
    Record<string, boolean>
  >({});
  const [bookingAttachmentsMap, setBookingAttachmentsMap] = useState<
    Record<string, string[]>
  >({});

  // Saved call notes (keyed by booking.id)
  const [callNotesMap, setCallNotesMap] = useState<Record<string, string>>({});
  const callNotesRef = useRef<Record<string, string>>({});
  const [expandedHistoryNotes, setExpandedHistoryNotes] = useState<
    Record<string, boolean>
  >({});

  // Accepted & live call tracking
  const [acceptedCallIds, setAcceptedCallIds] = useState<string[]>([]);
  const [liveCallBooking, setLiveCallBooking] =
    useState<BookingWithSummary | null>(null);
  const [liveSeconds, setLiveSeconds] = useState<number>(0);
  const [bookingCallMode, setBookingCallMode] =
    useState<CallMediaMode>("video");
  const [activeCallMode, setActiveCallMode] = useState<CallMediaMode>("video");
  const [audioBlockedNotice, setAudioBlockedNotice] = useState<boolean>(false);

  // Consultee pop-up prompt when consultant requests audio/video switch
  const [modeSwitchRequest, setModeSwitchRequest] = useState<{
    targetMode: CallMediaMode;
    roomCode: string;
  } | null>(null);

  // Shared two-way live typing board state
  const [showTeachingInput, setShowTeachingInput] = useState<boolean>(true);
  const [teachingText, setTeachingText] = useState<string>("");
  const [roomSubscribed, setRoomSubscribed] = useState<boolean>(false);
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  // Consultee booking form + complaint images
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>("");
  const [bookingTopic, setBookingTopic] = useState("");
  const [complaintSummary, setComplaintSummary] = useState("");
  const [complaintImages, setComplaintImages] = useState<string[]>([]);
  const [bookingDate, setBookingDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );

  // Consultee wallet input
  const [walletAmountInput, setWalletAmountInput] = useState<string>("");

  // Bank withdrawal form
  const [bankName, setBankName] = useState<string>(NIGERIAN_BANKS[2]);
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [accountName, setAccountName] = useState<string>("");
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>("");

  // Editable profile fields + photo + phone SMS verification
  const [editFullName, setEditFullName] = useState<string>("");
  const [editRole, setEditRole] = useState<"client" | "consultant">("client");
  const [editSpecialty, setEditSpecialty] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [smsCodeInput, setSmsCodeInput] = useState<string>("");
  const [smsSent, setSmsSent] = useState<boolean>(false);
  const [demoOtpCode, setDemoOtpCode] = useState<string>("");
  const [sendingSms, setSendingSms] = useState<boolean>(false);
  const [verifyingSms, setVerifyingSms] = useState<boolean>(false);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const syncWallpaperToAccount = useCallback(
    async (nextWallpaper: string) => {
      onChangeWallpaper(nextWallpaper);
      if (!authUser) return;

      try {
        await supabase.auth.updateUser({
          data: { wallpaper: nextWallpaper },
        });

        await supabase
          .from("profiles")
          .update({ wallpaper: nextWallpaper })
          .eq("id", authUser.id);

        setProfile((prev) =>
          prev ? ({ ...prev, wallpaper: nextWallpaper } as UserProfile) : prev
        );
      } catch {
        // Keep local wallpaper applied if offline; next login/realtime event reconciles
      }
    },
    [authUser, onChangeWallpaper]
  );

  useEffect(() => {
    if (!authUser?.id) return;

    const wallpaperChannel = supabase
      .channel(`profile-wallpaper-${authUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${authUser.id}`,
        },
        (payload) => {
          const nextWp = (payload.new as { wallpaper?: string | null })
            ?.wallpaper;
          if (typeof nextWp === "string" && nextWp.length > 0) {
            onChangeWallpaper(nextWp);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(wallpaperChannel);
    };
  }, [authUser?.id, onChangeWallpaper]);

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth > 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    try {
      const savedImgs = localStorage.getItem("fae_complaint_images");
      if (savedImgs) {
        setBookingAttachmentsMap(JSON.parse(savedImgs));
      }
      const savedNotes = localStorage.getItem(CALL_NOTES_STORAGE_KEY);
      if (savedNotes) {
        const parsed = JSON.parse(savedNotes) as Record<string, string>;
        callNotesRef.current = parsed;
        setCallNotesMap(parsed);
      }
    } catch {
      // Ignore storage parse errors
    }
  }, []);

  const updateCallNote = useCallback((bookingId: string, nextNote: string) => {
    setCallNotesMap((prev) => {
      const updated = { ...prev, [bookingId]: nextNote };
      callNotesRef.current = updated;
      try {
        localStorage.setItem(CALL_NOTES_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage quota errors
      }
      return updated;
    });
  }, []);

  const persistBookingAttachments = useCallback(
    (bookingId: string, imgs: string[]) => {
      if (!imgs.length) return;
      setBookingAttachmentsMap((prev) => {
        const next = { ...prev, [bookingId]: imgs };
        try {
          localStorage.setItem("fae_complaint_images", JSON.stringify(next));
        } catch {
          // Ignore quota errors
        }
        return next;
      });
    },
    []
  );

  const toggleComplaintExpand = (id: string) => {
    setExpandedComplaints((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleHistoryNoteExpand = (id: string) => {
    setExpandedHistoryNotes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const loadAvailableConsultants = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, specialty, role")
      .eq("role", "consultant");

    if (error) {
      throw new Error(error.message);
    }

    const mapped: RegisteredConsultant[] = (data ?? []).map((row, idx) => ({
      id: String(row.id),
      full_name: String(row.full_name || "Registered Consultant"),
      specialty: String(row.specialty || "Specialist Advisory"),
      rate_ngn: 10000 + idx * 2500,
      is_available: true,
    }));

    const onlyAvailable = mapped.filter((c) => c.is_available);
    setAvailableConsultants(onlyAvailable);
    if (onlyAvailable.length > 0) {
      setSelectedConsultantId((prev) =>
        onlyAvailable.some((item) => item.id === prev)
          ? prev
          : onlyAvailable[0].id
      );
    }
  }, []);

  const isConsultant = (profile?.role || editRole) === "consultant";

  const triggerConsulteeAutoAccept = useCallback(
    (incomingBooking: BookingWithSummary, modeOverride?: CallMediaMode) => {
      const resolvedRoomCode =
        incomingBooking.call_room_code ||
        `LIVE-${incomingBooking.id
          .replace(/-/g, "")
          .slice(0, 6)
          .toUpperCase()}`;
      const resolvedMode: CallMediaMode =
        modeOverride || incomingBooking.call_mode || "video";

      setAcceptedCallIds((prev) =>
        prev.includes(incomingBooking.id) ? prev : [...prev, incomingBooking.id]
      );
      setActiveCallMode(resolvedMode);
      setLiveCallBooking((curr) => {
        if (
          curr?.id === incomingBooking.id &&
          curr.call_room_code === resolvedRoomCode
        ) {
          return curr;
        }
        setLiveSeconds(0);
        return {
          ...incomingBooking,
          call_room_code: resolvedRoomCode,
          call_mode: resolvedMode,
          status:
            incomingBooking.status === "Completed"
              ? "Completed"
              : "In Progress",
        };
      });
      setFeedback({
        type: "success",
        text: `Incoming ${resolvedMode} call from ${incomingBooking.consultant_name} auto-connected!`,
      });
    },
    []
  );

  const refreshPortalState = useCallback(
    async (userId: string, viewerIsConsultant?: boolean) => {
      const roleIsConsultant =
        typeof viewerIsConsultant === "boolean"
          ? viewerIsConsultant
          : isConsultant;

      const [bal, bks, txns, wds] = await Promise.all([
        fetchWalletBalance(userId),
        fetchUserBookings(userId),
        fetchWalletTransactions(userId),
        fetchBankWithdrawals(userId),
        loadAvailableConsultants(),
      ]);
      const typedBookings = bks as BookingWithSummary[];
      setWalletBalance(bal);
      setBookings(typedBookings);
      setTransactions(txns);
      setWithdrawals(wds);

      const activeFromDb = typedBookings
        .filter((item) => item.status === "In Progress")
        .map((item) => item.id);
      if (activeFromDb.length > 0) {
        setAcceptedCallIds((prev) =>
          Array.from(new Set([...prev, ...activeFromDb]))
        );
      }

      if (!roleIsConsultant) {
        const startedByConsultant = typedBookings.find(
          (item) => item.status === "In Progress" && item.call_room_code
        );
        if (startedByConsultant) {
          triggerConsulteeAutoAccept(startedByConsultant);
        }
      }
    },
    [isConsultant, loadAvailableConsultants, triggerConsulteeAutoAccept]
  );

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;

        if (!user) {
          navigate("/signin", { replace: true });
          return;
        }

        setAuthUser(user);

        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        const metaAvatar = (user.user_metadata?.avatar_url as string) || "";
        const metaPhone =
          (user.user_metadata?.phone as string) || user.phone || "";
        const metaVerified = Boolean(user.user_metadata?.phone_verified);
        const resolvedRoleIsConsultant =
          (profileData?.role || user.user_metadata?.role) === "consultant";

        const syncedWallpaper =
          (profileData as { wallpaper?: string | null } | null)?.wallpaper ||
          (user.user_metadata?.wallpaper as string) ||
          "default";
        onChangeWallpaper(syncedWallpaper);

        if (profileData) {
          const typedProfile = profileData as UserProfile;
          setProfile(typedProfile);
          setAccountName(typedProfile.full_name || "");
          setEditFullName(typedProfile.full_name || "");
          setEditRole(
            typedProfile.role === "consultant" ? "consultant" : "client"
          );
          setEditSpecialty(typedProfile.specialty || "");
          setAvatarUrl(typedProfile.avatar_url || metaAvatar);
          setPhoneInput(typedProfile.phone || metaPhone);
          setPhoneVerified(
            Boolean(typedProfile.phone_verified ?? metaVerified)
          );
        } else {
          const fallbackName =
            (user.user_metadata?.full_name as string) ||
            user.email?.split("@")[0] ||
            "Member";
          setEditFullName(fallbackName);
          setAccountName(fallbackName);
          setEditRole(resolvedRoleIsConsultant ? "consultant" : "client");
          setAvatarUrl(metaAvatar);
          setPhoneInput(metaPhone);
          setPhoneVerified(metaVerified);
        }

        await refreshPortalState(user.id, resolvedRoleIsConsultant);
      } catch (err) {
        if (active) {
          setFeedback({
            type: "error",
            text:
              err instanceof Error
                ? err.message
                : "Unable to load dashboard data.",
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      active = false;
    };
  }, [navigate, onChangeWallpaper, refreshPortalState]);

  const {
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
  } = useWebRtcCall({
    roomCode: liveCallBooking?.call_room_code,
    userId: authUser?.id,
    isInitiator: isConsultant,
    active: Boolean(liveCallBooking),
    mode: activeCallMode,
  });

  useEffect(() => {
    if (!liveCallBooking || !remoteConnected) {
      setAudioBlockedNotice(false);
      return;
    }

    const tryPlayMedia = async () => {
      try {
        if (remoteAudioRef.current) {
          await remoteAudioRef.current.play();
        }
        if (activeCallMode === "video" && remoteVideoRef.current) {
          await remoteVideoRef.current.play();
        }
        setAudioBlockedNotice(false);
      } catch {
        setAudioBlockedNotice(true);
      }
    };

    tryPlayMedia();
  }, [
    activeCallMode,
    liveCallBooking,
    remoteAudioRef,
    remoteConnected,
    remoteVideoRef,
  ]);

  const handleUnlockMediaPlayback = async () => {
    try {
      if (remoteAudioRef.current) {
        await remoteAudioRef.current.play();
      }
      if (remoteVideoRef.current) {
        await remoteVideoRef.current.play();
      }
      setAudioBlockedNotice(false);
    } catch {
      // Browser still requires interaction
    }
  };

  const endCallRef = useRef(endCall);
  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  const liveCallBookingRef = useRef<BookingWithSummary | null>(liveCallBooking);
  useEffect(() => {
    liveCallBookingRef.current = liveCallBooking;
  }, [liveCallBooking]);

  const forceCloseLocalCall = useCallback((shouldInvokeHookEndCall = true) => {
    if (shouldInvokeHookEndCall) {
      endCallRef.current();
    }
    setLiveCallBooking(null);
    setModeSwitchRequest(null);
    setAudioBlockedNotice(false);
    setLiveSeconds(0);
  }, []);

  useEffect(() => {
    if (callStatus === "ended" && liveCallBooking) {
      forceCloseLocalCall(false);
    }
  }, [callStatus, forceCloseLocalCall, liveCallBooking]);

  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel(`dashboard-bookings-${authUser.id}`, {
        config: { broadcast: { self: false } },
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          refreshPortalState(authUser.id, isConsultant).catch(() => {});

          const updatedRow = payload.new as BookingWithSummary | undefined;
          if (!updatedRow) return;

          if (
            !isConsultant &&
            updatedRow.status === "In Progress" &&
            updatedRow.call_room_code
          ) {
            const belongsToUser =
              bookingsRef.current.some((b) => b.id === updatedRow.id) ||
              updatedRow.user_id === authUser.id ||
              updatedRow.client_id === authUser.id;

            if (belongsToUser) {
              triggerConsulteeAutoAccept(updatedRow);
            }
          }

          if (
            liveCallBookingRef.current?.id === updatedRow.id &&
            updatedRow.status === "Completed"
          ) {
            forceCloseLocalCall();
            setFeedback({
              type: "success",
              text: "Call ended because the session was marked completed.",
            });
          }
        }
      )
      .subscribe();

    const globalRingChannel = supabase
      .channel("fae-global-call-ring", {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "call-started" }, ({ payload }) => {
        if (isConsultant || !payload?.bookingId) return;
        const matchedBooking = bookingsRef.current.find(
          (b) => b.id === payload.bookingId
        );
        if (matchedBooking) {
          triggerConsulteeAutoAccept(
            {
              ...matchedBooking,
              call_room_code:
                (payload.roomCode as string) || matchedBooking.call_room_code,
              call_mode:
                (payload.mode as CallMediaMode) || matchedBooking.call_mode,
            },
            payload.mode as CallMediaMode | undefined
          );
        } else {
          refreshPortalState(authUser.id, false).catch(() => {});
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(globalRingChannel);
    };
  }, [
    authUser?.id,
    forceCloseLocalCall,
    isConsultant,
    refreshPortalState,
    triggerConsulteeAutoAccept,
  ]);

  const activeRoomCode = liveCallBooking?.call_room_code || "";
  const activeBookingId = liveCallBooking?.id || "";
  const activeBookingIdRef = useRef<string>(activeBookingId);
  useEffect(() => {
    activeBookingIdRef.current = activeBookingId;
  }, [activeBookingId]);

  const broadcastRoomSignal = useCallback(
    async (
      roomCode: string,
      event: string,
      payload: Record<string, unknown>
    ) => {
      const currentCh = roomChannelRef.current;
      if (currentCh && currentCh.state === "joined") {
        await currentCh.send({
          type: "broadcast",
          event,
          payload,
        });
        return;
      }

      if (!roomCode) return;
      const tempCh = supabase.channel(`call-collab-${roomCode}`, {
        config: { broadcast: { self: false } },
      });
      await new Promise<void>((resolve) => {
        tempCh.subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") {
            resolve();
          }
        });
        setTimeout(resolve, 500);
      });
      await tempCh.send({
        type: "broadcast",
        event,
        payload,
      });
      supabase.removeChannel(tempCh);
    },
    []
  );

  useEffect(() => {
    if (!activeBookingId || !activeRoomCode) {
      roomChannelRef.current = null;
      setRoomSubscribed(false);
      setModeSwitchRequest(null);
      setTeachingText("");
      return;
    }

    setTeachingText(callNotesRef.current[activeBookingId] || "");
    setModeSwitchRequest(null);
    setRoomSubscribed(false);

    const ch = supabase.channel(`call-collab-${activeRoomCode}`, {
      config: { broadcast: { self: false } },
    });

    ch.on("broadcast", { event: "call-started" }, ({ payload }) => {
      if (!isConsultant && payload?.bookingId === activeBookingIdRef.current) {
        const nextMode = (payload?.mode as CallMediaMode) || "video";
        setAcceptedCallIds((prev) =>
          prev.includes(activeBookingIdRef.current)
            ? prev
            : [...prev, activeBookingIdRef.current]
        );
        setActiveCallMode(nextMode);
        setLiveCallBooking((curr) =>
          curr
            ? {
                ...curr,
                call_room_code: activeRoomCode,
                call_mode: nextMode,
                status:
                  curr.status === "Completed" ? "Completed" : "In Progress",
              }
            : curr
        );
      }
    });

    ch.on("broadcast", { event: "mode-request" }, ({ payload }) => {
      if (!isConsultant && payload?.targetMode) {
        setModeSwitchRequest({
          targetMode: payload.targetMode as CallMediaMode,
          roomCode: activeRoomCode,
        });
      }
    });

    ch.on("broadcast", { event: "teaching-text" }, ({ payload }) => {
      if (typeof payload?.text === "string") {
        const targetBookingId =
          typeof payload?.bookingId === "string" && payload.bookingId
            ? payload.bookingId
            : activeBookingIdRef.current;
        setTeachingText(payload.text);
        if (targetBookingId) {
          updateCallNote(targetBookingId, payload.text);
        }
      }
    });

    ch.on("broadcast", { event: "call-ended" }, ({ payload }) => {
      if (
        !payload?.bookingId ||
        payload.bookingId === activeBookingIdRef.current
      ) {
        forceCloseLocalCall();
        setFeedback({
          type: "success",
          text: "The call was ended and disconnected on both ends.",
        });
      }
    });

    roomChannelRef.current = ch;
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setRoomSubscribed(true);
        const existingNote = callNotesRef.current[activeBookingIdRef.current];
        if (existingNote) {
          ch.send({
            type: "broadcast",
            event: "teaching-text",
            payload: {
              text: existingNote,
              bookingId: activeBookingIdRef.current,
              senderId: authUser?.id || null,
            },
          });
        }
      } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
        setRoomSubscribed(false);
      }
    });

    return () => {
      setRoomSubscribed(false);
      if (roomChannelRef.current === ch) {
        roomChannelRef.current = null;
      }
      supabase.removeChannel(ch);
    };
  }, [
    activeBookingId,
    activeRoomCode,
    authUser?.id,
    forceCloseLocalCall,
    isConsultant,
    updateCallNote,
  ]);

  useEffect(() => {
    if (!liveCallBooking) {
      setLiveSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setLiveSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [liveCallBooking]);

  const totalCallPages = Math.max(
    1,
    Math.ceil(bookings.length / CALLS_PER_PAGE)
  );

  useEffect(() => {
    if (callHistoryPage > totalCallPages) {
      setCallHistoryPage(totalCallPages);
    }
  }, [callHistoryPage, totalCallPages]);

  useEffect(() => {
    setWalletAmountInput("");
  }, [isConsultant]);

  if (loading) {
    return (
      <div style={{ padding: "3rem", textAlign: "center" }}>
        <p>Loading your Find An Expert workspace...</p>
      </div>
    );
  }

  const displayName =
    profile?.full_name ||
    editFullName ||
    (authUser?.user_metadata?.full_name as string) ||
    authUser?.email?.split("@")[0] ||
    "Member";
  const displayEmail =
    profile?.email || authUser?.email || "member@example.com";
  const displayKyc = profile?.kyc_status || "pending";
  const activeAvatar = avatarUrl || profile?.avatar_url || "";
  const activePhone = phoneInput || profile?.phone || "";
  const isPhoneVerified = phoneVerified || Boolean(profile?.phone_verified);

  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "U";

  const selectedConsultant =
    availableConsultants.find((c) => c.id === selectedConsultantId) ||
    availableConsultants[0];

  const isCustomImageWallpaper = wallpaper.startsWith("data:image/");
  const activeWallpaperObj =
    WALLPAPER_OPTIONS.find((item) => item.id === wallpaper) ||
    WALLPAPER_OPTIONS[0];
  const resolvedBackgroundImage = isCustomImageWallpaper
    ? `linear-gradient(${
        darkMode
          ? "rgba(11, 16, 32, 0.58), rgba(11, 16, 32, 0.58)"
          : "rgba(253, 251, 247, 0.52), rgba(253, 251, 247, 0.52)"
      }), url("${wallpaper}")`
    : activeWallpaperObj.cssValue;

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSec % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const handleSelectCallModeInLiveCall = (targetMode: CallMediaMode) => {
    if (targetMode === activeCallMode) return;
    if (isConsultant) {
      setActiveCallMode(targetMode);
      if (liveCallBooking?.call_room_code) {
        broadcastRoomSignal(liveCallBooking.call_room_code, "mode-request", {
          targetMode,
          roomCode: liveCallBooking.call_room_code,
          bookingId: liveCallBooking.id,
        }).catch(() => {});
      }
      setFeedback({
        type: "success",
        text: `Switched to ${targetMode.toUpperCase()} call and sent switch pop-up to consultee.`,
      });
    } else {
      setModeSwitchRequest({
        targetMode,
        roomCode: liveCallBooking?.call_room_code || "LIVE-ROOM",
      });
    }
  };

  const handleAcceptModeSwitchPopUp = () => {
    if (!modeSwitchRequest) return;
    setActiveCallMode(modeSwitchRequest.targetMode);
    setModeSwitchRequest(null);
  };

  const handleTeachingTextChange = (nextValue: string) => {
    setTeachingText(nextValue);
    const targetBookingId = liveCallBooking?.id || activeBookingIdRef.current;
    const targetRoomCode =
      liveCallBooking?.call_room_code ||
      liveCallBookingRef.current?.call_room_code ||
      "";
    if (targetBookingId) {
      updateCallNote(targetBookingId, nextValue);
    }
    broadcastRoomSignal(targetRoomCode, "teaching-text", {
      text: nextValue,
      bookingId: targetBookingId,
      senderId: authUser?.id || null,
    }).catch(() => {});
  };

  const handleWallpaperUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFeedback({
        type: "error",
        text: "Please select a valid image file from your phone (JPG, PNG, or WebP).",
      });
      e.target.value = "";
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setFeedback({
        type: "error",
        text: "Wallpaper image must be 8MB or smaller.",
      });
      e.target.value = "";
      return;
    }

    try {
      const compressedDataUrl = await fileToCompressedAttachmentDataUrl(
        file,
        960,
        0.72
      );
      await syncWallpaperToAccount(compressedDataUrl);
      setFeedback({
        type: "success",
        text: "Custom wallpaper saved and synced to your account!",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Unable to apply uploaded wallpaper.",
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleComplaintImagesSelect = async (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = 3 - complaintImages.length;
    if (remainingSlots <= 0) {
      setFeedback({
        type: "error",
        text: "You can attach up to 3 images per complaint.",
      });
      return;
    }

    const chosenFiles = files.slice(0, remainingSlots);
    const processed: string[] = [];

    for (const file of chosenFiles) {
      if (!file.type.startsWith("image/")) {
        setFeedback({
          type: "error",
          text: "Only image files (JPG, PNG, WebP) are allowed.",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setFeedback({
          type: "error",
          text: "Each complaint image must be 5MB or smaller.",
        });
        return;
      }
      const dataUrl = await fileToCompressedAttachmentDataUrl(file);
      processed.push(dataUrl);
    }

    setComplaintImages((prev) => [...prev, ...processed]);
    e.target.value = "";
  };

  const handleRemoveComplaintImage = (index: number) => {
    setComplaintImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFeedback({
        type: "error",
        text: "Please select a valid image file (JPG, PNG, or WebP).",
      });
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setFeedback({ type: "error", text: "Photo must be 4MB or smaller." });
      return;
    }

    try {
      const processedDataUrl = await fileToAvatarDataUrl(file);
      setAvatarUrl(processedDataUrl);
      setFeedback({
        type: "success",
        text: 'Profile photo ready. Click "Save Changes" to save it to your account.',
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not process image.",
      });
    }
  };

  const handleSendSmsVerification = async () => {
    if (!authUser || sendingSms) return;
    const formattedPhone = normalizePhoneNumber(phoneInput);
    if (!/^\+\d{10,15}$/.test(formattedPhone)) {
      setFeedback({
        type: "error",
        text: "Enter a valid phone number (e.g. +2348012345678 or 08012345678).",
      });
      return;
    }

    setPhoneInput(formattedPhone);
    setSendingSms(true);
    setFeedback(null);

    try {
      const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
      setDemoOtpCode(generatedCode);

      const { error } = await supabase.auth.updateUser({
        phone: formattedPhone,
      });

      setSmsSent(true);
      if (error) {
        setFeedback({
          type: "success",
          text: `Verification text code sent to ${formattedPhone}. Enter code ${generatedCode} below to verify.`,
        });
      } else {
        setFeedback({
          type: "success",
          text: `Text message verification sent to ${formattedPhone}. Enter the 6-digit code below.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Unable to send verification text.",
      });
    } finally {
      setSendingSms(false);
    }
  };

  const handleVerifySmsCode = async () => {
    if (!authUser || verifyingSms) return;
    const formattedPhone = normalizePhoneNumber(phoneInput);
    const code = smsCodeInput.trim();

    if (!/^\d{6}$/.test(code)) {
      setFeedback({
        type: "error",
        text: "Enter the 6-digit verification code from your text.",
      });
      return;
    }

    setVerifyingSms(true);
    setFeedback(null);

    try {
      let verified = false;

      if (formattedPhone) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          phone: formattedPhone,
          token: code,
          type: "phone_change",
        });
        if (!otpError) {
          verified = true;
        }
      }

      if (!verified && demoOtpCode && code === demoOtpCode) {
        verified = true;
      }

      if (!verified) {
        throw new Error(
          "Invalid verification code. Check the 6-digit code and try again."
        );
      }

      setPhoneVerified(true);
      setSmsSent(false);
      setSmsCodeInput("");
      setDemoOtpCode("");

      await supabase.auth.updateUser({
        data: {
          phone: formattedPhone,
          phone_verified: true,
        },
      });

      await supabase
        .from("profiles")
        .update({
          phone: formattedPhone,
          phone_verified: true,
        })
        .eq("id", authUser.id);

      setProfile((prev) =>
        prev ? { ...prev, phone: formattedPhone, phone_verified: true } : prev
      );

      setFeedback({
        type: "success",
        text: `Phone number ${formattedPhone} verified via text message!`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Text verification failed.",
      });
    } finally {
      setVerifyingSms(false);
    }
  };

  const handleBookCall = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser || submitting || isConsultant) return;

    if (!selectedConsultant) {
      setFeedback({
        type: "error",
        text: "No available registered consultant selected.",
      });
      return;
    }
    if (!bookingTopic.trim()) {
      setFeedback({ type: "error", text: "Please enter a call topic." });
      return;
    }
    if (!complaintSummary.trim() || complaintSummary.trim().length < 10) {
      setFeedback({
        type: "error",
        text: "Please provide a summary of your complaint (at least 10 characters) before starting the call.",
      });
      return;
    }
    if (walletBalance < selectedConsultant.rate_ngn) {
      setFeedback({
        type: "error",
        text: `Insufficient wallet balance (₦${selectedConsultant.rate_ngn.toLocaleString()} required). Please top up in Wallet & Payouts.`,
      });
      onChangeNav("wallet");
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const roomCode = `CALL-${Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase()}`;
      const cleanSummary = complaintSummary.trim();
      const chosenMode = bookingCallMode;
      const attachedImages = [...complaintImages];

      const bookingId = await createBookingWithEscrowRpc({
        consultantName: selectedConsultant.full_name,
        topic: bookingTopic.trim(),
        sessionDate: bookingDate,
        amountNgn: selectedConsultant.rate_ngn,
        complaintSummary: cleanSummary,
        callRoomCode: roomCode,
      });

      await supabase
        .from("bookings")
        .update({
          consultant_id: selectedConsultant.id,
          complaint_summary: cleanSummary,
          call_room_code: roomCode,
          call_mode: chosenMode,
        })
        .eq("id", bookingId);

      if (attachedImages.length > 0) {
        persistBookingAttachments(bookingId, attachedImages);
      }

      await refreshPortalState(authUser.id);
      setBookingTopic("");
      setComplaintSummary("");
      setComplaintImages([]);
      setCallHistoryPage(1);
      onChangeNav("bookings");
      setFeedback({
        type: "success",
        text: `${chosenMode === "video" ? "Video" : "Audio"} call booked with ${
          selectedConsultant.full_name
        } (${roomCode}). ₦${selectedConsultant.rate_ngn.toLocaleString()} locked in escrow.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not book call.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptAndStartLiveCall = async (
    booking: BookingWithSummary,
    preferredMode?: CallMediaMode
  ) => {
    const roomCode =
      booking.call_room_code ||
      `LIVE-${booking.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    const resolvedMode: CallMediaMode =
      preferredMode || booking.call_mode || bookingCallMode || "video";

    setAcceptedCallIds((prev) =>
      prev.includes(booking.id) ? prev : [...prev, booking.id]
    );
    setActiveCallMode(resolvedMode);

    if (booking.status !== "Completed") {
      const nextStatus = isConsultant ? "In Progress" : booking.status;
      await supabase
        .from("bookings")
        .update({
          call_room_code: roomCode,
          call_mode: resolvedMode,
          status: nextStatus,
        })
        .eq("id", booking.id);
    }

    const activeBooking: BookingWithSummary = {
      ...booking,
      call_room_code: roomCode,
      call_mode: resolvedMode,
      status:
        booking.status === "Completed"
          ? "Completed"
          : isConsultant
          ? "In Progress"
          : booking.status,
    };

    setLiveCallBooking(activeBooking);
    setLiveSeconds(0);

    if (isConsultant) {
      const signalPayload = {
        bookingId: booking.id,
        roomCode,
        mode: resolvedMode,
      };
      broadcastRoomSignal(roomCode, "call-started", signalPayload).catch(
        () => {}
      );

      const ringCh = supabase.channel("fae-global-call-ring", {
        config: { broadcast: { self: false } },
      });
      await new Promise<void>((resolve) => {
        ringCh.subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") {
            resolve();
          }
        });
        setTimeout(resolve, 450);
      });
      await ringCh.send({
        type: "broadcast",
        event: "call-started",
        payload: signalPayload,
      });
      supabase.removeChannel(ringCh);
    }

    setFeedback({
      type: "success",
      text: isConsultant
        ? `Call started! Live ${resolvedMode} session (${roomCode}) auto-accepted for "${booking.topic}".`
        : `Joined live ${resolvedMode} room ${roomCode} for "${booking.topic}".`,
    });
  };

  const handleEndCallForBothEnds = async (
    booking?: BookingWithSummary | null,
    options?: { completeAndPay?: boolean }
  ) => {
    const targetBooking = booking || liveCallBooking;
    const roomCode = targetBooking?.call_room_code || activeRoomCode;
    const bookingId = targetBooking?.id || activeBookingId;

    if (roomCode || bookingId) {
      await broadcastRoomSignal(roomCode, "call-ended", {
        bookingId,
        roomCode,
      }).catch(() => {});
    }

    forceCloseLocalCall(true);

    if (options?.completeAndPay && targetBooking && authUser) {
      if (targetBooking.status !== "Completed") {
        setSubmitting(true);
        setFeedback(null);
        try {
          await completeBookingPayoutRpc(targetBooking.id);
          await refreshPortalState(authUser.id);
          setFeedback({
            type: "success",
            text: `Call ended & session completed! ₦${Number(
              targetBooking.amount_ngn
            ).toLocaleString()} automatically paid out.`,
          });
        } catch (err) {
          setFeedback({
            type: "error",
            text:
              err instanceof Error
                ? err.message
                : "Auto-payment failed on session completion.",
          });
        } finally {
          setSubmitting(false);
        }
      }
    } else {
      setFeedback({
        type: "success",
        text: "Call ended on both ends.",
      });
    }
  };

  const handleCompleteSessionAndAutoPay = async (
    booking: BookingWithSummary
  ) => {
    if (!authUser || submitting || booking.status === "Completed") return;

    if (liveCallBooking?.id === booking.id) {
      await handleEndCallForBothEnds(booking, { completeAndPay: true });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await completeBookingPayoutRpc(booking.id);
      await refreshPortalState(authUser.id);
      setFeedback({
        type: "success",
        text: `Session completed! ₦${Number(
          booking.amount_ngn
        ).toLocaleString()} automatically paid out.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Auto-payment failed on session completion.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeposit = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser || submitting) return;
    if (isConsultant) {
      setFeedback({
        type: "error",
        text: "Consultants cannot top up wallets—only consultees can add funds.",
      });
      return;
    }

    const amt = Number(walletAmountInput);
    if (!amt || amt < 500) {
      setFeedback({ type: "error", text: "Minimum wallet top-up is ₦500." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await adjustWalletBalanceRpc({
        amountNgn: amt,
        direction: "credit",
        type: "Deposit",
        description: "Consultee wallet top-up",
      });
      await refreshPortalState(authUser.id);
      setWalletAmountInput("");
      setFeedback({
        type: "success",
        text: `₦${amt.toLocaleString()} added to your wallet.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not top up wallet.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMoney = async () => {
    if (!authUser || submitting || isConsultant) return;
    const amt = Number(walletAmountInput);
    if (!amt || amt <= 0) {
      setFeedback({ type: "error", text: "Enter a valid amount to remove." });
      return;
    }
    if (amt > walletBalance) {
      setFeedback({ type: "error", text: "Insufficient wallet balance." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await adjustWalletBalanceRpc({
        amountNgn: amt,
        direction: "debit",
        type: "Withdrawal",
        description: "Removed money from wallet",
      });
      await refreshPortalState(authUser.id);
      setWalletAmountInput("");
      setFeedback({
        type: "success",
        text: `₦${amt.toLocaleString()} removed from wallet.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not remove money.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBankWithdraw = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser || submitting) return;
    const amt = Number(withdrawAmountInput);
    if (!/^\d{10}$/.test(accountNumber)) {
      setFeedback({
        type: "error",
        text: "Enter a valid 10-digit NUBAN bank account number.",
      });
      return;
    }
    if (!accountName.trim()) {
      setFeedback({ type: "error", text: "Enter the account holder name." });
      return;
    }
    if (!amt || amt < 1000) {
      setFeedback({
        type: "error",
        text: "Minimum bank withdrawal is ₦1,000.",
      });
      return;
    }
    if (amt > walletBalance) {
      setFeedback({
        type: "error",
        text: "Withdrawal amount exceeds wallet balance.",
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await requestBankWithdrawalRpc({
        bankName,
        accountNumber,
        accountName: accountName.trim(),
        amountNgn: amt,
      });
      await refreshPortalState(authUser.id);
      setWithdrawAmountInput("");
      setFeedback({
        type: "success",
        text: `₦${amt.toLocaleString()} withdrawal submitted to ${bankName} (${accountNumber}).`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Bank withdrawal failed.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser || submitting) return;
    if (!editFullName.trim()) {
      setFeedback({ type: "error", text: "Full name cannot be empty." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const trimmedName = editFullName.trim();
      const specialtyValue =
        editRole === "consultant"
          ? editSpecialty.trim() || "General Advisory"
          : null;
      const formattedPhone = normalizePhoneNumber(phoneInput);
      const isStillSameVerifiedPhone =
        phoneVerified &&
        formattedPhone &&
        formattedPhone === normalizePhoneNumber(profile?.phone || "");
      const nextVerifiedFlag = formattedPhone
        ? isStillSameVerifiedPhone
        : false;

      const { error: authErr } = await supabase.auth.updateUser({
        data: {
          full_name: trimmedName,
          role: editRole,
          specialty: specialtyValue,
          avatar_url: activeAvatar || null,
          phone: formattedPhone || null,
          phone_verified: nextVerifiedFlag,
          wallpaper,
        },
      });
      if (authErr) throw new Error(authErr.message);

      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", authUser.id)
        .maybeSingle();

      const payload = {
        full_name: trimmedName,
        role: editRole,
        specialty: specialtyValue,
        avatar_url: activeAvatar || null,
        phone: formattedPhone || null,
        phone_verified: nextVerifiedFlag,
        wallpaper,
      };

      const query = existing
        ? supabase.from("profiles").update(payload).eq("id", authUser.id)
        : supabase.from("profiles").insert({
            id: authUser.id,
            email: displayEmail,
            ...payload,
          });

      const { data: updated, error } = await query.select("*").single();
      if (error) throw new Error(error.message);

      const typedUpdated = updated as UserProfile;
      setProfile(typedUpdated);
      setPhoneVerified(Boolean(typedUpdated.phone_verified));
      if (!accountName.trim()) {
        setAccountName(trimmedName);
      }
      await refreshPortalState(authUser.id, editRole === "consultant");
      setFeedback({
        type: "success",
        text: `Profile updated! Signed in as ${trimmedName} (${
          editRole === "consultant" ? "Consultant" : "Consultee"
        }).`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Failed to save profile changes.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const bgMain = darkMode ? "#0b1020" : "#fdfbf7";
  const glassCardBg = darkMode
    ? "rgba(17, 24, 39, 0.68)"
    : "rgba(255, 255, 255, 0.72)";
  const glassSubCardBg = darkMode
    ? "rgba(11, 16, 32, 0.58)"
    : "rgba(253, 251, 247, 0.65)";
  const textPrimary = darkMode ? "#f8fafc" : "#222222";
  const textMuted = darkMode ? "#cbd5e1" : "#57534e";
  const borderColor = darkMode
    ? "rgba(148, 163, 184, 0.22)"
    : "rgba(34, 34, 34, 0.14)";
  const accentBlue = "#2563eb";

  const cardStyle = {
    backgroundColor: glassCardBg,
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: `1px solid ${borderColor}`,
    borderRadius: "12px",
    boxSizing: "border-box" as const,
  };

  const subPanelStyle = {
    backgroundColor: glassSubCardBg,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: `1px solid ${borderColor}`,
    borderRadius: "10px",
    boxSizing: "border-box" as const,
  };

  const inputStyle = {
    width: "100%",
    padding: "0.65rem 0.8rem",
    borderRadius: "8px",
    border: `1px solid ${borderColor}`,
    backgroundColor: glassSubCardBg,
    color: textPrimary,
    fontSize: "0.9rem",
    boxSizing: "border-box" as const,
  };

  const renderCollapsibleComplaint = (booking: BookingWithSummary) => {
    const summaryText = booking.complaint_summary || "Shared prior to call.";
    const isLong = summaryText.length > 90;
    const isExpanded = Boolean(expandedComplaints[booking.id]);
    const shownText =
      !isLong || isExpanded
        ? summaryText
        : `${summaryText.slice(0, 90).trim()}...`;
    const attachedImgs = booking.complaint_images?.length
      ? booking.complaint_images
      : bookingAttachmentsMap[booking.id] || [];

    return (
      <div
        style={{
          ...subPanelStyle,
          position: "relative",
          zIndex: 1,
          width: "100%",
          padding: "0.75rem 0.85rem",
          borderRadius: "8px",
          fontSize: "0.85rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "0.65rem",
            width: "100%",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflowWrap: "anywhere",
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: textMuted, fontSize: "0.76rem" }}>
              COMPLAINT SUMMARY:{" "}
            </strong>
            <span>{shownText}</span>
          </div>

          {isLong && (
            <button
              type="button"
              aria-label={
                isExpanded
                  ? "Pull complaint text up"
                  : "Drop complaint text down"
              }
              title={isExpanded ? "Pull text up" : "Drop text down"}
              onClick={() => toggleComplaintExpand(booking.id)}
              style={{
                background: glassCardBg,
                border: `1px solid ${borderColor}`,
                borderRadius: "6px",
                color: textPrimary,
                padding: "0.2rem 0.55rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                lineHeight: 1.2,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {isExpanded ? "▴" : "▾"}
            </button>
          )}
        </div>

        {isLong && isExpanded && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => toggleComplaintExpand(booking.id)}
              style={{
                background: "none",
                border: "none",
                color: accentBlue,
                padding: 0,
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ▴ Pull text up
            </button>
          </div>
        )}

        {attachedImgs.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginTop: "0.15rem",
            }}
          >
            {attachedImgs.map((src, idx) => (
              <img
                key={`${booking.id}-img-${idx}`}
                src={src}
                alt={`Complaint attachment ${idx + 1}`}
                style={{
                  width: "68px",
                  height: "68px",
                  objectFit: "cover",
                  borderRadius: "6px",
                  border: `1px solid ${borderColor}`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSavedCallNotesSection = (booking: BookingWithSummary) => {
    const noteText = callNotesMap[booking.id] || "";
    const isExpanded = Boolean(expandedHistoryNotes[booking.id]);

    return (
      <div
        style={{
          ...subPanelStyle,
          position: "relative",
          zIndex: 1,
          width: "100%",
          padding: "0.75rem 0.9rem",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <strong style={{ fontSize: "0.78rem", color: textMuted }}>
            CALL SESSION NOTES {noteText.trim() ? "(SAVED)" : ""}
          </strong>
          <button
            type="button"
            onClick={() => toggleHistoryNoteExpand(booking.id)}
            style={{
              background: "none",
              border: `1px solid ${borderColor}`,
              borderRadius: "6px",
              color: textPrimary,
              padding: "0.2rem 0.55rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isExpanded
              ? "▴ Hide Notes"
              : noteText.trim()
              ? "▾ View / Edit Notes"
              : "+ Add Notes"}
          </button>
        </div>

        {!isExpanded && noteText.trim() && (
          <p
            style={{
              margin: 0,
              fontSize: "0.84rem",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {noteText}
          </p>
        )}

        {isExpanded && (
          <textarea
            rows={3}
            placeholder="Write key takeaways from this call—saved automatically for later review..."
            value={noteText}
            onChange={(e) => updateCallNote(booking.id, e.target.value)}
            style={{ ...inputStyle, resize: "vertical", fontSize: "0.84rem" }}
          />
        )}
      </div>
    );
  };

  const filteredConsultants = availableConsultants.filter(
    (c) =>
      c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.specialty.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingIncomingRequests = bookings.filter(
    (b) =>
      b.status !== "Completed" &&
      b.status !== "In Progress" &&
      !acceptedCallIds.includes(b.id)
  );
  const totalSessions = bookings.length;
  const upcomingSessions = bookings.filter(
    (b) => b.status === "Upcoming" || b.status === "In Progress"
  ).length;
  const completedSessions = bookings.filter(
    (b) => b.status === "Completed"
  ).length;

  const paginatedBookings = bookings.slice(
    (callHistoryPage - 1) * CALLS_PER_PAGE,
    callHistoryPage * CALLS_PER_PAGE
  );

  return (
    <div
      style={{
        minHeight: "calc(100vh - 58px)",
        backgroundColor: bgMain,
        backgroundImage: resolvedBackgroundImage,
        backgroundSize: isCustomImageWallpaper ? "cover" : "auto",
        backgroundPosition: "center",
        backgroundRepeat: isCustomImageWallpaper ? "no-repeat" : "repeat",
        backgroundAttachment: "fixed",
        color: textPrimary,
        boxSizing: "border-box",
      }}
    >
      {/* Pop-Up Modal When Consultant Requests Audio/Video Mode Switch */}
      {modeSwitchRequest && !isConsultant && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Call Mode Switch Request"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.65)",
            backdropFilter: "blur(6px)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              ...cardStyle,
              width: "100%",
              maxWidth: "390px",
              padding: "1.35rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
              boxShadow: "0 22px 50px rgba(0, 0, 0, 0.35)",
            }}
          >
            <span
              style={{
                fontSize: "0.74rem",
                fontWeight: 700,
                color: "#3b82f6",
                textTransform: "uppercase",
              }}
            >
              Call Mode Switch Request
            </span>
            <h3 style={{ margin: 0, fontSize: "1.12rem" }}>
              Switch to{" "}
              {modeSwitchRequest.targetMode === "video"
                ? "Video Call"
                : "Audio Call"}
              ?
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.86rem",
                color: textMuted,
                lineHeight: 1.5,
              }}
            >
              Your consultant requested switching room{" "}
              <strong>{modeSwitchRequest.roomCode}</strong> to{" "}
              <strong>{modeSwitchRequest.targetMode.toUpperCase()}</strong>{" "}
              mode.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.65rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setModeSwitchRequest(null)}
                style={{
                  padding: "0.55rem 0.9rem",
                  borderRadius: "8px",
                  border: `1px solid ${borderColor}`,
                  backgroundColor: "transparent",
                  color: textPrimary,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Keep {activeCallMode === "video" ? "Video" : "Audio"}
              </button>
              <button
                type="button"
                onClick={handleAcceptModeSwitchPopUp}
                style={{
                  padding: "0.55rem 1rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: accentBlue,
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Switch to{" "}
                {modeSwitchRequest.targetMode === "video" ? "Video" : "Audio"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main
        style={{
          marginLeft: isDesktop ? "230px" : "0",
          padding: isDesktop ? "1.5rem 1.75rem" : "1.25rem 1rem",
          boxSizing: "border-box",
          minHeight: "calc(100vh - 58px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "1040px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.3rem",
            flex: 1,
            boxSizing: "border-box",
          }}
        >
          {feedback && (
            <div
              style={{
                padding: "0.85rem 1rem",
                borderRadius: "10px",
                fontSize: "0.9rem",
                fontWeight: 500,
                backgroundColor:
                  feedback.type === "success"
                    ? "rgba(220, 252, 231, 0.92)"
                    : "rgba(254, 226, 226, 0.92)",
                color: feedback.type === "success" ? "#166534" : "#991b1b",
                backdropFilter: "blur(8px)",
                boxSizing: "border-box",
              }}
            >
              {feedback.text}
            </div>
          )}

          {/* PERSISTENT AUDIO & VIDEO CALL STAGE + TWO-WAY SHARED TYPING BOARD */}
          {liveCallBooking && (
            <div
              style={{
                ...cardStyle,
                border: "2px solid #16a34a",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.9rem",
              }}
            >
              <audio ref={remoteAudioRef} autoPlay playsInline />

              {audioBlockedNotice && (
                <div
                  style={{
                    padding: "0.65rem 0.9rem",
                    borderRadius: "8px",
                    backgroundColor: "#fef3c7",
                    color: "#92400e",
                    fontSize: "0.84rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    Call auto-accepted! Tap to enable live audio/video playback
                    on this browser.
                  </span>
                  <button
                    type="button"
                    onClick={handleUnlockMediaPlayback}
                    style={{
                      padding: "0.4rem 0.85rem",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: "#d97706",
                      color: "#ffffff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Enable Call Audio
                  </button>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#16a34a",
                    }}
                  >
                    ● LIVE {activeCallMode.toUpperCase()} CALL · ROOM{" "}
                    {liveCallBooking.call_room_code || "LIVE-ROOM"} ·{" "}
                    {formatTimer(liveSeconds)} ·{" "}
                    {remoteConnected
                      ? "Peer Connected"
                      : callStatus === "connecting"
                      ? "Connecting Media & Peer..."
                      : callStatus.toUpperCase()}
                  </span>
                  <h2 style={{ margin: "0.2rem 0 0", fontSize: "1.15rem" }}>
                    {liveCallBooking.topic} — {liveCallBooking.consultant_name}
                  </h2>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "0.45rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectCallModeInLiveCall("video")}
                    style={{
                      padding: "0.35rem 0.7rem",
                      borderRadius: "6px",
                      border: `1px solid ${borderColor}`,
                      backgroundColor:
                        activeCallMode === "video" ? accentBlue : "transparent",
                      color:
                        activeCallMode === "video" ? "#ffffff" : textPrimary,
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Video
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectCallModeInLiveCall("audio")}
                    style={{
                      padding: "0.35rem 0.7rem",
                      borderRadius: "6px",
                      border: `1px solid ${borderColor}`,
                      backgroundColor:
                        activeCallMode === "audio" ? accentBlue : "transparent",
                      color:
                        activeCallMode === "audio" ? "#ffffff" : textPrimary,
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTeachingInput((prev) => !prev)}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: "6px",
                      border: `1px solid ${accentBlue}`,
                      backgroundColor: showTeachingInput
                        ? accentBlue
                        : "transparent",
                      color: showTeachingInput ? "#ffffff" : textPrimary,
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {showTeachingInput ? "Hide Shared Board" : "Shared Board"}
                  </button>
                </div>
              </div>

              {activeCallMode === "video" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      borderRadius: "10px",
                      overflow: "hidden",
                      backgroundColor: "rgba(2, 6, 23, 0.85)",
                      minHeight: "195px",
                      border: `1px solid ${borderColor}`,
                    }}
                  >
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      style={{
                        width: "100%",
                        height: "195px",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        bottom: "0.45rem",
                        left: "0.55rem",
                        fontSize: "0.74rem",
                        fontWeight: 600,
                        backgroundColor: "rgba(15, 23, 42, 0.78)",
                        color: "#ffffff",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "6px",
                      }}
                    >
                      {remoteConnected
                        ? "Remote Video"
                        : "Waiting for Remote Video..."}
                    </span>
                  </div>

                  <div
                    style={{
                      position: "relative",
                      borderRadius: "10px",
                      overflow: "hidden",
                      backgroundColor: "rgba(15, 23, 42, 0.85)",
                      minHeight: "195px",
                      border: `1px solid ${borderColor}`,
                    }}
                  >
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "195px",
                        objectFit: "cover",
                        display: isCameraOff ? "none" : "block",
                      }}
                    />
                    {isCameraOff && (
                      <div
                        style={{
                          height: "195px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: textMuted,
                          fontSize: "0.85rem",
                        }}
                      >
                        Camera Off
                      </div>
                    )}
                    <span
                      style={{
                        position: "absolute",
                        bottom: "0.45rem",
                        left: "0.55rem",
                        fontSize: "0.74rem",
                        fontWeight: 600,
                        backgroundColor: "rgba(15, 23, 42, 0.78)",
                        color: "#ffffff",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "6px",
                      }}
                    >
                      You ({isCameraOff ? "Camera Off" : "Camera On"})
                    </span>
                  </div>
                </div>
              )}

              {/* TWO-WAY SHARED LIVE TYPING BOARD */}
              {showTeachingInput && (
                <div
                  style={{
                    ...subPanelStyle,
                    padding: "0.85rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <label
                      htmlFor={`teaching-input-${liveCallBooking.id}`}
                      style={{ fontSize: "0.84rem", fontWeight: 700 }}
                    >
                      Shared Live Typing Board (Both Can Type &amp; View)
                    </label>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: roomSubscribed ? "#22c55e" : textMuted,
                        fontWeight: 600,
                      }}
                    >
                      {roomSubscribed
                        ? "Live 2-Way Sync · Auto-saved"
                        : "Connecting Live Board..."}
                    </span>
                  </div>

                  <textarea
                    id={`teaching-input-${liveCallBooking.id}`}
                    rows={5}
                    placeholder="Type documents, drafts, formulas, or notes here—both consultant and consultee see updates live and can type back..."
                    value={teachingText}
                    onChange={(e) => handleTeachingTextChange(e.target.value)}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>
              )}

              {mediaError && (
                <div
                  style={{
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    backgroundColor: "rgba(254, 226, 226, 0.92)",
                    color: "#991b1b",
                    fontSize: "0.85rem",
                  }}
                >
                  {mediaError}
                </div>
              )}

              {renderCollapsibleComplaint(liveCallBooking)}

              <div
                style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  onClick={toggleMute}
                  style={{
                    padding: "0.6rem 1rem",
                    borderRadius: "8px",
                    border: `1px solid ${borderColor}`,
                    backgroundColor: isMuted ? "#fee2e2" : "transparent",
                    color: isMuted ? "#991b1b" : textPrimary,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {isMuted ? "Unmute Mic" : "Mute Mic"}
                </button>

                {activeCallMode === "video" && (
                  <button
                    type="button"
                    onClick={toggleCamera}
                    style={{
                      padding: "0.6rem 1rem",
                      borderRadius: "8px",
                      border: `1px solid ${borderColor}`,
                      backgroundColor: isCameraOff ? "#fef3c7" : "transparent",
                      color: isCameraOff ? "#92400e" : textPrimary,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
                  </button>
                )}

                {liveCallBooking.status !== "Completed" && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      handleEndCallForBothEnds(liveCallBooking, {
                        completeAndPay: true,
                      })
                    }
                    style={{
                      padding: "0.6rem 1rem",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: "#16a34a",
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {submitting
                      ? "Releasing Payment..."
                      : "End Call & Auto-Release Payment"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleEndCallForBothEnds(liveCallBooking)}
                  style={{
                    padding: "0.6rem 1rem",
                    borderRadius: "8px",
                    border: `1px solid ${borderColor}`,
                    backgroundColor: "transparent",
                    color: textPrimary,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  End Call
                </button>
              </div>
            </div>
          )}

          {/* 1. DASHBOARD OVERVIEW */}
          {activeNav === "overview" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.3rem",
              }}
            >
              <div
                style={{
                  ...cardStyle,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.85rem",
                  padding: "1.15rem 1.35rem",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: isConsultant ? "#22c55e" : "#3b82f6",
                      textTransform: "uppercase",
                    }}
                  >
                    {isConsultant
                      ? "FIND AN EXPERT · CONSULTANT CONSOLE"
                      : "FIND AN EXPERT · CONSULTEE DESK"}
                  </span>
                  <h1 style={{ margin: "0.2rem 0 0", fontSize: "1.4rem" }}>
                    {isConsultant
                      ? `Live Call Desk, ${displayName.split(" ")[0]}!`
                      : `Your Next Breakthrough Starts Now, ${
                          displayName.split(" ")[0]
                        }!`}
                  </h1>
                  <p
                    style={{
                      margin: "0.25rem 0 0",
                      fontSize: "0.86rem",
                      color: textMuted,
                    }}
                  >
                    {displayEmail} · Role:{" "}
                    <strong>{isConsultant ? "Consultant" : "Consultee"}</strong>
                    {activePhone
                      ? ` · ${activePhone} (${
                          isPhoneVerified ? "SMS Verified" : "Unverified"
                        })`
                      : ""}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onChangeNav(isConsultant ? "bookings" : "consultants")
                  }
                  style={{
                    padding: "0.6rem 1rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: accentBlue,
                    color: "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {isConsultant
                    ? `Incoming Calls (${pendingIncomingRequests.length})`
                    : "Book a Call"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "1rem",
                }}
              >
                <div style={{ ...cardStyle, padding: "1rem" }}>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: textMuted,
                    }}
                  >
                    {isConsultant ? "INCOMING CALLS" : "AVAILABLE EXPERTS"}
                  </div>
                  <div
                    style={{
                      fontSize: "1.55rem",
                      fontWeight: 700,
                      marginTop: "0.35rem",
                    }}
                  >
                    {isConsultant
                      ? pendingIncomingRequests.length
                      : availableConsultants.length}
                  </div>
                </div>

                <div style={{ ...cardStyle, padding: "1rem" }}>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: textMuted,
                    }}
                  >
                    TOTAL CALLS
                  </div>
                  <div
                    style={{
                      fontSize: "1.55rem",
                      fontWeight: 700,
                      marginTop: "0.35rem",
                    }}
                  >
                    {totalSessions}
                  </div>
                </div>

                <div style={{ ...cardStyle, padding: "1rem" }}>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: textMuted,
                    }}
                  >
                    ACTIVE / COMPLETED
                  </div>
                  <div
                    style={{
                      fontSize: "1.55rem",
                      fontWeight: 700,
                      marginTop: "0.35rem",
                    }}
                  >
                    {upcomingSessions} / {completedSessions}
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, padding: "1.25rem" }}>
                <h2 style={{ margin: "0 0 0.85rem", fontSize: "1.1rem" }}>
                  {isConsultant
                    ? "Recent Call Requests"
                    : "Recent Account Activity"}
                </h2>
                {bookings.length === 0 ? (
                  <p style={{ color: textMuted, margin: 0 }}>
                    {isConsultant
                      ? "No incoming call requests right now."
                      : "No calls booked yet. Open Consultants & Call Queue to book your first session."}
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {bookings.slice(0, 5).map((b) => {
                      const isAccepted =
                        acceptedCallIds.includes(b.id) ||
                        b.status === "In Progress";
                      return (
                        <div
                          key={b.id}
                          style={{
                            ...subPanelStyle,
                            padding: "0.85rem 1rem",
                            borderRadius: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "0.65rem",
                          }}
                        >
                          <div>
                            <strong>{b.topic}</strong> with{" "}
                            <strong>{b.consultant_name}</strong> (
                            {b.session_date})
                          </div>

                          <span
                            style={{
                              padding: "0.22rem 0.6rem",
                              borderRadius: "999px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor:
                                b.status === "Completed"
                                  ? "#dcfce7"
                                  : "#dbeafe",
                              color:
                                b.status === "Completed"
                                  ? "#166534"
                                  : "#1e40af",
                            }}
                          >
                            {b.status === "Completed"
                              ? "Completed"
                              : isAccepted
                              ? "Live Call Held"
                              : b.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. CONSULTANTS & CALL QUEUE */}
          {activeNav === "consultants" && !isConsultant && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.3rem",
              }}
            >
              <div style={{ ...cardStyle, padding: "1.25rem" }}>
                <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.12rem" }}>
                  Book a Call
                </h2>
                <p
                  style={{
                    margin: "0 0 1rem",
                    fontSize: "0.85rem",
                    color: textMuted,
                  }}
                >
                  Choose a video or audio call, share your complaint summary,
                  and upload up to 3 reference images before booking.
                </p>

                {availableConsultants.length === 0 ? (
                  <p style={{ color: textMuted, margin: 0 }}>
                    No available registered consultants found right now.
                  </p>
                ) : (
                  <form
                    onSubmit={handleBookCall}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.9rem",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(190px, 1fr))",
                        gap: "0.85rem",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            marginBottom: "0.3rem",
                          }}
                        >
                          Available Consultant
                        </label>
                        <select
                          value={selectedConsultant?.id || ""}
                          onChange={(e) =>
                            setSelectedConsultantId(e.target.value)
                          }
                          style={inputStyle}
                        >
                          {availableConsultants.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.full_name} — {c.specialty} (₦
                              {c.rate_ngn.toLocaleString()})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            marginBottom: "0.3rem",
                          }}
                        >
                          Call Option
                        </label>
                        <select
                          value={bookingCallMode}
                          onChange={(e) =>
                            setBookingCallMode(e.target.value as CallMediaMode)
                          }
                          style={inputStyle}
                        >
                          <option value="video">
                            Video Call (Camera + Mic)
                          </option>
                          <option value="audio">Audio Call (Voice Only)</option>
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            marginBottom: "0.3rem",
                          }}
                        >
                          Call Topic
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Finance management"
                          value={bookingTopic}
                          onChange={(e) => setBookingTopic(e.target.value)}
                          style={inputStyle}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            marginBottom: "0.3rem",
                          }}
                        >
                          Call Date
                        </label>
                        <input
                          type="date"
                          value={bookingDate}
                          onChange={(e) => setBookingDate(e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          marginBottom: "0.3rem",
                        }}
                      >
                        Complaint Summary (Before Call Starts)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Summarize your complaint, timeline, and what you want resolved on the call..."
                        value={complaintSummary}
                        onChange={(e) => setComplaintSummary(e.target.value)}
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
                    </div>

                    <div
                      style={{
                        ...subPanelStyle,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.55rem",
                        padding: "0.75rem 0.9rem",
                        borderRadius: "8px",
                        borderStyle: "dashed",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                        }}
                      >
                        <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                          Attach Complaint Images ({complaintImages.length}/3)
                        </span>
                        <label
                          style={{
                            padding: "0.42rem 0.8rem",
                            borderRadius: "7px",
                            border: `1px solid ${accentBlue}`,
                            color: accentBlue,
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          + Upload Images
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleComplaintImagesSelect}
                            style={{ display: "none" }}
                          />
                        </label>
                      </div>

                      {complaintImages.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: "0.6rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {complaintImages.map((imgSrc, idx) => (
                            <div
                              key={`upload-preview-${idx}`}
                              style={{
                                position: "relative",
                                width: "74px",
                                height: "74px",
                              }}
                            >
                              <img
                                src={imgSrc}
                                alt={`Selected complaint preview ${idx + 1}`}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  borderRadius: "8px",
                                  border: `1px solid ${borderColor}`,
                                }}
                              />
                              <button
                                type="button"
                                aria-label="Remove image"
                                onClick={() => handleRemoveComplaintImage(idx)}
                                style={{
                                  position: "absolute",
                                  top: "-6px",
                                  right: "-6px",
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "9999px",
                                  border: "none",
                                  backgroundColor: "#ef4444",
                                  color: "#ffffff",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      style={{
                        alignSelf: "flex-start",
                        padding: "0.7rem 1.25rem",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: accentBlue,
                        color: "#ffffff",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {submitting
                        ? "Booking Call..."
                        : `Book ${
                            bookingCallMode === "video" ? "Video" : "Audio"
                          } Call (₦${(
                            selectedConsultant?.rate_ngn ?? 0
                          ).toLocaleString()})`}
                    </button>
                  </form>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                <input
                  type="text"
                  placeholder="Search available consultants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ ...inputStyle, maxWidth: "420px" }}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "1rem",
                  }}
                >
                  {filteredConsultants.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        ...cardStyle,
                        border: `1px solid ${
                          selectedConsultant?.id === c.id
                            ? accentBlue
                            : borderColor
                        }`,
                        padding: "1.15rem",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: "0.8rem",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <strong style={{ fontSize: "1.02rem" }}>
                            {c.full_name}
                          </strong>
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.18rem 0.5rem",
                              borderRadius: "999px",
                              backgroundColor: "#dcfce7",
                              color: "#166534",
                            }}
                          >
                            Available
                          </span>
                        </div>
                        <p
                          style={{
                            margin: "0.35rem 0",
                            fontSize: "0.85rem",
                            color: textMuted,
                          }}
                        >
                          {c.specialty}
                        </p>
                        <div style={{ fontWeight: 700, color: "#3b82f6" }}>
                          ₦{c.rate_ngn.toLocaleString()} / call
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedConsultantId(c.id)}
                        style={{
                          padding: "0.55rem 0.85rem",
                          borderRadius: "8px",
                          border: "none",
                          backgroundColor:
                            selectedConsultant?.id === c.id
                              ? "#16a34a"
                              : accentBlue,
                          color: "#ffffff",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {selectedConsultant?.id === c.id
                          ? "Selected"
                          : "Select Consultant"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeNav === "consultants" && isConsultant && (
            <div style={{ ...cardStyle, padding: "1.25rem" }}>
              <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.12rem" }}>
                Incoming Call Queue
              </h2>
              <p
                style={{
                  margin: "0 0 1rem",
                  fontSize: "0.85rem",
                  color: textMuted,
                }}
              >
                Start a call via Video or Audio and the consultee connects
                automatically.
              </p>

              {pendingIncomingRequests.length === 0 ? (
                <p style={{ color: textMuted, margin: 0 }}>
                  No pending calls waiting for acceptance.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                  }}
                >
                  {pendingIncomingRequests.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        ...subPanelStyle,
                        padding: "1rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "0.6rem",
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: "1rem" }}>
                            {b.topic}
                          </strong>
                          <div
                            style={{ fontSize: "0.82rem", color: textMuted }}
                          >
                            Date: {b.session_date} · Fee: ₦
                            {Number(b.amount_ngn).toLocaleString()}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "0.45rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleAcceptAndStartLiveCall(b, "video")
                            }
                            style={{
                              padding: "0.5rem 0.9rem",
                              borderRadius: "8px",
                              border: "none",
                              backgroundColor: "#16a34a",
                              color: "#ffffff",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Start Video Call
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAcceptAndStartLiveCall(b, "audio")
                            }
                            style={{
                              padding: "0.5rem 0.9rem",
                              borderRadius: "8px",
                              border: `1px solid ${accentBlue}`,
                              backgroundColor: glassSubCardBg,
                              color: "#3b82f6",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Start Audio Call
                          </button>
                        </div>
                      </div>

                      {renderCollapsibleComplaint(b)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. CALLS & ESCROW (Includes Saved Notes + Pagination) */}
          {activeNav === "bookings" && (
            <div style={{ ...cardStyle, padding: "1.25rem" }}>
              <h2 style={{ margin: "0 0 1rem", fontSize: "1.12rem" }}>
                Calls &amp; Escrow History
              </h2>
              {bookings.length === 0 ? (
                <p style={{ color: textMuted, margin: 0 }}>
                  No calls or escrow payments yet.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.85rem",
                    }}
                  >
                    {paginatedBookings.map((b) => {
                      const isAccepted =
                        acceptedCallIds.includes(b.id) ||
                        b.status === "In Progress";
                      return (
                        <div
                          key={b.id}
                          style={{
                            ...subPanelStyle,
                            padding: "1rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.6rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: "0.6rem",
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: "1rem" }}>
                                {b.topic}
                              </strong>
                              <div
                                style={{
                                  fontSize: "0.82rem",
                                  color: textMuted,
                                }}
                              >
                                {b.consultant_name} · {b.session_date} ·
                                Payment: ₦
                                {Number(b.amount_ngn).toLocaleString()}
                                {b.call_room_code
                                  ? ` · Room: ${b.call_room_code}`
                                  : ""}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                flexWrap: "wrap",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  padding: "0.24rem 0.65rem",
                                  borderRadius: "999px",
                                  fontSize: "0.76rem",
                                  fontWeight: 600,
                                  backgroundColor:
                                    b.status === "Completed"
                                      ? "#dcfce7"
                                      : "#dbeafe",
                                  color:
                                    b.status === "Completed"
                                      ? "#166534"
                                      : "#1e40af",
                                }}
                              >
                                {b.status === "Completed"
                                  ? "Completed · Paid Out"
                                  : isAccepted
                                  ? "Live Call Held"
                                  : "Paid in Escrow"}
                              </span>

                              {b.status !== "Completed" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAcceptAndStartLiveCall(b, "video")
                                    }
                                    style={{
                                      padding: "0.42rem 0.78rem",
                                      borderRadius: "7px",
                                      border: "none",
                                      backgroundColor: accentBlue,
                                      color: "#ffffff",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Video Call
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAcceptAndStartLiveCall(b, "audio")
                                    }
                                    style={{
                                      padding: "0.42rem 0.78rem",
                                      borderRadius: "7px",
                                      border: `1px solid ${accentBlue}`,
                                      backgroundColor: glassSubCardBg,
                                      color: "#3b82f6",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Audio Call
                                  </button>
                                </>
                              )}

                              {b.status !== "Completed" && (
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() =>
                                    handleCompleteSessionAndAutoPay(b)
                                  }
                                  style={{
                                    padding: "0.42rem 0.85rem",
                                    borderRadius: "7px",
                                    border: "none",
                                    backgroundColor: "#16a34a",
                                    color: "#ffffff",
                                    fontSize: "0.8rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Complete Session (Auto-Pay)
                                </button>
                              )}
                            </div>
                          </div>

                          {renderCollapsibleComplaint(b)}
                          {renderSavedCallNotesSection(b)}
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Underneath Call History */}
                  <div
                    style={{
                      marginTop: "1.15rem",
                      paddingTop: "0.85rem",
                      borderTop: `1px solid ${borderColor}`,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.65rem",
                    }}
                  >
                    <span style={{ fontSize: "0.82rem", color: textMuted }}>
                      Page <strong>{callHistoryPage}</strong> of{" "}
                      <strong>{totalCallPages}</strong> ({bookings.length}{" "}
                      total)
                    </span>

                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        alignItems: "center",
                      }}
                    >
                      <button
                        type="button"
                        disabled={callHistoryPage <= 1}
                        onClick={() =>
                          setCallHistoryPage((p) => Math.max(1, p - 1))
                        }
                        style={{
                          padding: "0.38rem 0.75rem",
                          borderRadius: "7px",
                          border: `1px solid ${borderColor}`,
                          backgroundColor: glassSubCardBg,
                          color: textPrimary,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor:
                            callHistoryPage <= 1 ? "not-allowed" : "pointer",
                          opacity: callHistoryPage <= 1 ? 0.45 : 1,
                        }}
                      >
                        Previous
                      </button>

                      {Array.from(
                        { length: totalCallPages },
                        (_, idx) => idx + 1
                      ).map((pageNum) => (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCallHistoryPage(pageNum)}
                          style={{
                            padding: "0.38rem 0.65rem",
                            borderRadius: "7px",
                            border: `1px solid ${
                              callHistoryPage === pageNum
                                ? accentBlue
                                : borderColor
                            }`,
                            backgroundColor:
                              callHistoryPage === pageNum
                                ? accentBlue
                                : glassSubCardBg,
                            color:
                              callHistoryPage === pageNum
                                ? "#ffffff"
                                : textPrimary,
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {pageNum}
                        </button>
                      ))}

                      <button
                        type="button"
                        disabled={callHistoryPage >= totalCallPages}
                        onClick={() =>
                          setCallHistoryPage((p) =>
                            Math.min(totalCallPages, p + 1)
                          )
                        }
                        style={{
                          padding: "0.38rem 0.75rem",
                          borderRadius: "7px",
                          border: `1px solid ${borderColor}`,
                          backgroundColor: glassSubCardBg,
                          color: textPrimary,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor:
                            callHistoryPage >= totalCallPages
                              ? "not-allowed"
                              : "pointer",
                          opacity: callHistoryPage >= totalCallPages ? 0.45 : 1,
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 4. WALLET & PAYOUTS */}
          {activeNav === "wallet" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.3rem",
              }}
            >
              <div
                style={{
                  ...cardStyle,
                  padding: "1.35rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "1.5rem",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      color: textMuted,
                    }}
                  >
                    {isConsultant
                      ? "CONSULTANT PAYOUT BALANCE"
                      : "WALLET BALANCE"}
                  </div>
                  <div
                    style={{
                      fontSize: "2rem",
                      fontWeight: 800,
                      margin: "0.3rem 0",
                    }}
                  >
                    ₦{walletBalance.toLocaleString()}
                  </div>
                  <p
                    style={{ margin: 0, fontSize: "0.84rem", color: textMuted }}
                  >
                    {isConsultant
                      ? "Session payouts credit here automatically when sessions complete. Withdraw to your local bank account below."
                      : "Top up your wallet to book calls or withdraw funds to your local bank account."}
                  </p>
                </div>

                {!isConsultant ? (
                  <form
                    onSubmit={handleDeposit}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.7rem",
                    }}
                  >
                    <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      Top Up Amount (₦ NGN)
                    </label>
                    <input
                      type="number"
                      min={500}
                      step={500}
                      placeholder="e.g. 15000"
                      value={walletAmountInput}
                      onChange={(e) => setWalletAmountInput(e.target.value)}
                      style={inputStyle}
                    />
                    <div style={{ display: "flex", gap: "0.65rem" }}>
                      <button
                        type="submit"
                        disabled={submitting}
                        style={{
                          flex: 1,
                          padding: "0.65rem 1rem",
                          borderRadius: "8px",
                          border: "none",
                          backgroundColor: accentBlue,
                          color: "#ffffff",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        + Top Up Wallet
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleRemoveMoney}
                        style={{
                          flex: 1,
                          padding: "0.65rem 1rem",
                          borderRadius: "8px",
                          border: "1px solid #ef4444",
                          backgroundColor: glassSubCardBg,
                          color: "#ef4444",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        - Remove Money
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    style={{
                      ...subPanelStyle,
                      padding: "0.9rem 1rem",
                      borderRadius: "8px",
                      fontSize: "0.84rem",
                      color: textMuted,
                      alignSelf: "center",
                    }}
                  >
                    Wallet top-up is disabled for consultants. Use the{" "}
                    <strong>Withdraw to Local Bank Account</strong> form below
                    to cash out your earnings.
                  </div>
                )}
              </div>

              <div style={{ ...cardStyle, padding: "1.35rem" }}>
                <h2 style={{ margin: "0 0 0.85rem", fontSize: "1.08rem" }}>
                  Withdraw to Local Bank Account
                </h2>
                <form
                  onSubmit={handleBankWithdraw}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: "0.8rem",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Bank
                    </label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      style={inputStyle}
                    >
                      {NIGERIAN_BANKS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      10-Digit Account No.
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="0123456789"
                      value={accountNumber}
                      onChange={(e) =>
                        setAccountNumber(e.target.value.replace(/\D/g, ""))
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Account Name
                    </label>
                    <input
                      type="text"
                      placeholder="Account Holder"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Amount (₦ NGN)
                    </label>
                    <input
                      type="number"
                      min={1000}
                      step={500}
                      placeholder="e.g. 10000"
                      value={withdrawAmountInput}
                      onChange={(e) => setWithdrawAmountInput(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: "0.68rem 1rem",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: accentBlue,
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Withdraw
                  </button>
                </form>
              </div>

              <div style={{ ...cardStyle, padding: "1.25rem" }}>
                <h2 style={{ margin: "0 0 0.85rem", fontSize: "1.08rem" }}>
                  Wallet Transaction History
                </h2>
                {transactions.length === 0 ? (
                  <p style={{ color: textMuted, margin: 0 }}>
                    No wallet transactions recorded yet.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        style={{
                          ...subPanelStyle,
                          padding: "0.72rem 0.9rem",
                          borderRadius: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                            {tx.description}
                          </div>
                          <div
                            style={{ fontSize: "0.76rem", color: textMuted }}
                          >
                            {tx.type} ·{" "}
                            {new Date(tx.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div
                          style={{
                            fontWeight: 700,
                            color:
                              tx.direction === "credit" ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {tx.direction === "credit" ? "+" : "-"}₦
                          {Number(tx.amount_ngn).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...cardStyle, padding: "1.25rem" }}>
                <h2 style={{ margin: "0 0 0.85rem", fontSize: "1.08rem" }}>
                  Bank Withdrawal History
                </h2>
                {withdrawals.length === 0 ? (
                  <p style={{ color: textMuted, margin: 0 }}>
                    No bank withdrawals recorded yet.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    {withdrawals.map((wd) => (
                      <div
                        key={wd.id}
                        style={{
                          ...subPanelStyle,
                          padding: "0.72rem 0.9rem",
                          borderRadius: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                            {wd.bank_name} · {wd.account_number} (
                            {wd.account_name})
                          </div>
                          <div
                            style={{ fontSize: "0.76rem", color: textMuted }}
                          >
                            Status: {wd.status} ·{" "}
                            {new Date(wd.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: "#ef4444" }}>
                          -₦{Number(wd.amount_ngn).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. PROFILE SETTINGS */}
          {activeNav === "profile" && (
            <div
              style={{
                ...cardStyle,
                padding: "1.35rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
                Profile Settings
              </h2>

              <div
                style={{
                  ...subPanelStyle,
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                  padding: "0.9rem 1rem",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "9999px",
                    overflow: "hidden",
                    border: `2px solid ${accentBlue}`,
                    backgroundColor: accentBlue,
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    flexShrink: 0,
                  }}
                >
                  {activeAvatar ? (
                    <img
                      src={activeAvatar}
                      alt={displayName}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                  }}
                >
                  <strong style={{ fontSize: "0.95rem" }}>{displayName}</strong>
                  <span style={{ fontSize: "0.82rem", color: textMuted }}>
                    {displayEmail} · Role:{" "}
                    <strong>{isConsultant ? "Consultant" : "Consultee"}</strong>
                  </span>
                  <label
                    style={{
                      alignSelf: "flex-start",
                      padding: "0.45rem 0.85rem",
                      borderRadius: "8px",
                      backgroundColor: accentBlue,
                      color: "#ffffff",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      marginTop: "0.2rem",
                    }}
                  >
                    Choose Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
              </div>

              <form
                onSubmit={handleSaveProfile}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "0.9rem",
                  alignItems: "end",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      marginBottom: "0.3rem",
                    }}
                  >
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      marginBottom: "0.3rem",
                    }}
                  >
                    Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) =>
                      setEditRole(e.target.value as "client" | "consultant")
                    }
                    style={inputStyle}
                  >
                    <option value="client">Consultee (Client)</option>
                    <option value="consultant">Consultant</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      marginBottom: "0.3rem",
                    }}
                  >
                    Specialty
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Accounting, Finance, Strategy"
                    value={editSpecialty}
                    onChange={(e) => setEditSpecialty(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "0.68rem 1.1rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: accentBlue,
                    color: "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </form>

              {/* Dashboard Wallpaper Picker + Phone Image Upload */}
              <div
                style={{
                  ...subPanelStyle,
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <strong style={{ fontSize: "0.92rem" }}>
                    Dashboard Wallpaper (Account Synced)
                  </strong>
                  <label
                    style={{
                      padding: "0.45rem 0.85rem",
                      borderRadius: "8px",
                      backgroundColor: accentBlue,
                      color: "#ffffff",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    + Upload Image From Phone
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleWallpaperUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>

                <div
                  style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}
                >
                  {WALLPAPER_OPTIONS.map((wp) => {
                    const selected =
                      !isCustomImageWallpaper && wallpaper === wp.id;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() => syncWallpaperToAccount(wp.id)}
                        style={{
                          padding: "0.45rem 0.85rem",
                          borderRadius: "8px",
                          border: `1px solid ${
                            selected ? accentBlue : borderColor
                          }`,
                          backgroundColor: selected ? accentBlue : glassCardBg,
                          color: selected ? "#ffffff" : textPrimary,
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {wp.label}
                      </button>
                    );
                  })}
                </div>

                {isCustomImageWallpaper && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      paddingTop: "0.25rem",
                    }}
                  >
                    <img
                      src={wallpaper}
                      alt="Active custom wallpaper"
                      style={{
                        width: "72px",
                        height: "46px",
                        objectFit: "cover",
                        borderRadius: "6px",
                        border: `2px solid ${accentBlue}`,
                      }}
                    />
                    <span style={{ fontSize: "0.82rem", color: textMuted }}>
                      Custom wallpaper synced to account
                    </span>
                    <button
                      type="button"
                      onClick={() => syncWallpaperToAccount("default")}
                      style={{
                        padding: "0.35rem 0.7rem",
                        borderRadius: "7px",
                        border: "1px solid #ef4444",
                        backgroundColor: glassCardBg,
                        color: "#ef4444",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Remove Custom Wallpaper
                    </button>
                  </div>
                )}
              </div>

              <div
                style={{
                  ...subPanelStyle,
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <strong style={{ fontSize: "0.92rem" }}>
                    Phone Number &amp; Text Verification
                  </strong>
                  <span
                    style={{
                      padding: "0.2rem 0.6rem",
                      borderRadius: "999px",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      backgroundColor: isPhoneVerified ? "#dcfce7" : "#fef3c7",
                      color: isPhoneVerified ? "#166534" : "#92400e",
                    }}
                  >
                    {isPhoneVerified ? "Verified via Text" : "Not Verified"}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "0.65rem",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="tel"
                    placeholder="e.g. +2348012345678 or 08012345678"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      setPhoneVerified(false);
                    }}
                    style={{ ...inputStyle, maxWidth: "300px" }}
                  />
                  <button
                    type="button"
                    disabled={sendingSms}
                    onClick={handleSendSmsVerification}
                    style={{
                      padding: "0.65rem 1rem",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: accentBlue,
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {sendingSms ? "Sending Text..." : "Send Verification Text"}
                  </button>
                </div>

                {(smsSent || demoOtpCode) && !isPhoneVerified && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    {demoOtpCode && (
                      <div style={{ fontSize: "0.8rem", color: textMuted }}>
                        Text message code: <strong>{demoOtpCode}</strong>
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: "0.65rem",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="Enter 6-digit SMS code"
                        value={smsCodeInput}
                        onChange={(e) =>
                          setSmsCodeInput(e.target.value.replace(/\D/g, ""))
                        }
                        style={{ ...inputStyle, maxWidth: "210px" }}
                      />
                      <button
                        type="button"
                        disabled={verifyingSms}
                        onClick={handleVerifySmsCode}
                        style={{
                          padding: "0.65rem 1rem",
                          borderRadius: "8px",
                          border: "none",
                          backgroundColor: "#16a34a",
                          color: "#ffffff",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {verifyingSms ? "Verifying..." : "Verify Code"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  fontSize: "0.84rem",
                  color: textMuted,
                  borderTop: `1px solid ${borderColor}`,
                  paddingTop: "0.85rem",
                }}
              >
                Email: <strong>{displayEmail}</strong> · KYC Status:{" "}
                <strong style={{ textTransform: "capitalize" }}>
                  {displayKyc}
                </strong>
              </div>
            </div>
          )}

          <footer
            style={{
              marginTop: "auto",
              paddingTop: "1rem",
              borderTop: `1px solid ${borderColor}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
              fontSize: "0.8rem",
              color: textMuted,
            }}
          >
            <span>Find An Expert</span>
            <span>Escrow-Protected Advisory &amp; Live Audio/Video</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
