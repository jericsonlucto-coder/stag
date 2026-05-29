import { NextResponse } from "next/server";

interface SendImageRequest {
  imageBase64: string;
  text?: string;
  username: string;
  userId: string;
  timestamp: number;
}

const PUSHER_APP_ID = "2159204";
const PUSHER_KEY = "bc4bbe143420c20c0e9d";
const PUSHER_SECRET = "bbd18207d17c2f39529e";
const PUSHER_CLUSTER = "ap1";
const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";

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

async function getSHA256(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const body: SendImageRequest = await request.json();
    const { imageBase64, text, username, userId, timestamp } = body;
    
    console.log("Received image request:", { username, userId, textLength: text?.length, imageLength: imageBase64?.length });
    
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    
    if (!username || !userId) {
      return NextResponse.json({ error: "Missing user information" }, { status: 400 });
    }
    
    const messageId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    
    // Create message object similar to your text messages
    const messageData = {
      type: "image",
      imageBase64: imageBase64,
      text: text || "",
      username: username,
      timestamp: timestamp || Date.now(),
      userId: userId,
      createdAt: new Date().toISOString()
    };
    
    console.log("Saving to Firebase:", { messageId, type: messageData.type, username: messageData.username });
    
    // Save to Firebase
    const firebaseResponse = await fetch(`${FIREBASE_DB_URL}/messages.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messageData),
    });
    
    if (!firebaseResponse.ok) {
      const errorText = await firebaseResponse.text();
      console.error("Firebase error:", errorText);
      return NextResponse.json({ error: "Failed to save to Firebase", details: errorText }, { status: 500 });
    }
    
    const firebaseResult = await firebaseResponse.json();
    console.log("Saved to Firebase successfully with ID:", firebaseResult.name);
    
    // Trigger Pusher event
    const payload = {
      name: "new-image",
      channel: "private-chat-channel",
      data: JSON.stringify({
        id: messageId,
        type: "image",
        imageBase64: imageBase64,
        text: text || "",
        username: username,
        timestamp: timestamp || Date.now(),
        userId: userId
      })
    };
    
    const timestamp_pusher = Math.floor(Date.now() / 1000);
    const bodyString = JSON.stringify(payload);
    const path = `/apps/${PUSHER_APP_ID}/events`;
    const bodyMd5 = await getSHA256(bodyString);
    const queryString = `auth_key=${PUSHER_KEY}&auth_timestamp=${timestamp_pusher}&auth_version=1.0&body_md5=${bodyMd5}`;
    const stringToSign = `POST\n${path}\n${queryString}`;
    const signature = await getSignature(PUSHER_SECRET, stringToSign);
    
    const pusherResponse = await fetch(`https://api-${PUSHER_CLUSTER}.pusher.com${path}?${queryString}&auth_signature=${signature}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyString,
    });
    
    if (!pusherResponse.ok) {
      const errorText = await pusherResponse.text();
      console.error("Pusher error:", errorText);
    } else {
      console.log("Pusher notification sent successfully");
    }
    
    return NextResponse.json({
      success: true,
      message: {
        id: messageId,
        imageBase64: imageBase64,
        text: text || "",
        username: username,
        timestamp: timestamp || Date.now(),
        userId: userId,
        type: "image"
      },
      firebaseId: firebaseResult.name
    });
    
  } catch (error) {
    console.error("Error in send-image:", error);
    return NextResponse.json(
      { error: "Failed to send image", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
