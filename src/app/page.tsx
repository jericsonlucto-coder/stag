"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import Pusher from "pusher-js";

// ============================================================
// TYPES & INTERFACES
// ============================================================

type MessageStatus = "sending" | "sent" | "delivered" | "error";
type ReactionType = "👍" | "❤️" | "😂" | "😮" | "😢" | "🙏";

interface Reaction {
  type: ReactionType;
  userId: string;
  username: string;
  timestamp: number;
}

interface Message {
  id: string;
  text: string;
  username: string;
  timestamp: number;
  userId: string;
  status?: MessageStatus;
  reactions?: Reaction[];
}

interface User {
  id: string;
  username: string;
  joinedAt: number;
  lastActive: number;
}

interface FirebaseMessage {
  text: string;
  username: string;
  timestamp: number;
  userId: string;
  createdAt: string;
  reactions?: Reaction[];
}

// ============================================================
// CONSTANTS
// ============================================================

const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";
const REACTIONS: ReactionType[] = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const HEARTBEAT_INTERVAL = 30000;
const USER_ACTIVE_THRESHOLD = 60000;
const USER_REFRESH_INTERVAL = 5000;
const STATUS_CLEAR_DELAY = 2000;

// ============================================================
// UTILITIES
// ============================================================

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2, 9);

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const sanitizeReactions = (reactions: any[]): Reaction[] =>
  (reactions || []).filter((r) => r !== null && r !== undefined);

const getReactionCounts = (reactions?: Reaction[]): Record<string, number> => {
  if (!reactions) return {};
  return sanitizeReactions(reactions).reduce(
    (acc: Record<string, number>, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    },
    {}
  );
};

const getUniqueReactions = (reactions?: Reaction[]): Reaction[] => {
  if (!reactions) return [];
  const unique = new Map<ReactionType, Reaction>();
  sanitizeReactions(reactions).forEach((r) => {
    if (!unique.has(r.type)) unique.set(r.type, r);
  });
  return Array.from(unique.values());
};

// ============================================================
// API HELPERS
// ============================================================

