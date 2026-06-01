import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/apiClient";
import { API_CONFIG } from "../config/api";

interface Participant {
  address: string;
  timestamp: number;
  isOptimistic?: boolean;
}

interface RecentParticipantsProps {
  raffleId: number;
  currentUserAddress?: string;
  onOptimisticUpdate?: (address: string) => void;
}

const POLL_INTERVAL = 15000; // 15 seconds
const MAX_DISPLAYED = 20;
const ANIMATION_DURATION = 300; // ms

const RecentParticipants = ({
  raffleId,
  onOptimisticUpdate,
}: RecentParticipantsProps) => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const optimisticAddressesRef = useRef<Set<string>>(new Set());
  const prefersReducedMotionRef = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Fetch participants since a given timestamp
  const fetchParticipants = useCallback(async (since?: number) => {
    try {
      const params = new URLSearchParams();
      if (since) params.set("since", String(since));
      const endpoint = `${API_CONFIG.endpoints.raffles.detail(String(raffleId))}/participants?${params.toString()}`;
      const data = await api.get<Participant[]>(endpoint);
      return data || [];
    } catch (err) {
      console.error("Failed to fetch participants:", err);
      return [];
    }
  }, [raffleId]);

  // Initial load
  useEffect(() => {
    const loadInitial = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchParticipants();
        setParticipants(data.slice(0, MAX_DISPLAYED));
        lastFetchTimeRef.current = Date.now();
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load participants"));
      } finally {
        setIsLoading(false);
      }
    };

    loadInitial();
  }, [raffleId, fetchParticipants]);

  // Poll for new participants
  useEffect(() => {
    const poll = async () => {
      try {
        const newParticipants = await fetchParticipants(lastFetchTimeRef.current);

        if (newParticipants.length > 0) {
          setParticipants((prev) => {
            // Remove optimistic entries that are now confirmed
            const confirmed = newParticipants.filter(
              (p) => !optimisticAddressesRef.current.has(p.address)
            );
            optimisticAddressesRef.current.clear();

            // Prepend new participants and cap at MAX_DISPLAYED
            const updated = [...confirmed, ...prev].slice(0, MAX_DISPLAYED);
            return updated;
          });
          lastFetchTimeRef.current = Date.now();
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    };

    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchParticipants]);

  // Optimistic update when user purchases
  const addOptimisticParticipant = useCallback((address: string) => {
    optimisticAddressesRef.current.add(address);
    const optimisticParticipant: Participant = {
      address,
      timestamp: Date.now(),
      isOptimistic: true,
    };
    setParticipants((prev) => [optimisticParticipant, ...prev].slice(0, MAX_DISPLAYED));
    onOptimisticUpdate?.(address);
  }, [onOptimisticUpdate]);

  // Expose optimistic update to parent
  useEffect(() => {
    (window as any).__addOptimisticParticipant = addOptimisticParticipant;
    return () => {
      delete (window as any).__addOptimisticParticipant;
    };
  }, [addOptimisticParticipant]);

  if (isLoading && participants.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <p className="text-[#858584] text-[22px]">Recent Participants</p>
          <p className="text-teal-600 dark:text-[#00E6CC] text-sm">View All</p>
        </div>
        <div className="mt-8 flex space-x-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="w-12 h-12 rounded-full bg-gray-200 dark:bg-white/5 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && participants.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <p className="text-[#858584] text-[22px]">Recent Participants</p>
          <p className="text-teal-600 dark:text-[#00E6CC] text-sm">View All</p>
        </div>
        <p className="text-sm text-gray-500">Failed to load participants</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-[#858584] text-[22px]">Recent Participants</p>
        <p className="text-teal-600 dark:text-[#00E6CC] text-sm">
          {participants.length} {participants.length === 1 ? "participant" : "participants"}
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        {participants.map((participant, index) => (
          <ParticipantAvatar
            key={`${participant.address}-${index}`}
            address={participant.address}
            isOptimistic={participant.isOptimistic}
            animationDelay={index * 50}
            prefersReducedMotion={prefersReducedMotionRef.current}
          />
        ))}
      </div>
    </div>
  );
};

interface ParticipantAvatarProps {
  address: string;
  isOptimistic?: boolean;
  animationDelay: number;
  prefersReducedMotion: boolean;
}

const ParticipantAvatar = ({
  address,
  isOptimistic,
  animationDelay,
  prefersReducedMotion,
}: ParticipantAvatarProps) => {
  // Generate consistent avatar color from address
  const getAvatarColor = (addr: string) => {
    const hash = addr.split("").reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    const colors = [
      "bg-red-500",
      "bg-blue-500",
      "bg-green-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-cyan-500",
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const avatarColor = getAvatarColor(address);
  const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;

  const animationStyle = prefersReducedMotion
    ? {}
    : {
      animation: `slideInDown ${ANIMATION_DURATION}ms ease-out`,
      animationDelay: `${animationDelay}ms`,
      animationFillMode: "both" as const,
    };

  return (
    <div
      className={`relative group ${isOptimistic ? "opacity-75" : ""}`}
      style={animationStyle}
      title={address}
    >
      <style>{`
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div
        className={`w-12 h-12 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold shadow-md hover:shadow-lg transition-shadow cursor-pointer`}
      >
        {shortAddress}
      </div>
      {isOptimistic && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white dark:border-[#11172E] animate-pulse" />
      )}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        {address}
        {isOptimistic && " (pending)"}
      </div>
    </div>
  );
};

export default RecentParticipants;
