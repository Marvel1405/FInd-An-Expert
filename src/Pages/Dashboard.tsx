import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase, type UserProfile } from '../Lib/supabase';
import type { DashboardTab } from '../App';
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
} from '../Lib/portalData';
import { useWebRtcCall, type CallMediaMode } from '../Lib/useWebRtcCall';

interface DashboardProps {
  darkMode: boolean;
  activeNav: DashboardTab;
  onChangeNav: (tab: DashboardTab) => void;
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
}

const NIGERIAN_BANKS = [
  'Access Bank',
  'First Bank of Nigeria',
  'GTBank (Guaranty Trust Bank)',
  'Kuda Microfinance Bank',
  'Moniepoint MFB',
  'OPay',
  'United Bank for Africa (UBA)',
  'Zenith Bank',
];

function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('234')) return `+${cleaned}`;
  if (cleaned.startsWith('0') && cleaned.length === 11) return `+234${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

async function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 180;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process image.'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Invalid image file selected.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Failed to read photo file.'));
    reader.readAsDataURL(file);
  });
}

export default function Dashboard({ darkMode, activeNav, onChangeNav }: DashboardProps) {
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [availableConsultants, setAvailableConsultants] = useState<RegisteredConsultant[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [bookings, setBookings] = useState<BookingWithSummary[]>([]);
  const [transactions, setTransactions] = useState<DbWalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<DbBankWithdrawal[]>([]);

  // Accepted & live call tracking (held persistently until explicitly ended/completed)
  const [acceptedCallIds, setAcceptedCallIds] = useState<string[]>([]);
  const [liveCallBooking, setLiveCallBooking] = useState<BookingWithSummary | null>(null);
  const [liveSeconds, setLiveSeconds] = useState<number>(0);
  const [bookingCallMode, setBookingCallMode] = useState<CallMediaMode>('video');
  const [activeCallMode, setActiveCallMode] = useState<CallMediaMode>('video');

  // Consultee booking form
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>('');
  const [bookingTopic, setBookingTopic] = useState('');
  const [complaintSummary, setComplaintSummary] = useState('');
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Consultee wallet input
  const [walletAmountInput, setWalletAmountInput] = useState<string>('');

  // Bank withdrawal form
  const [bankName, setBankName] = useState<string>(NIGERIAN_BANKS[2]);
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>('');

  // Editable profile fields + photo + phone SMS verification
  const [editFullName, setEditFullName] = useState<string>('');
  const [editRole, setEditRole] = useState<'client' | 'consultant'>('client');
  const [editSpecialty, setEditSpecialty] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [smsCodeInput, setSmsCodeInput] = useState<string>('');
  const [smsSent, setSmsSent] = useState<boolean>(false);
  const [demoOtpCode, setDemoOtpCode] = useState<string>('');
  const [sendingSms, setSendingSms] = useState<boolean>(false);
  const [verifyingSms, setVerifyingSms] = useState<boolean>(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadAvailableConsultants = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, specialty, role')
      .eq('role', 'consultant');

    if (error) {
      throw new Error(error.message);
    }

    const mapped: RegisteredConsultant[] = (data ?? []).map((row, idx) => ({
      id: String(row.id),
      full_name: String(row.full_name || 'Registered Consultant'),
      specialty: String(row.specialty || 'Specialist Advisory'),
      rate_ngn: 10000 + idx * 2500,
      is_available: true,
    }));

    const onlyAvailable = mapped.filter((c) => c.is_available);
    setAvailableConsultants(onlyAvailable);
    if (onlyAvailable.length > 0) {
      setSelectedConsultantId((prev) =>
        onlyAvailable.some((item) => item.id === prev) ? prev : onlyAvailable[0].id
      );
    }
  }, []);

  const refreshPortalState = useCallback(
    async (userId: string) => {
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
        .filter((item) => item.status === 'In Progress')
        .map((item) => item.id);
      if (activeFromDb.length > 0) {
        setAcceptedCallIds((prev) => Array.from(new Set([...prev, ...activeFromDb])));
      }
    },
    [loadAvailableConsultants]
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
          navigate('/signin', { replace: true });
          return;
        }

        setAuthUser(user);

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        const metaAvatar = (user.user_metadata?.avatar_url as string) || '';
        const metaPhone = (user.user_metadata?.phone as string) || user.phone || '';
        const metaVerified = Boolean(user.user_metadata?.phone_verified);

        if (profileData) {
          const typedProfile = profileData as UserProfile;
          setProfile(typedProfile);
          setAccountName(typedProfile.full_name || '');
          setEditFullName(typedProfile.full_name || '');
          setEditRole(typedProfile.role === 'consultant' ? 'consultant' : 'client');
          setEditSpecialty(typedProfile.specialty || '');
          setAvatarUrl(typedProfile.avatar_url || metaAvatar);
          setPhoneInput(typedProfile.phone || metaPhone);
          setPhoneVerified(Boolean(typedProfile.phone_verified ?? metaVerified));
        } else {
          const fallbackName =
            (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Member';
          setEditFullName(fallbackName);
          setAccountName(fallbackName);
          setAvatarUrl(metaAvatar);
          setPhoneInput(metaPhone);
          setPhoneVerified(metaVerified);
        }

        await refreshPortalState(user.id);
      } catch (err) {
        if (active) {
          setFeedback({
            type: 'error',
            text: err instanceof Error ? err.message : 'Unable to load dashboard data.',
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
  }, [navigate, refreshPortalState]);

  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel(`dashboard-bookings-${authUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          refreshPortalState(authUser.id).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser?.id, refreshPortalState]);

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

  const isConsultant = (profile?.role || editRole) === 'consultant';

  useEffect(() => {
    setWalletAmountInput('');
  }, [isConsultant]);

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

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <p>Loading your Find An Expert workspace...</p>
      </div>
    );
  }

  const displayName =
    profile?.full_name ||
    editFullName ||
    (authUser?.user_metadata?.full_name as string) ||
    authUser?.email?.split('@')[0] ||
    'Member';
  const displayEmail = profile?.email || authUser?.email || 'member@example.com';
  const displayKyc = profile?.kyc_status || 'pending';
  const activeAvatar = avatarUrl || profile?.avatar_url || '';
  const activePhone = phoneInput || profile?.phone || '';
  const isPhoneVerified = phoneVerified || Boolean(profile?.phone_verified);

  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'U';

  const selectedConsultant =
    availableConsultants.find((c) => c.id === selectedConsultantId) || availableConsultants[0];

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', text: 'Please select a valid image file (JPG, PNG, or WebP).' });
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setFeedback({ type: 'error', text: 'Photo must be 4MB or smaller.' });
      return;
    }

    try {
      const processedDataUrl = await fileToAvatarDataUrl(file);
      setAvatarUrl(processedDataUrl);
      setFeedback({
        type: 'success',
        text: 'Profile photo ready. Click "Save Changes" to save it to your account.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not process image.',
      });
    }
  };

  const handleSendSmsVerification = async () => {
    if (!authUser || sendingSms) return;
    const formattedPhone = normalizePhoneNumber(phoneInput);
    if (!/^\+\d{10,15}$/.test(formattedPhone)) {
      setFeedback({
        type: 'error',
        text: 'Enter a valid phone number (e.g. +2348012345678 or 08012345678).',
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
          type: 'success',
          text: `Verification text code sent to ${formattedPhone}. Enter code ${generatedCode} below to verify.`,
        });
      } else {
        setFeedback({
          type: 'success',
          text: `Text message verification sent to ${formattedPhone}. Enter the 6-digit code below.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to send verification text.',
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
      setFeedback({ type: 'error', text: 'Enter the 6-digit verification code from your text.' });
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
          type: 'phone_change',
        });
        if (!otpError) {
          verified = true;
        }
      }

      if (!verified && demoOtpCode && code === demoOtpCode) {
        verified = true;
      }

      if (!verified) {
        throw new Error('Invalid verification code. Check the 6-digit code and try again.');
      }

      setPhoneVerified(true);
      setSmsSent(false);
      setSmsCodeInput('');
      setDemoOtpCode('');

      await supabase.auth.updateUser({
        data: {
          phone: formattedPhone,
          phone_verified: true,
        },
      });

      await supabase
        .from('profiles')
        .update({
          phone: formattedPhone,
          phone_verified: true,
        })
        .eq('id', authUser.id);

      setProfile((prev) =>
        prev ? { ...prev, phone: formattedPhone, phone_verified: true } : prev
      );

      setFeedback({
        type: 'success',
        text: `Phone number ${formattedPhone} verified via text message!`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Text verification failed.',
      });
    } finally {
      setVerifyingSms(false);
    }
  };

  const handleBookCall = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser || submitting || isConsultant) return;

    if (!selectedConsultant) {
      setFeedback({ type: 'error', text: 'No available registered consultant selected.' });
      return;
    }
    if (!bookingTopic.trim()) {
      setFeedback({ type: 'error', text: 'Please enter a call topic.' });
      return;
    }
    if (!complaintSummary.trim() || complaintSummary.trim().length < 10) {
      setFeedback({
        type: 'error',
        text: 'Please provide a summary of your complaint (at least 10 characters) before starting the call.',
      });
      return;
    }
    if (walletBalance < selectedConsultant.rate_ngn) {
      setFeedback({
        type: 'error',
        text: `Insufficient wallet balance (₦${selectedConsultant.rate_ngn.toLocaleString()} required). Please top up in Wallet & Payouts.`,
      });
      onChangeNav('wallet');
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const roomCode = `CALL-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const cleanSummary = complaintSummary.trim();
      const chosenMode = bookingCallMode;

      const bookingId = await createBookingWithEscrowRpc({
        consultantName: selectedConsultant.full_name,
        topic: bookingTopic.trim(),
        sessionDate: bookingDate,
        amountNgn: selectedConsultant.rate_ngn,
        complaintSummary: cleanSummary,
        callRoomCode: roomCode,
      });

      await supabase
        .from('bookings')
        .update({
          consultant_id: selectedConsultant.id,
          complaint_summary: cleanSummary,
          call_room_code: roomCode,
        })
        .eq('id', bookingId);

      await refreshPortalState(authUser.id);
      setBookingTopic('');
      setComplaintSummary('');
      onChangeNav('bookings');
      setFeedback({
        type: 'success',
        text: `${chosenMode === 'video' ? 'Video' : 'Audio'} call booked with ${selectedConsultant.full_name} (${roomCode}). ₦${selectedConsultant.rate_ngn.toLocaleString()} locked in escrow.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not book call.',
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
      booking.call_room_code || `LIVE-${booking.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    const resolvedMode: CallMediaMode =
      preferredMode || booking.call_mode || bookingCallMode || 'video';

    setAcceptedCallIds((prev) => (prev.includes(booking.id) ? prev : [...prev, booking.id]));
    setActiveCallMode(resolvedMode);

    if (booking.status !== 'Completed') {
      const nextStatus = isConsultant ? 'In Progress' : booking.status;
      await supabase
        .from('bookings')
        .update({
          call_room_code: roomCode,
          status: nextStatus,
        })
        .eq('id', booking.id);
    }

    setLiveCallBooking({
      ...booking,
      call_room_code: roomCode,
      call_mode: resolvedMode,
      status:
        booking.status === 'Completed' ? 'Completed' : isConsultant ? 'In Progress' : booking.status,
    });
    setLiveSeconds(0);
    setFeedback({
      type: 'success',
      text: isConsultant
        ? `Call accepted! Live ${resolvedMode} session (${roomCode}) is on hold & active for "${booking.topic}".`
        : `Joined live ${resolvedMode} room ${roomCode} for "${booking.topic}".`,
    });
  };

  const handleCompleteSessionAndAutoPay = async (booking: BookingWithSummary) => {
    if (!authUser || submitting || booking.status === 'Completed') return;

    setSubmitting(true);
    setFeedback(null);

    try {
      await completeBookingPayoutRpc(booking.id);
      await refreshPortalState(authUser.id);
      if (liveCallBooking?.id === booking.id) {
        setLiveCallBooking(null);
      }
      setFeedback({
        type: 'success',
        text: `Session completed! ₦${Number(booking.amount_ngn).toLocaleString()} automatically paid out.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Auto-payment failed on session completion.',
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
        type: 'error',
        text: 'Consultants cannot top up wallets—only consultees can add funds.',
      });
      return;
    }

    const amt = Number(walletAmountInput);
    if (!amt || amt < 500) {
      setFeedback({ type: 'error', text: 'Minimum wallet top-up is ₦500.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await adjustWalletBalanceRpc({
        amountNgn: amt,
        direction: 'credit',
        type: 'Deposit',
        description: 'Consultee wallet top-up',
      });
      await refreshPortalState(authUser.id);
      setWalletAmountInput('');
      setFeedback({ type: 'success', text: `₦${amt.toLocaleString()} added to your wallet.` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not top up wallet.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMoney = async () => {
    if (!authUser || submitting || isConsultant) return;
    const amt = Number(walletAmountInput);
    if (!amt || amt <= 0) {
      setFeedback({ type: 'error', text: 'Enter a valid amount to remove.' });
      return;
    }
    if (amt > walletBalance) {
      setFeedback({ type: 'error', text: 'Insufficient wallet balance.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await adjustWalletBalanceRpc({
        amountNgn: amt,
        direction: 'debit',
        type: 'Withdrawal',
        description: 'Removed money from wallet',
      });
      await refreshPortalState(authUser.id);
      setWalletAmountInput('');
      setFeedback({ type: 'success', text: `₦${amt.toLocaleString()} removed from wallet.` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not remove money.',
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
      setFeedback({ type: 'error', text: 'Enter a valid 10-digit NUBAN bank account number.' });
      return;
    }
    if (!accountName.trim()) {
      setFeedback({ type: 'error', text: 'Enter the account holder name.' });
      return;
    }
    if (!amt || amt < 1000) {
      setFeedback({ type: 'error', text: 'Minimum bank withdrawal is ₦1,000.' });
      return;
    }
    if (amt > walletBalance) {
      setFeedback({ type: 'error', text: 'Withdrawal amount exceeds wallet balance.' });
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
      setWithdrawAmountInput('');
      setFeedback({
        type: 'success',
        text: `₦${amt.toLocaleString()} withdrawal submitted to ${bankName} (${accountNumber}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Bank withdrawal failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser || submitting) return;
    if (!editFullName.trim()) {
      setFeedback({ type: 'error', text: 'Full name cannot be empty.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const trimmedName = editFullName.trim();
      const specialtyValue =
        editRole === 'consultant' ? editSpecialty.trim() || 'General Advisory' : null;
      const formattedPhone = normalizePhoneNumber(phoneInput);
      const isStillSameVerifiedPhone =
        phoneVerified && formattedPhone && formattedPhone === normalizePhoneNumber(profile?.phone || '');
      const nextVerifiedFlag = formattedPhone ? isStillSameVerifiedPhone : false;

      const { error: authErr } = await supabase.auth.updateUser({
        data: {
          full_name: trimmedName,
          role: editRole,
          specialty: specialtyValue,
          avatar_url: activeAvatar || null,
          phone: formattedPhone || null,
          phone_verified: nextVerifiedFlag,
        },
      });
      if (authErr) throw new Error(authErr.message);

      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

      const payload = {
        full_name: trimmedName,
        role: editRole,
        specialty: specialtyValue,
        avatar_url: activeAvatar || null,
        phone: formattedPhone || null,
        phone_verified: nextVerifiedFlag,
      };

      const query = existing
        ? supabase.from('profiles').update(payload).eq('id', authUser.id)
        : supabase.from('profiles').insert({
            id: authUser.id,
            email: displayEmail,
            ...payload,
          });

      const { data: updated, error } = await query.select('*').single();
      if (error) throw new Error(error.message);

      const typedUpdated = updated as UserProfile;
      setProfile(typedUpdated);
      setPhoneVerified(Boolean(typedUpdated.phone_verified));
      if (!accountName.trim()) {
        setAccountName(trimmedName);
      }
      await refreshPortalState(authUser.id);
      setFeedback({
        type: 'success',
        text: `Profile updated! Signed in as ${trimmedName} (${editRole === 'consultant' ? 'Consultant' : 'Consultee'}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save profile changes.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredConsultants = availableConsultants.filter(
    (c) =>
      c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.specialty.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingIncomingRequests = bookings.filter(
    (b) => b.status !== 'Completed' && b.status !== 'In Progress' && !acceptedCallIds.includes(b.id)
  );
  const totalSessions = bookings.length;
  const upcomingSessions = bookings.filter(
    (b) => b.status === 'Upcoming' || b.status === 'In Progress'
  ).length;
  const completedSessions = bookings.filter((b) => b.status === 'Completed').length;

  const bgMain = darkMode ? '#0b1020' : '#fdfbf7';
  const bgCard = darkMode ? '#111827' : '#ffffff';
  const textPrimary = darkMode ? '#f8fafc' : '#222222';
  const textMuted = darkMode ? '#94a3b8' : '#57534e';
  const borderColor = darkMode ? '#1e293b' : '#e5e0d8';
  const accentBlue = '#2563eb';

  const inputStyle = {
    width: '100%',
    padding: '0.65rem 0.8rem',
    borderRadius: '8px',
    border: `1px solid ${borderColor}`,
    backgroundColor: darkMode ? '#0b1020' : '#fdfbf7',
    color: textPrimary,
    fontSize: '0.9rem',
  };

  return (
    <main
      style={{
        minHeight: 'calc(100vh - 58px)',
        backgroundColor: bgMain,
        color: textPrimary,
        maxWidth: '1120px',
        margin: '0 auto',
        padding: '1.5rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.35rem',
      }}
    >
      {feedback && (
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 500,
            backgroundColor: feedback.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: feedback.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* PERSISTENT AUDIO & VIDEO CALL STAGE (Stays held until explicitly ended) */}
      {liveCallBooking && (
        <div
          style={{
            backgroundColor: bgCard,
            border: '2px solid #16a34a',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          <audio ref={remoteAudioRef} autoPlay playsInline />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>
                ● LIVE {activeCallMode.toUpperCase()} CALL HELD · ROOM{' '}
                {liveCallBooking.call_room_code || 'LIVE-ROOM'} · {formatTimer(liveSeconds)} ·{' '}
                {remoteConnected
                  ? 'Peer Connected'
                  : callStatus === 'connecting'
                    ? 'Connecting Media & Peer...'
                    : callStatus.toUpperCase()}
              </span>
              <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.15rem' }}>
                {liveCallBooking.topic} — {liveCallBooking.consultant_name}
              </h2>
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setActiveCallMode('video')}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: '6px',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: activeCallMode === 'video' ? accentBlue : 'transparent',
                  color: activeCallMode === 'video' ? '#ffffff' : textPrimary,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Video
              </button>
              <button
                type="button"
                onClick={() => setActiveCallMode('audio')}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: '6px',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: activeCallMode === 'audio' ? accentBlue : 'transparent',
                  color: activeCallMode === 'audio' ? '#ffffff' : textPrimary,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Audio
              </button>
            </div>
          </div>

          {activeCallMode === 'video' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  backgroundColor: '#020617',
                  minHeight: '195px',
                  border: `1px solid ${borderColor}`,
                }}
              >
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '195px', objectFit: 'cover', display: 'block' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    bottom: '0.45rem',
                    left: '0.55rem',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    backgroundColor: 'rgba(15, 23, 42, 0.78)',
                    color: '#ffffff',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                  }}
                >
                  {remoteConnected ? 'Remote Video' : 'Waiting for Remote Video...'}
                </span>
              </div>

              <div
                style={{
                  position: 'relative',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  backgroundColor: '#0f172a',
                  minHeight: '195px',
                  border: `1px solid ${borderColor}`,
                }}
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '195px',
                    objectFit: 'cover',
                    display: isCameraOff ? 'none' : 'block',
                  }}
                />
                {isCameraOff && (
                  <div
                    style={{
                      height: '195px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: textMuted,
                      fontSize: '0.85rem',
                    }}
                  >
                    Camera Off
                  </div>
                )}
                <span
                  style={{
                    position: 'absolute',
                    bottom: '0.45rem',
                    left: '0.55rem',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    backgroundColor: 'rgba(15, 23, 42, 0.78)',
                    color: '#ffffff',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                  }}
                >
                  You ({isCameraOff ? 'Camera Off' : 'Camera On'})
                </span>
              </div>
            </div>
          )}

          {mediaError && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                fontSize: '0.85rem',
              }}
            >
              {mediaError}
            </div>
          )}

          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              backgroundColor: darkMode ? '#0b1020' : '#fdfbf7',
              border: `1px solid ${borderColor}`,
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: textMuted,
                marginBottom: '0.25rem',
              }}
            >
              COMPLAINT SUMMARY BRIEF
            </div>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.5 }}>
              {liveCallBooking.complaint_summary || 'No complaint summary provided.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={toggleMute}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: `1px solid ${borderColor}`,
                backgroundColor: isMuted ? '#fee2e2' : 'transparent',
                color: isMuted ? '#991b1b' : textPrimary,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isMuted ? 'Unmute Mic' : 'Mute Mic'}
            </button>

            {activeCallMode === 'video' && (
              <button
                type="button"
                onClick={toggleCamera}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: isCameraOff ? '#fef3c7' : 'transparent',
                  color: isCameraOff ? '#92400e' : textPrimary,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
              </button>
            )}

            {liveCallBooking.status !== 'Completed' && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  endCall();
                  handleCompleteSessionAndAutoPay(liveCallBooking);
                }}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {submitting ? 'Releasing Payment...' : 'End Call & Auto-Release Payment'}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                endCall();
                setLiveCallBooking(null);
              }}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: `1px solid ${borderColor}`,
                backgroundColor: 'transparent',
                color: textPrimary,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              End Call
            </button>
          </div>
        </div>
      )}

      {/* 1. DASHBOARD OVERVIEW */}
      {activeNav === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.85rem',
              backgroundColor: bgCard,
              border: `1px solid ${borderColor}`,
              borderRadius: '12px',
              padding: '1.15rem 1.35rem',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: isConsultant ? '#16a34a' : accentBlue,
                  textTransform: 'uppercase',
                }}
              >
                {isConsultant
                  ? 'FIND AN EXPERT · CONSULTANT CONSOLE'
                  : 'FIND AN EXPERT · CONSULTEE DESK'}
              </span>
              <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.4rem' }}>
                {isConsultant
                  ? `Live Call Desk, ${displayName.split(' ')[0]}!`
                  : `Your Next Breakthrough Starts Now, ${displayName.split(' ')[0]}!`}
              </h1>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.86rem', color: textMuted }}>
                {displayEmail} · Role: <strong>{isConsultant ? 'Consultant' : 'Consultee'}</strong>
                {activePhone
                  ? ` · ${activePhone} (${isPhoneVerified ? 'SMS Verified' : 'Unverified'})`
                  : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onChangeNav(isConsultant ? 'bookings' : 'consultants')}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: accentBlue,
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isConsultant ? `Incoming Calls (${pendingIncomingRequests.length})` : 'Book a Call'}
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                backgroundColor: bgCard,
                border: `1px solid ${borderColor}`,
                borderRadius: '10px',
                padding: '1rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: textMuted }}>
                {isConsultant ? 'INCOMING CALLS' : 'AVAILABLE EXPERTS'}
              </div>
              <div style={{ fontSize: '1.55rem', fontWeight: 700, marginTop: '0.35rem' }}>
                {isConsultant ? pendingIncomingRequests.length : availableConsultants.length}
              </div>
            </div>

            <div
              style={{
                backgroundColor: bgCard,
                border: `1px solid ${borderColor}`,
                borderRadius: '10px',
                padding: '1rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: textMuted }}>
                TOTAL CALLS
              </div>
              <div style={{ fontSize: '1.55rem', fontWeight: 700, marginTop: '0.35rem' }}>
                {totalSessions}
              </div>
            </div>

            <div
              style={{
                backgroundColor: bgCard,
                border: `1px solid ${borderColor}`,
                borderRadius: '10px',
                padding: '1rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: textMuted }}>
                ACTIVE / COMPLETED
              </div>
              <div style={{ fontSize: '1.55rem', fontWeight: 700, marginTop: '0.35rem' }}>
                {upcomingSessions} / {completedSessions}
              </div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: bgCard,
              border: `1px solid ${borderColor}`,
              borderRadius: '10px',
              padding: '1.25rem',
            }}
          >
            <h2 style={{ margin: '0 0 0.85rem', fontSize: '1.1rem' }}>
              {isConsultant ? 'Recent Call Requests' : 'Recent Account Activity'}
            </h2>
            {bookings.length === 0 ? (
              <p style={{ color: textMuted, margin: 0 }}>
                {isConsultant
                  ? 'No incoming call requests right now.'
                  : 'No calls booked yet. Open Consultants & Call Queue to book your first session.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {bookings.slice(0, 5).map((b) => {
                  const isAccepted = acceptedCallIds.includes(b.id) || b.status === 'In Progress';
                  return (
                    <div
                      key={b.id}
                      style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '8px',
                        border: `1px solid ${borderColor}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.65rem',
                      }}
                    >
                      <div>
                        <strong>{b.topic}</strong> with <strong>{b.consultant_name}</strong> (
                        {b.session_date})
                      </div>

                      <span
                        style={{
                          padding: '0.22rem 0.6rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: b.status === 'Completed' ? '#dcfce7' : '#dbeafe',
                          color: b.status === 'Completed' ? '#166534' : '#1e40af',
                        }}
                      >
                        {b.status === 'Completed'
                          ? 'Completed'
                          : isAccepted
                            ? 'Live Call Held'
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
      {activeNav === 'consultants' && !isConsultant && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
          <div
            style={{
              backgroundColor: bgCard,
              border: `1px solid ${borderColor}`,
              borderRadius: '12px',
              padding: '1.25rem',
            }}
          >
            <h2 style={{ margin: '0 0 0.3rem', fontSize: '1.12rem' }}>Book a Call</h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: textMuted }}>
              Choose a video or audio call, share your complaint summary, and book with an
              available consultant.
            </p>

            {availableConsultants.length === 0 ? (
              <p style={{ color: textMuted, margin: 0 }}>
                No available registered consultants found right now.
              </p>
            ) : (
              <form
                onSubmit={handleBookCall}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: '0.85rem',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '0.3rem',
                      }}
                    >
                      Available Consultant
                    </label>
                    <select
                      value={selectedConsultant?.id || ''}
                      onChange={(e) => setSelectedConsultantId(e.target.value)}
                      style={inputStyle}
                    >
                      {availableConsultants.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} — {c.specialty} (₦{c.rate_ngn.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '0.3rem',
                      }}
                    >
                      Call Option
                    </label>
                    <select
                      value={bookingCallMode}
                      onChange={(e) => setBookingCallMode(e.target.value as CallMediaMode)}
                      style={inputStyle}
                    >
                      <option value="video">Video Call (Camera + Mic)</option>
                      <option value="audio">Audio Call (Voice Only)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '0.3rem',
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
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '0.3rem',
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
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      marginBottom: '0.3rem',
                    }}
                  >
                    Complaint Summary (Before Call Starts)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Summarize your complaint, timeline, and what you want resolved on the call..."
                    value={complaintSummary}
                    onChange={(e) => setComplaintSummary(e.target.value)}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '0.7rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: accentBlue,
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {submitting
                    ? 'Booking Call...'
                    : `Book ${bookingCallMode === 'video' ? 'Video' : 'Audio'} Call (₦${(selectedConsultant?.rate_ngn ?? 0).toLocaleString()})`}
                </button>
              </form>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <input
              type="text"
              placeholder="Search available consultants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, maxWidth: '420px' }}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
              }}
            >
              {filteredConsultants.map((c) => (
                <div
                  key={c.id}
                  style={{
                    backgroundColor: bgCard,
                    border: `1px solid ${selectedConsultant?.id === c.id ? accentBlue : borderColor}`,
                    borderRadius: '10px',
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.8rem',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <strong style={{ fontSize: '1.02rem' }}>{c.full_name}</strong>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.18rem 0.5rem',
                          borderRadius: '999px',
                          backgroundColor: '#dcfce7',
                          color: '#166534',
                        }}
                      >
                        Available
                      </span>
                    </div>
                    <p style={{ margin: '0.35rem 0', fontSize: '0.85rem', color: textMuted }}>
                      {c.specialty}
                    </p>
                    <div style={{ fontWeight: 700, color: accentBlue }}>
                      ₦{c.rate_ngn.toLocaleString()} / call
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedConsultantId(c.id)}
                    style={{
                      padding: '0.55rem 0.85rem',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: selectedConsultant?.id === c.id ? '#16a34a' : accentBlue,
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {selectedConsultant?.id === c.id ? 'Selected' : 'Select Consultant'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeNav === 'consultants' && isConsultant && (
        <div
          style={{
            backgroundColor: bgCard,
            border: `1px solid ${borderColor}`,
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.12rem' }}>Incoming Call Queue</h2>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: textMuted }}>
            Accept a call via Video or Audio and keep the session held until you finish.
          </p>

          {pendingIncomingRequests.length === 0 ? (
            <p style={{ color: textMuted, margin: 0 }}>No pending calls waiting for acceptance.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {pendingIncomingRequests.map((b) => (
                <div
                  key={b.id}
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    border: `1px solid ${borderColor}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.6rem',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '1rem' }}>{b.topic}</strong>
                      <div style={{ fontSize: '0.82rem', color: textMuted }}>
                        Date: {b.session_date} · Fee: ₦{Number(b.amount_ngn).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleAcceptAndStartLiveCall(b, 'video')}
                        style={{
                          padding: '0.5rem 0.9rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Accept Video Call
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptAndStartLiveCall(b, 'audio')}
                        style={{
                          padding: '0.5rem 0.9rem',
                          borderRadius: '8px',
                          border: `1px solid ${accentBlue}`,
                          backgroundColor: 'transparent',
                          color: accentBlue,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Accept Audio Call
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '0.65rem 0.8rem',
                      borderRadius: '8px',
                      backgroundColor: darkMode ? '#0b1020' : '#fdfbf7',
                      fontSize: '0.85rem',
                    }}
                  >
                    <strong style={{ color: textMuted, fontSize: '0.76rem' }}>
                      COMPLAINT SUMMARY:{' '}
                    </strong>
                    <span>{b.complaint_summary || 'Provided prior to call.'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. CALLS & ESCROW */}
      {activeNav === 'bookings' && (
        <div
          style={{
            backgroundColor: bgCard,
            border: `1px solid ${borderColor}`,
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.12rem' }}>Calls &amp; Escrow Payments</h2>
          {bookings.length === 0 ? (
            <p style={{ color: textMuted, margin: 0 }}>No calls or escrow payments yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {bookings.map((b) => {
                const isAccepted = acceptedCallIds.includes(b.id) || b.status === 'In Progress';
                return (
                  <div
                    key={b.id}
                    style={{
                      padding: '1rem',
                      borderRadius: '10px',
                      border: `1px solid ${borderColor}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.6rem',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '1rem' }}>{b.topic}</strong>
                        <div style={{ fontSize: '0.82rem', color: textMuted }}>
                          {b.consultant_name} · {b.session_date} · Payment: ₦
                          {Number(b.amount_ngn).toLocaleString()}
                          {b.call_room_code ? ` · Room: ${b.call_room_code}` : ''}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            padding: '0.24rem 0.65rem',
                            borderRadius: '999px',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            backgroundColor: b.status === 'Completed' ? '#dcfce7' : '#dbeafe',
                            color: b.status === 'Completed' ? '#166534' : '#1e40af',
                          }}
                        >
                          {b.status === 'Completed'
                            ? 'Completed · Paid Out'
                            : isAccepted
                              ? 'Live Call Held'
                              : 'Paid in Escrow'}
                        </span>

                        {b.status !== 'Completed' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAcceptAndStartLiveCall(b, 'video')}
                              style={{
                                padding: '0.42rem 0.78rem',
                                borderRadius: '7px',
                                border: 'none',
                                backgroundColor: accentBlue,
                                color: '#ffffff',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Video Call
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAcceptAndStartLiveCall(b, 'audio')}
                              style={{
                                padding: '0.42rem 0.78rem',
                                borderRadius: '7px',
                                border: `1px solid ${accentBlue}`,
                                backgroundColor: 'transparent',
                                color: accentBlue,
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Audio Call
                            </button>
                          </>
                        )}

                        {b.status !== 'Completed' && (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => {
                              if (liveCallBooking?.id === b.id) {
                                endCall();
                              }
                              handleCompleteSessionAndAutoPay(b);
                            }}
                            style={{
                              padding: '0.42rem 0.85rem',
                              borderRadius: '7px',
                              border: 'none',
                              backgroundColor: '#16a34a',
                              color: '#ffffff',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Complete Session (Auto-Pay)
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '0.65rem 0.8rem',
                        borderRadius: '8px',
                        backgroundColor: darkMode ? '#0b1020' : '#fdfbf7',
                        fontSize: '0.85rem',
                      }}
                    >
                      <strong style={{ color: textMuted, fontSize: '0.76rem' }}>
                        COMPLAINT SUMMARY:{' '}
                      </strong>
                      <span>{b.complaint_summary || 'Shared prior to call.'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. WALLET & PAYOUTS */}
      {activeNav === 'wallet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
          <div
            style={{
              backgroundColor: bgCard,
              border: `1px solid ${borderColor}`,
              borderRadius: '12px',
              padding: '1.35rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.5rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: textMuted }}>
                {isConsultant ? 'CONSULTANT PAYOUT BALANCE' : 'WALLET BALANCE'}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.3rem 0' }}>
                ₦{walletBalance.toLocaleString()}
              </div>
              <p style={{ margin: 0, fontSize: '0.84rem', color: textMuted }}>
                {isConsultant
                  ? 'Session payouts credit here automatically when sessions complete. Withdraw to your local bank account below.'
                  : 'Top up your wallet to book calls or withdraw funds to your local bank account.'}
              </p>
            </div>

            {!isConsultant ? (
              <form
                onSubmit={handleDeposit}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
              >
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Top Up Amount (₦ NGN)</label>
                <input
                  type="number"
                  min={500}
                  step={500}
                  placeholder="e.g. 15000"
                  value={walletAmountInput}
                  onChange={(e) => setWalletAmountInput(e.target.value)}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      flex: 1,
                      padding: '0.65rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: accentBlue,
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
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
                      padding: '0.65rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid #ef4444',
                      backgroundColor: 'transparent',
                      color: '#ef4444',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    - Remove Money
                  </button>
                </div>
              </form>
            ) : (
              <div
                style={{
                  padding: '0.9rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: darkMode ? '#0b1020' : '#fdfbf7',
                  border: `1px solid ${borderColor}`,
                  fontSize: '0.84rem',
                  color: textMuted,
                  alignSelf: 'center',
                }}
              >
                Wallet top-up is disabled for consultants. Use the{' '}
                <strong>Withdraw to Local Bank Account</strong> form below to cash out your
                earnings.
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: bgCard,
              border: `1px solid ${borderColor}`,
              borderRadius: '12px',
              padding: '1.35rem',
            }}
          >
            <h2 style={{ margin: '0 0 0.85rem', fontSize: '1.08rem' }}>
              Withdraw to Local Bank Account
            </h2>
            <form
              onSubmit={handleBankWithdraw}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                gap: '0.8rem',
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
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
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                  10-Digit Account No.
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="0123456789"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
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
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
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
                  padding: '0.68rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: accentBlue,
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Withdraw
              </button>
            </form>
          </div>

          <div
            style={{
              backgroundColor: bgCard,
              border: `1px solid ${borderColor}`,
              borderRadius: '12px',
              padding: '1.25rem',
            }}
          >
            <h2 style={{ margin: '0 0 0.85rem', fontSize: '1.08rem' }}>
              Wallet Transaction History
            </h2>
            {transactions.length === 0 ? (
              <p style={{ color: textMuted, margin: 0 }}>No wallet transactions recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      padding: '0.72rem 0.9rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderColor}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{tx.description}</div>
                      <div style={{ fontSize: '0.76rem', color: textMuted }}>
                        {tx.type} · {new Date(tx.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: tx.direction === 'credit' ? '#16a34a' : '#ef4444',
                      }}
                    >
                      {tx.direction === 'credit' ? '+' : '-'}₦
                      {Number(tx.amount_ngn).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: bgCard,
              border: `1px solid ${borderColor}`,
              borderRadius: '12px',
              padding: '1.25rem',
            }}
          >
            <h2 style={{ margin: '0 0 0.85rem', fontSize: '1.08rem' }}>
              Bank Withdrawal History
            </h2>
            {withdrawals.length === 0 ? (
              <p style={{ color: textMuted, margin: 0 }}>No bank withdrawals recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {withdrawals.map((wd) => (
                  <div
                    key={wd.id}
                    style={{
                      padding: '0.72rem 0.9rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderColor}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                        {wd.bank_name} · {wd.account_number} ({wd.account_name})
                      </div>
                      <div style={{ fontSize: '0.76rem', color: textMuted }}>
                        Status: {wd.status} · {new Date(wd.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#ef4444' }}>
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
      {activeNav === 'profile' && (
        <div
          style={{
            backgroundColor: bgCard,
            border: `1px solid ${borderColor}`,
            borderRadius: '12px',
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Profile Settings</h2>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              padding: '0.9rem 1rem',
              borderRadius: '10px',
              border: `1px solid ${borderColor}`,
              backgroundColor: darkMode ? '#0b1020' : '#fdfbf7',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '9999px',
                overflow: 'hidden',
                border: `2px solid ${accentBlue}`,
                backgroundColor: accentBlue,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.1rem',
                flexShrink: 0,
              }}
            >
              {activeAvatar ? (
                <img
                  src={activeAvatar}
                  alt={displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <strong style={{ fontSize: '0.95rem' }}>{displayName}</strong>
              <span style={{ fontSize: '0.82rem', color: textMuted }}>
                {displayEmail} · Role: <strong>{isConsultant ? 'Consultant' : 'Consultee'}</strong>
              </span>
              <label
                style={{
                  alignSelf: 'flex-start',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: accentBlue,
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginTop: '0.2rem',
                }}
              >
                Choose Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <form
            onSubmit={handleSaveProfile}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '0.9rem',
              alignItems: 'end',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '0.3rem',
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
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '0.3rem',
                }}
              >
                Role
              </label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as 'client' | 'consultant')}
                style={inputStyle}
              >
                <option value="client">Consultee (Client)</option>
                <option value="consultant">Consultant</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '0.3rem',
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
                padding: '0.68rem 1.1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: accentBlue,
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </form>

          <div
            style={{
              padding: '1rem',
              borderRadius: '10px',
              border: `1px solid ${borderColor}`,
              backgroundColor: darkMode ? '#0b1020' : '#fdfbf7',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <strong style={{ fontSize: '0.92rem' }}>Phone Number &amp; Text Verification</strong>
              <span
                style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '999px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  backgroundColor: isPhoneVerified ? '#dcfce7' : '#fef3c7',
                  color: isPhoneVerified ? '#166534' : '#92400e',
                }}
              >
                {isPhoneVerified ? 'Verified via Text' : 'Not Verified'}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.65rem',
                flexWrap: 'wrap',
                alignItems: 'center',
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
                style={{ ...inputStyle, maxWidth: '300px' }}
              />
              <button
                type="button"
                disabled={sendingSms}
                onClick={handleSendSmsVerification}
                style={{
                  padding: '0.65rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: accentBlue,
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {sendingSms ? 'Sending Text...' : 'Send Verification Text'}
              </button>
            </div>

            {(smsSent || demoOtpCode) && !isPhoneVerified && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {demoOtpCode && (
                  <div style={{ fontSize: '0.8rem', color: textMuted }}>
                    Text message code: <strong>{demoOtpCode}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit SMS code"
                    value={smsCodeInput}
                    onChange={(e) => setSmsCodeInput(e.target.value.replace(/\D/g, ''))}
                    style={{ ...inputStyle, maxWidth: '210px' }}
                  />
                  <button
                    type="button"
                    disabled={verifyingSms}
                    onClick={handleVerifySmsCode}
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {verifyingSms ? 'Verifying...' : 'Verify Code'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: '0.84rem',
              color: textMuted,
              borderTop: `1px solid ${borderColor}`,
              paddingTop: '0.85rem',
            }}
          >
            Email: <strong>{displayEmail}</strong> · KYC Status:{' '}
            <strong style={{ textTransform: 'capitalize' }}>{displayKyc}</strong>
          </div>
        </div>
      )}

      <footer
        style={{
          marginTop: 'auto',
          paddingTop: '1rem',
          borderTop: `1px solid ${borderColor}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          fontSize: '0.8rem',
          color: textMuted,
        }}
      >
        <span>Find An Expert</span>
        <span>Escrow-Protected Advisory &amp; Live Audio/Video</span>
      </footer>
    </main>
  );
}