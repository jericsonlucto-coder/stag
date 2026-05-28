"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import Pusher from "pusher-js";

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

// Firebase message structure
interface FirebaseMessage {
  text: string;
  username: string;
  timestamp: number;
  userId: string;
  createdAt: string;
  reactions?: Reaction[];
}

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";

const REACTIONS: ReactionType[] = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

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

  // Check for saved username on component mount
  useEffect(() => {
    const savedUsername = localStorage.getItem("chat-username");
    const savedUserId = localStorage.getItem("chat-userId");
    
    if (savedUsername && savedUserId) {
      console.log("Found saved username:", savedUsername);
      setUsername(savedUsername);
      userIdRef.current = savedUserId;
      setIsJoined(true);
    }
  }, []);

  // Update user's last active time
  const updateLastActive = useCallback(async () => {
    if (!isJoined) return;
    
    try {
      await fetch(`${FIREBASE_DB_URL}/users/${userIdRef.current}.json`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lastActive: Date.now(),
        }),
      });
    } catch (error) {
      console.error("Error updating last active:", error);
    }
  }, [isJoined]);

  // Load online users from Firebase
  const loadOnlineUsers = useCallback(async () => {
    try {
      const response = await fetch(`${FIREBASE_DB_URL}/users.json`);
      const data: Record<string, any> = await response.json();
      
      const now = Date.now();
      const activeUsers: User[] = [];
      
      if (data) {
        Object.keys(data).forEach((key) => {
          const user = data[key];
          if (user && user.username && user.lastActive) {
            const timeSinceLastActive = now - user.lastActive;
            if (timeSinceLastActive < 60000) {
              activeUsers.push({
                id: key,
                username: user.username,
                joinedAt: user.joinedAt || now,
                lastActive: user.lastActive,
              });
            } else {
              fetch(`${FIREBASE_DB_URL}/users/${key}.json`, {
                method: "DELETE",
              }).catch(console.error);
            }
          }
        });
      }
      
      activeUsers.sort((a, b) => {
        if (a.id === userIdRef.current) return -1;
        if (b.id === userIdRef.current) return 1;
        return (a.username || "").localeCompare(b.username || "");
      });
      
      setOnlineUsers(activeUsers);
    } catch (error) {
      console.error("Error loading online users:", error);
    }
  }, []);

  // Load messages from Firebase
  const loadMessages = useCallback(async () => {
    try {
      const response = await fetch(`${FIREBASE_DB_URL}/messages.json`);
      const data: Record<string, FirebaseMessage> = await response.json();
      
      const loadedMessages: Message[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          const msg = data[key];
          if (msg && msg.text && msg.username) {
            loadedMessages.push({
              id: key,
              text: msg.text,
              username: msg.username,
              timestamp: msg.timestamp || Date.now(),
              userId: msg.userId || "",
              status: "delivered",
              reactions: msg.reactions || [],
            });
          }
        });
      }
      
      loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(loadedMessages);
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Register user when joining chat
  const registerUser = useCallback(async () => {
    try {
      const userData = {
        username: username,
        joinedAt: Date.now(),
        lastActive: Date.now(),
      };
      
      await fetch(`${FIREBASE_DB_URL}/users/${userIdRef.current}.json`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });
      
      setTimeout(() => {
        loadOnlineUsers();
      }, 1000);
    } catch (error) {
      console.error("Error registering user:", error);
    }
  }, [username, loadOnlineUsers]);

  // Remove user when leaving chat
  const removeUser = useCallback(async () => {
    try {
      await fetch(`${FIREBASE_DB_URL}/users/${userIdRef.current}.json`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Error removing user:", error);
    }
  }, []);

  // Initial load when joining chat
  useEffect(() => {
    if (!isJoined) return;
    
    registerUser();
    loadMessages();
    
    userHeartbeatRef.current = setInterval(() => {
      updateLastActive();
      loadOnlineUsers();
    }, 30000);
    
    return () => {
      if (userHeartbeatRef.current) {
        clearInterval(userHeartbeatRef.current);
      }
      removeUser();
    };
  }, [isJoined, registerUser, loadMessages, loadOnlineUsers, updateLastActive, removeUser]);

  // Refresh online users every 5 seconds
  useEffect(() => {
    if (!isJoined) return;
    
    const interval = setInterval(() => {
      loadOnlineUsers();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isJoined, loadOnlineUsers]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize Pusher for real-time updates
  useEffect(() => {
    if (!isJoined) return;

    const pusher = new Pusher("bc4bbe143420c20c0e9d", {
      cluster: "ap1",
      authEndpoint: "/api/pusher-auth",
    });

    const channel = pusher.subscribe("private-chat-channel");
    
    channel.bind("new-message", (data: Message) => {
      setMessages((prevMessages: Message[]) => {
        const exists = prevMessages.some(msg => msg.id === data.id);
        if (!exists) {
          const newMessages: Message[] = [...prevMessages, { ...data, status: "delivered" }];
          newMessages.sort((a, b) => a.timestamp - b.timestamp);
          return newMessages;
        }
        return prevMessages;
      });
    });

    channel.bind("message-reaction", (data: { messageId: string; reaction: Reaction }) => {
      setMessages((prevMessages: Message[]) =>
        prevMessages.map((msg) =>
          msg.id === data.messageId
            ? {
                ...msg,
                reactions: [...(msg.reactions || []), data.reaction],
              }
            : msg
        )
      );
    });

    return () => {
      channel.unbind_all();
      channel.unsubscribe();
      pusher.disconnect();
    };
  }, [isJoined]);

  const addReaction = async (messageId: string, reactionType: ReactionType) => {
    const message = messages.find(m => m.id === messageId);
    
    // Check if user already reacted with this emoji
    const hasReacted = message?.reactions?.some(
      r => r.userId === userIdRef.current && r.type === reactionType
    );
    
    if (hasReacted) {
      // Remove reaction if already exists
      const updatedReactions = message?.reactions?.filter(
        r => !(r.userId === userIdRef.current && r.type === reactionType)
      ) || [];
      
      // Update UI optimistically
      setMessages((prevMessages: Message[]) =>
        prevMessages.map((msg) =>
          msg.id === messageId
            ? { ...msg, reactions: updatedReactions }
            : msg
        )
      );
      
      // Save to Firebase
      try {
        await fetch(`${FIREBASE_DB_URL}/messages/${messageId}/reactions.json`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedReactions),
        });
        
        // Trigger Pusher event for reaction removal
        await fetch("/api/send-reaction", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messageId,
            reaction: null, // Send null to indicate removal
          }),
        });
      } catch (error) {
        console.error("Error removing reaction:", error);
      }
    } else {
      // Add new reaction
      const reaction: Reaction = {
        type: reactionType,
        userId: userIdRef.current,
        username: username,
        timestamp: Date.now(),
      };
      
      const updatedReactions = [...(message?.reactions || []), reaction];
      
      // Update UI optimistically
      setMessages((prevMessages: Message[]) =>
        prevMessages.map((msg) =>
          msg.id === messageId
            ? { ...msg, reactions: updatedReactions }
            : msg
        )
      );
      
      // Save to Firebase
      try {
        await fetch(`${FIREBASE_DB_URL}/messages/${messageId}/reactions.json`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedReactions),
        });
        
        // Trigger Pusher event for real-time reaction update
        await fetch("/api/send-reaction", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messageId,
            reaction,
          }),
        });
      } catch (error) {
        console.error("Error adding reaction:", error);
      }
    }
    
    setHoveredMessageId(null);
  };

  const getReactionCounts = (reactions?: Reaction[]) => {
    if (!reactions) return {};
    return reactions.reduce((acc: Record<string, number>, reaction) => {
      acc[reaction.type] = (acc[reaction.type] || 0) + 1;
      return acc;
    }, {});
  };

  const getUniqueReactions = (reactions?: Reaction[]) => {
    if (!reactions) return [];
    const unique = new Map();
    reactions.forEach(reaction => {
      if (!unique.has(reaction.type)) {
        unique.set(reaction.type, reaction);
      }
    });
    return Array.from(unique.values());
  };

  const hasUserReacted = (reactions: Reaction[] | undefined, reactionType: ReactionType) => {
    return reactions?.some(r => r.userId === userIdRef.current && r.type === reactionType);
  };

  const handleMouseEnter = (messageId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredMessageId(messageId);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMessageId(null);
    }, 200);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !username) return;

    const messageId = generateId();
    const newMessage: Message = {
      id: messageId,
      text: inputMessage,
      username: username,
      timestamp: Date.now(),
      userId: userIdRef.current,
      status: "sending",
      reactions: [],
    };
    
    setInputMessage("");
    
    setMessages((prevMessages: Message[]) => {
      const exists = prevMessages.some(msg => msg.id === messageId);
      if (!exists) {
        const newMessages: Message[] = [...prevMessages, newMessage];
        newMessages.sort((a, b) => a.timestamp - b.timestamp);
        return newMessages;
      }
      return prevMessages;
    });

    try {
      setMessages((prevMessages: Message[]) =>
        prevMessages.map((msg) =>
          msg.id === messageId ? { ...msg, status: "sent" as MessageStatus } : msg
        )
      );

      const response = await fetch("/api/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newMessage),
      });

      if (response.ok) {
        setMessages((prevMessages: Message[]) =>
          prevMessages.map((msg) =>
            msg.id === messageId ? { ...msg, status: "delivered" as MessageStatus } : msg
          )
        );
        
        setTimeout(() => {
          setMessages((prevMessages: Message[]) =>
            prevMessages.map((msg) =>
              msg.id === messageId ? { ...msg, status: undefined } : msg
            )
          );
        }, 2000);
      } else {
        setMessages((prevMessages: Message[]) =>
          prevMessages.map((msg) =>
            msg.id === messageId ? { ...msg, status: "error" as MessageStatus } : msg
          )
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prevMessages: Message[]) =>
        prevMessages.map((msg) =>
          msg.id === messageId ? { ...msg, status: "error" as MessageStatus } : msg
        )
      );
    }
  };

  const joinChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      localStorage.setItem("chat-username", username);
      localStorage.setItem("chat-userId", userIdRef.current);
      setIsJoined(true);
    }
  };

  const clearSavedUser = () => {
    localStorage.removeItem("chat-username");
    localStorage.removeItem("chat-userId");
    setUsername("");
    window.location.reload();
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusIcon = (status?: MessageStatus) => {
    switch (status) {
      case "sending":
        return (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Sending...</span>
          </div>
        );
      case "sent":
        return (
          <div className="flex items-center gap-1 text-xs text-blue-500">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Sent</span>
          </div>
        );
      case "delivered":
        return (
          <div className="flex items-center gap-1 text-xs text-green-500">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Delivered</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-1 text-xs text-red-500">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Failed</span>
          </div>
        );
      default:
        return null;
    }
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/next.svg" alt="Logo" width={100} height={25} />
            <h1 className="text-xl font-semibold text-gray-800">Real-time Chat</h1>
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

      {/* Main Content with Sidebar */}
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-4">
          {/* Online Users Sidebar */}
          <div className="w-72 bg-white rounded-xl shadow-lg overflow-hidden flex-shrink-0">
            <div className="p-4 border-b bg-gradient-to-r from-blue-500 to-indigo-600">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <h3 className="font-semibold text-white">Active Now ({onlineUsers.length})</h3>
              </div>
            </div>
            <div className="h-[calc(500px)] overflow-y-auto">
              {onlineUsers.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No active users
                </div>
              ) : (
                onlineUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors border-b ${
                      user.id === userIdRef.current ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="relative">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold ${
                        user.id === userIdRef.current 
                          ? "bg-gradient-to-br from-green-400 to-green-600"
                          : "bg-gradient-to-br from-blue-400 to-indigo-500"
                      }`}>
                        {user.username && user.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {user.username}
                        {user.id === userIdRef.current && (
                          <span className="ml-2 text-xs text-green-600">(You)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">Active now</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="h-[500px] overflow-y-auto p-4 space-y-3">
              {isLoading && (
                <div className="text-center text-gray-500 mt-8">
                  Loading messages...
                </div>
              )}
              {!isLoading && messages.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                  No messages yet. Start the conversation!
                </div>
              )}
              {messages.map((message) => {
              const reactionCounts = getReactionCounts(message.reactions);
              const uniqueReactions = getUniqueReactions(message.reactions);
              const isHovered = hoveredMessageId === message.id;
            
              return (
                <div
                  key={message.id}
                  className={`flex ${
                    message.userId === userIdRef.current
                      ? "justify-end"
                      : "justify-start"
                  } mb-8`}
                >
                  {/* Wrapper to position reaction picker & bubble together */}
                  <div
                    className="relative max-w-[70%]"
                    onMouseEnter={() => handleMouseEnter(message.id)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {/* Reaction Picker */}
                    {isHovered && (
                      <div
                        className={`absolute -top-12 ${
                          message.userId === userIdRef.current ? "right-0" : "left-0"
                        } bg-white rounded-lg shadow-lg border p-2 flex gap-1 z-20`}
                      >
                        {REACTIONS.map((reaction) => {
                          const isActive = hasUserReacted(message.reactions, reaction);
                          return (
                            <button
                              key={reaction}
                              onClick={() => addReaction(message.id, reaction)}
                              className={`hover:bg-gray-100 p-2 rounded transition-colors text-xl ${
                                isActive ? "bg-blue-100" : ""
                              }`}
                            >
                              {reaction}
                            </button>
                          );
                        })}
                      </div>
                    )}
            
                    {/* Message Bubble */}
                    <div
                      className={`rounded-lg p-3 ${
                        message.userId === userIdRef.current
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">
                          {message.username}
                        </span>
                        <span className="text-xs opacity-75">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                      <p className="break-words">{message.text}</p>
                      {message.userId === userIdRef.current && message.status && (
                        <div className="mt-1 flex justify-end">
                          {getStatusIcon(message.status)}
                        </div>
                      )}
                    </div>
            
                    {/* Reactions Display */}
                    {uniqueReactions.length > 0 && (
                      <div
                        className={`absolute -bottom-6 ${
                          message.userId === userIdRef.current ? "right-0" : "left-0"
                        } flex flex-wrap gap-1`}
                      >
                        {uniqueReactions.map((reaction, idx) => (
                          <div
                            key={idx}
                            className={`inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-sm shadow-sm ${
                              hasUserReacted(message.reactions, reaction.type)
                                ? "border-blue-500 bg-blue-50"
                                : ""
                            }`}
                          >
                            <span>{reaction.type}</span>
                            <span className="text-xs text-gray-600">
                              {reactionCounts[reaction.type]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
