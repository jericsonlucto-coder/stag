"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import Pusher from "pusher-js";

type MessageStatus = "sending" | "sent" | "delivered" | "error";

interface Message {
  id: string;
  text: string;
  username: string;
  timestamp: number;
  userId: string;
  status?: MessageStatus;
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
}

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [username, setUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string>(generateId());
  const userHeartbeatRef = useRef<NodeJS.Timeout | undefined>(undefined);

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
      console.log("Updated last active for user:", username);
    } catch (error) {
      console.error("Error updating last active:", error);
    }
  }, [isJoined, username]);

  // Load online users from Firebase
  const loadOnlineUsers = useCallback(async () => {
    try {
      console.log("Fetching online users from Firebase...");
      const response = await fetch(`${FIREBASE_DB_URL}/users.json`);
      const data: Record<string, any> = await response.json();
      
      console.log("Raw users data from Firebase:", data);
      
      const now = Date.now();
      const activeUsers: User[] = [];
      
      if (data) {
        Object.keys(data).forEach((key) => {
          const user = data[key];
          // Check if user has required properties
          if (user && user.username && user.lastActive) {
            const timeSinceLastActive = now - user.lastActive;
            console.log(`User ${user.username} last active ${timeSinceLastActive}ms ago`);
            
            // Consider users active if they've been active in the last 60 seconds
            if (timeSinceLastActive < 60000) {
              activeUsers.push({
                id: key,
                username: user.username,
                joinedAt: user.joinedAt || now,
                lastActive: user.lastActive,
              });
            } else {
              console.log(`Removing inactive user: ${user.username}`);
              // Remove inactive users
              fetch(`${FIREBASE_DB_URL}/users/${key}.json`, {
                method: "DELETE",
              }).catch(console.error);
            }
          } else {
            console.log("Invalid user data found:", user);
          }
        });
      }
      
      // Sort users: current user first, then others alphabetically
      activeUsers.sort((a, b) => {
        if (a.id === userIdRef.current) return -1;
        if (b.id === userIdRef.current) return 1;
        return (a.username || "").localeCompare(b.username || "");
      });
      
      console.log("Active users found:", activeUsers.length);
      setOnlineUsers(activeUsers);
    } catch (error) {
      console.error("Error loading online users:", error);
    }
  }, []);

  // Load messages from Firebase
  const loadMessages = useCallback(async () => {
    try {
      console.log("Loading messages from Firebase...");
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
            });
          }
        });
      }
      
      loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
      console.log("Loaded messages:", loadedMessages.length);
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
      
      console.log("Registering user:", userData);
      
      const response = await fetch(`${FIREBASE_DB_URL}/users/${userIdRef.current}.json`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });
      
      const result = await response.json();
      console.log("User registration response:", result);
      console.log("User registered successfully:", username);
      
      // Immediately load online users after registration
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
      console.log("Removing user:", username);
      await fetch(`${FIREBASE_DB_URL}/users/${userIdRef.current}.json`, {
        method: "DELETE",
      });
      console.log("User removed:", username);
    } catch (error) {
      console.error("Error removing user:", error);
    }
  }, [username]);

  // Initial load when joining chat
  useEffect(() => {
    if (!isJoined) return;
    
    console.log("User joined chat, registering...");
    registerUser();
    loadMessages();
    
    // Set up heartbeat to update last active every 30 seconds
    userHeartbeatRef.current = setInterval(() => {
      updateLastActive();
      loadOnlineUsers(); // Refresh online users list
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

    console.log("Initializing Pusher...");
    const pusher = new Pusher("bc4bbe143420c20c0e9d", {
      cluster: "ap1",
      authEndpoint: "/api/pusher-auth",
    });

    const channel = pusher.subscribe("private-chat-channel");
    
    channel.bind("new-message", (data: Message) => {
      console.log("New message received via Pusher:", data);
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

    return () => {
      channel.unbind_all();
      channel.unsubscribe();
      pusher.disconnect();
    };
  }, [isJoined]);

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
    };

    console.log("Sending message:", newMessage);
    
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
        console.log("Message sent successfully");
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
        const error = await response.json();
        console.error("Failed to send message:", error);
        setMessages((prevMessages: Message[]) =>
          prevMessages.map((msg) =>
            msg.id === messageId ? { ...msg, status: "error" as MessageStatus } : msg
          )
        );
        
        setTimeout(() => {
          setMessages((prevMessages: Message[]) =>
            prevMessages.map((msg) =>
              msg.id === messageId ? { ...msg, status: undefined } : msg
            )
          );
        }, 3000);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prevMessages: Message[]) =>
        prevMessages.map((msg) =>
          msg.id === messageId ? { ...msg, status: "error" as MessageStatus } : msg
        )
      );
      
      setTimeout(() => {
        setMessages((prevMessages: Message[]) =>
          prevMessages.map((msg) =>
            msg.id === messageId ? { ...msg, status: undefined } : msg
          )
        );
      }, 3000);
    }
  };

  const joinChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      console.log("User joining with username:", username);
      setIsJoined(true);
    }
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
              onClick={() => setIsJoined(false)}
              className="text-sm text-red-500 hover:text-red-600"
            >
              Leave
            </button>
          </div>
        </div>
      </div>

      {/* Main Content with Sidebar */}
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-4">
          {/* Online Users Sidebar - Left */}
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
                      <p className="text-xs text-gray-500">
                        Active now
                      </p>
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
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.userId === userIdRef.current
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
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
                </div>
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
