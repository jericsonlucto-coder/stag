import { NextResponse } from "next/server";

interface Message {
  id: string;
  text: string;
  username: string;
  timestamp: number;
  userId: string;
  imageUrl?: string;
  isImage?: boolean;
  reactions?: any[];
}

interface FirebaseResponse {
  name: string;
}

// Your Pusher credentials
const PUSHER_APP_ID = "2159204";
const PUSHER_KEY = "bc4bbe143420c20c0e9d";
const PUSHER_SECRET = "bbd18207d17c2f39529e";
const PUSHER_CLUSTER = "ap1";

// Your Firebase Database URL
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

async function getMD5(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const message: Message = await request.json();
    console.log("Received message to save:", { ...message, imageUrl: message.imageUrl ? "present" : "none" });
    
    // Create the data to save to Firebase
    const messageData: any = {
      text: message.text || "",
      username: message.username,
      timestamp: message.timestamp,
      userId: message.userId,
      createdAt: new Date().toISOString(),
    };
    
    // Include image data if present
    if (message.isImage && message.imageUrl) {
      messageData.isImage = true;
      messageData.imageUrl = message.imageUrl;
      console.log("Saving image message to Firebase");
    }
    
    // Save to Firebase Realtime Database
    const firebaseResponse = await fetch(`${FIREBASE_DB_URL}/messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageData),
    });
    
    const firebaseResult: FirebaseResponse = await firebaseResponse.json();
    console.log("Firebase save result:", firebaseResult);
    
    if (!firebaseResponse.ok) {
      console.error("Firebase save error:", firebaseResult);
      return NextResponse.json(
        { error: "Failed to save to Firebase", details: firebaseResult },
        { status: 500 }
      );
    }
    
    // Create the payload for Pusher with ALL message data
    const pusherMessage = {
      id: firebaseResult.name,
      text: message.text || "",
      username: message.username,
      timestamp: message.timestamp,
      userId: message.userId,
      isImage: message.isImage || false,
      imageUrl: message.imageUrl || null,
      reactions: message.reactions || [],
    };
    
    console.log("Broadcasting to Pusher:", { 
      id: pusherMessage.id, 
      username: pusherMessage.username, 
      isImage: pusherMessage.isImage,
      hasImageUrl: !!pusherMessage.imageUrl
    });
    
    const payload = {
      name: "new-message",
      channel: "private-chat-channel",
      data: JSON.stringify(pusherMessage)
    };
    
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyString = JSON.stringify(payload);
    const path = `/apps/${PUSHER_APP_ID}/events`;
    const queryString = `auth_key=${PUSHER_KEY}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${await getMD5(bodyString)}`;
    const stringToSign = `POST\n${path}\n${queryString}`;
    const signature = await getSignature(PUSHER_SECRET, stringToSign);
    
    const pusherResponse = await fetch(`https://api-${PUSHER_CLUSTER}.pusher.com${path}?${queryString}&auth_signature=${signature}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: bodyString,
    });
    
    if (!pusherResponse.ok) {
      const errorText = await pusherResponse.text();
      console.error("Pusher API error:", errorText);
      return NextResponse.json({ 
        success: true, 
        warning: "Saved to Firebase but Pusher notification failed",
        firebaseId: firebaseResult.name 
      });
    }
    
    const pusherResult = await pusherResponse.json();
    console.log("Pusher send result:", pusherResult);
    
    return NextResponse.json({ 
      success: true, 
      pusher: pusherResult,
      firebaseId: firebaseResult.name 
    });
    
  } catch (error) {
    console.error("Error sending message:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to send message", details: errorMessage },
      { status: 500 }
    );
  }
}
