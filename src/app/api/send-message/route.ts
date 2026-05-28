import { NextResponse } from "next/server";

// Your Pusher credentials
const PUSHER_APP_ID = "2159204";
const PUSHER_KEY = "bc4bbe143420c20c0e9d";
const PUSHER_SECRET = "bbd18207d17c2f39529e";
const PUSHER_CLUSTER = "ap1";

// Your Firebase Realtime Database URL (get from Firebase Console)
const FIREBASE_DB_URL = "https://your-project-default-rtdb.firebaseio.com";

async function getPusherAuthSignature(socketId: string, channelName: string, appSecret: string, appKey: string) {
  const stringToSign = `${socketId}:${channelName}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const msgData = encoder.encode(stringToSign);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", 
    keyData, 
    { name: "HMAC", hash: "SHA-256" }, 
    false, 
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return `${appKey}:${signatureHex}`;
}

async function getSignature(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getMD5(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const message = await request.json();
    
    // Save to Firebase Realtime Database
    const firebaseResponse = await fetch(`${FIREBASE_DB_URL}/messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message.text,
        username: message.username,
        timestamp: message.timestamp,
        userId: message.userId,
        createdAt: new Date().toISOString()
      }),
    });
    
    if (!firebaseResponse.ok) {
      console.error("Firebase save error:", await firebaseResponse.text());
    }
    
    // Create the payload for Pusher HTTP API
    const payload = {
      name: "new-message",
      channel: "private-chat-channel",
      data: JSON.stringify(message)
    };
    
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyString = JSON.stringify(payload);
    const path = `/apps/${PUSHER_APP_ID}/events`;
    const queryString = `auth_key=${PUSHER_KEY}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${await getMD5(bodyString)}`;
    const stringToSign = `POST\n${path}\n${queryString}`;
    const signature = await getSignature(PUSHER_SECRET, stringToSign);
    
    const response = await fetch(`https://api-${PUSHER_CLUSTER}.pusher.com${path}?${queryString}&auth_signature=${signature}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: bodyString,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Pusher API error:", errorText);
      return NextResponse.json(
        { error: `Pusher error: ${response.status}` },
        { status: response.status }
      );
    }
    
    const result = await response.json();
    return NextResponse.json({ success: true, result });
    
  } catch (error) {
    console.error("Error sending message:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to send message", details: errorMessage },
      { status: 500 }
    );
  }
}