const api = {
  getMessages: () => fetch(`${FIREBASE_DB_URL}/messages.json`),
  getUsers: () => fetch(`${FIREBASE_DB_URL}/users.json`),

  putUser: (userId: string, data: object) =>
    fetch(`${FIREBASE_DB_URL}/users/${userId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  patchUser: (userId: string, data: object) =>
    fetch(`${FIREBASE_DB_URL}/users/${userId}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteUser: (userId: string) =>
    fetch(`${FIREBASE_DB_URL}/users/${userId}.json`, { method: "DELETE" }),

  putReactions: (messageId: string, reactions: Reaction[]) =>
    fetch(`${FIREBASE_DB_URL}/messages/${messageId}/reactions.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reactions),
    }),

  sendMessage: (message: Message) =>
    fetch("/api/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    }),

  sendReaction: (messageId: string, reaction: Reaction | null) =>
    fetch("/api/send-reaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, reaction }),
    }),
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

function StatusIcon({ status }: { status: MessageStatus }) {
  const configs = {
    sending: {
      color: "text-gray-500",
      label: "Sending...",
      icon: (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ),
    },
    sent: {
      color: "text-blue-500",
      label: "Sent",
      icon: (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    delivered: {
      color: "text-green-500",
      label: "Delivered",
      icon: (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    error: {
      color: "text-red-500",
      label: "Failed",
      icon: (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const { color, label, icon } = configs[status];
  return (
    <div className={`flex items-center gap-1 text-xs ${color}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function ReactionPicker({
  reactions,
  userId,
  onReact,
}: {
  reactions?: Reaction[];
  userId: string;
  onReact: (type: ReactionType) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-lg border p-2 flex gap-1 z-20">
      {REACTIONS.map((reaction) => {
        const isActive = sanitizeReactions(reactions || []).some(
          (r) => r.userId === userId && r.type === reaction
        );
        return (
          <button
            key={reaction}
            onClick={() => onReact(reaction)}
            className={`hover:bg-gray-100 p-2 rounded transition-colors text-xl ${
              isActive ? "bg-blue-100" : ""
            }`}
          >
            {reaction}
          </button>
        );
      })}
    </div>
  );
}

function ReactionDisplay({
  reactions,
  userId,
}: {
  reactions?: Reaction[];
  userId: string;
}) {
  const counts = getReactionCounts(reactions);
  const unique = getUniqueReactions(reactions);

  if (unique.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {unique.map((reaction, idx) => {
        const isActive = sanitizeReactions(reactions || []).some(
          (r) => r.userId === userId && r.type === reaction.type
        );
        return (
          <div
            key={idx}
            className={`inline-flex items-center gap-1 bg-white border rounded-full px-2 py-0.5 text-sm shadow-sm ${
              isActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <span>{reaction.type}</span>
            <span className="text-xs text-gray-600">{counts[reaction.type]}</span>
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({
  message,
  currentUserId,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onReact,
}: {
  message: Message;
  currentUserId: string;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onReact: (type: ReactionType) => void;
}) {
  const isOwn = message.userId === currentUserId;
  const uniqueReactions = getUniqueReactions(message.reactions);

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-8`}>
      <div
        className="relative max-w-[70%]"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Reaction Picker */}
        {isHovered && (
          <div
            className={`absolute -top-12 ${isOwn ? "right-0" : "left-0"}`}
          >
            <ReactionPicker
              reactions={message.reactions}
              userId={currentUserId}
              onReact={onReact}
            />
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-lg p-3 ${
            isOwn ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{message.username}</span>
            <span className="text-xs opacity-75">
              {formatTime(message.timestamp)}
            </span>
          </div>
          <p className="break-words">{message.text}</p>
          {isOwn && message.status && (
            <div className="mt-1 flex justify-end">
              <StatusIcon status={message.status} />
            </div>
          )}
        </div>

        {/* Reactions */}
        {uniqueReactions.length > 0 && (
          <div className={`absolute -bottom-6 ${isOwn ? "right-0" : "left-0"}`}>
            <ReactionDisplay
              reactions={message.reactions}
              userId={currentUserId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function UserListItem({
  user,
  isCurrentUser,
}: {
  user: User;
  isCurrentUser: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors border-b ${
        isCurrentUser ? "bg-blue-50" : ""
      }`}
    >
      <div className="relative">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold ${
            isCurrentUser
              ? "bg-gradient-to-br from-green-400 to-green-600"
              : "bg-gradient-to-br from-blue-400 to-indigo-500"
          }`}
        >
          {user.username?.charAt(0).toUpperCase()}
        </div>
        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">
          {user.username}
          {isCurrentUser && (
            <span className="ml-2 text-xs text-green-600">(You)</span>
          )}
        </p>
        <p className="text-xs text-gray-500">Active now</p>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [username, setUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string>(generateId());
  const userHeartbeatRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // ── Persistence ──────────────────────────────────────────

  useEffect(() => {
    const savedUsername = localStorage.getItem("chat-username");
    const savedUserId = localStorage.getItem("chat-userId");
    if (savedUsername && savedUserId) {
      setUsername(savedUsername);
      userIdRef.current = savedUserId;
      setIsJoined(true);
    }
  }, []);

  // ── Data Fetching ─────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.getMessages();
      const data: Record<string, FirebaseMessage> = await res.json();
      const loaded: Message[] = Object.entries(data || {})
        .filter(([, msg]) => msg?.text && msg?.username)
        .map(([key, msg]) => ({
          id: key,
          text: msg.text,
          username: msg.username,
          timestamp: msg.timestamp || Date.now(),
          userId: msg.userId || "",
          status: "delivered",
          reactions: sanitizeReactions(msg.reactions || []),
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      setMessages(loaded);
    } catch (err) {
      console.error("Error loading messages:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOnlineUsers = useCallback(async () => {
    try {
      const res = await api.getUsers();
      const data: Record<string, any> = await res.json();
      const now = Date.now();
      const active: User[] = [];

      Object.entries(data || {}).forEach(([key, user]) => {
        if (!user?.username || !user?.lastActive) return;
        if (now - user.lastActive < USER_ACTIVE_THRESHOLD) {
          active.push({
            id: key,
            username: user.username,
            joinedAt: user.joinedAt || now,
            lastActive: user.lastActive,
          });
        } else {
          api.deleteUser(key).catch(console.error);
        }
      });

      active.sort((a, b) => {
        if (a.id === userIdRef.current) return -1;
        if (b.id === userIdRef.current) return 1;
        return a.username.localeCompare(b.username);
      });

      setOnlineUsers(active);
    } catch (err) {
      console.error("Error loading online users:", err);
    }
  }, []);

  // ── User Presence ─────────────────────────────────────────

  const registerUser = useCallback(async () => {
    try {
      await api.putUser(userIdRef.current, {
        username,
        joinedAt: Date.now(),
        lastActive: Date.now(),
      });
      setTimeout(loadOnlineUsers, 1000);
    } catch (err) {
      console.error("Error registering user:", err);
    }
  }, [username, loadOnlineUsers]);

  const removeUser = useCallback(async () => {
    try {
      await api.deleteUser(userIdRef.current);
    } catch (err) {
      console.error("Error removing user:", err);
    }
  }, []);

  const updateLastActive = useCallback(async () => {
    if (!isJoined) return;
    try {
      await api.patchUser(userIdRef.current, { lastActive: Date.now() });
    } catch (err) {
      console.error("Error updating last active:", err);
    }
  }, [isJoined]);

  // ── Effects ───────────────────────────────────────────────

  useEffect(() => {
    if (!isJoined) return;
    registerUser();
    loadMessages();
    userHeartbeatRef.current = setInterval(() => {
      updateLastActive();
      loadOnlineUsers();
    }, HEARTBEAT_INTERVAL);
    return () => {
      clearInterval(userHeartbeatRef.current);
      removeUser();
    };
  }, [isJoined, registerUser, loadMessages, loadOnlineUsers, updateLastActive, removeUser]);

  useEffect(() => {
    if (!isJoined) return;
    const interval = setInterval(loadOnlineUsers, USER_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [isJoined, loadOnlineUsers]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Pusher ────────────────────────────────────────────────

  useEffect(() => {
    if (!isJoined) return;

    const pusher = new Pusher("bc4bbe143420c20c0e9d", {
      cluster: "ap1",
      authEndpoint: "/api/pusher-auth",
    });

    const channel = pusher.subscribe("private-chat-channel");

    channel.bind("new-message", (data: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, { ...data, status: "delivered" }].sort(
          (a, b) => a.timestamp - b.timestamp
        );
      });
    });

    channel.bind(
      "message-reaction",
      (data: { messageId: string; reaction: Reaction | null }) => {
        if (!data.reaction) return;
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== data.messageId) return msg;
            const alreadyExists = msg.reactions?.some(
              (r) => r?.userId === data.reaction!.userId && r?.type === data.reaction!.type
            );
            if (alreadyExists) return msg;
            return {
              ...msg,
              reactions: [...sanitizeReactions(msg.reactions), data.reaction!],
            };
          })
        );
      }
    );

    return () => {
      channel.unbind_all();
      channel.unsubscribe();
      pusher.disconnect();
    };
  }, [isJoined]);

  // ── Actions ───────────────────────────────────────────────

  const addReaction = async (messageId: string, reactionType: ReactionType) => {
    const message = messages.find((m) => m.id === messageId);
    const cleanReactions = sanitizeReactions(message?.reactions || []);
    const hasReacted = cleanReactions.some(
      (r) => r.userId === userIdRef.current && r.type === reactionType
    );

    const updatedReactions = hasReacted
      ? cleanReactions.filter(
          (r) => !(r.userId === userIdRef.current && r.type === reactionType)
        )
      : [
          ...cleanReactions,
          {
            type: reactionType,
            userId: userIdRef.current,
            username,
            timestamp: Date.now(),
          },
        ];

    // Optimistic update
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, reactions: updatedReactions } : msg
      )
    );

    try {
      await api.putReactions(messageId, updatedReactions);
      await api.sendReaction(
        messageId,
        hasReacted ? null : updatedReactions[updatedReactions.length - 1]
      );
    } catch (err) {
      console.error("Error updating reaction:", err);
    }

    setHoveredMessageId(null);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !username) return;

    const messageId = generateId();
    const newMessage: Message = {
      id: messageId,
      text: inputMessage,
      username,
      timestamp: Date.now(),
      userId: userIdRef.current,
      status: "sending",
      reactions: [],
    };

    setInputMessage("");

    const updateStatus = (status: MessageStatus | undefined) =>
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, status } : msg))
      );

    setMessages((prev) => {
      if (prev.some((m) => m.id === messageId)) return prev;
      return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
    });

    try {
      updateStatus("sent");
      const res = await api.sendMessage(newMessage);
      if (res.ok) {
        updateStatus("delivered");
        setTimeout(() => updateStatus(undefined), STATUS_CLEAR_DELAY);
      } else {
        updateStatus("error");
      }
    } catch (err) {
      console.error("Error sending message:", err);
      updateStatus("error");
    }
  };

  const joinChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    localStorage.setItem("chat-username", username);
    localStorage.setItem("chat-userId", userIdRef.current);
    setIsJoined(true);
  };

  const clearSavedUser = () => {
    localStorage.removeItem("chat-username");
    localStorage.removeItem("chat-userId");
    setUsername("");
    window.location.reload();
  };

  // ── Hover Handlers ────────────────────────────────────────

  const handleMouseEnter = (messageId: string) => {
    clearTimeout(hoverTimeoutRef.current);
    setHoveredMessageId(messageId);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(
      () => setHoveredMessageId(null),
      200
    );
  };

  // ── Join Screen ───────────────────────────────────────────

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <Image
              src="/next.svg"
              alt="Logo"
              width={120}
              height={30}
              className="mx-auto dark:invert"
            />
            <h2 className="text-2xl font-bold text-gray-800 mt-6">
              Join the Chat
            </h2>
            <p className="text-gray-600 mt-2">
              Enter your username to start chatting
            </p>
          </div>
          <form onSubmit={joinChat} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your username"
                required
                maxLength={20}
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              Join Chat
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Chat Screen ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/next.svg" alt="Logo" width={100} height={25} />
            <h1 className="text-xl font-semibold text-gray-800">
              Real-time Chat
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Logged in as:</span>
            <span className="font-medium text-gray-800">{username}</span>
            <button
              onClick={clearSavedUser}
              className="text-sm text-red-500 hover:text-red-600"
            >
              Leave & Clear
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-4">
          {/* Sidebar */}
          <div className="w-72 bg-white rounded-xl shadow-lg overflow-hidden flex-shrink-0">
            <div className="p-4 border-b bg-gradient-to-r from-blue-500 to-indigo-600">
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <h3 className="font-semibold text-white">
                  Active Now ({onlineUsers.length})
                </h3>
              </div>
            </div>
            <div className="h-[500px] overflow-y-auto">
              {onlineUsers.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No active users</p>
              ) : (
                onlineUsers.map((user) => (
                  <UserListItem
                    key={user.id}
                    user={user}
                    isCurrentUser={user.id === userIdRef.current}
                  />
                ))
              )}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="h-[500px] overflow-y-auto p-4 space-y-3">
              {isLoading && (
                <p className="text-center text-gray-500 mt-8">
                  Loading messages...
                </p>
              )}
              {!isLoading && messages.length === 0 && (
                <p className="text-center text-gray-500 mt-8">
                  No messages yet. Start the conversation!
                </p>
              )}
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  currentUserId={userIdRef.current}
                  isHovered={hoveredMessageId === message.id}
                  onMouseEnter={() => handleMouseEnter(message.id)}
                  onMouseLeave={handleMouseLeave}
                  onReact={(type) => addReaction(message.id, type)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="border-t p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={500}
                />
                <button
                  type="submit"
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
