import { NextResponse } from "next/server";

interface ImageMessage {
  id: string;
  imageUrl: string;
  imageStoragePath: string;
  text?: string;
  username: string;
  timestamp: number;
  userId: string;
}

// Same credentials as your other endpoints
const PUSHER_APP_ID = "2159204";
const PUSHER_KEY = "bc4bbe143420c20c0e9d";
const PUSHER_SECRET = "bbd18207d17c2f39529e";
const PUSHER_CLUSTER = "ap1";

const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";

// Compress and optimize image
function compressImage(base64Image: string, maxWidth: number = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    // This would need to be done client-side or with a library
    // For server-side, we'll just store the original for now
    resolve(base64Image);
  });
}

// Store image in Firebase as a separate node
async function storeImageInFirebase(base64Image: string, messageId: string): Promise<string> {
  // Check image size and compress if needed
  const imageSize = base64Image.length;
  console.log(`Original image size: ${(imageSize / 1024).toFixed(2)} KB`);
  
  // For large images, we'll store them in a separate "images" node
  const imageResponse = await fetch(`${FIREBASE_DB_URL}/images/${messageId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: base64Image,
      size: imageSize,
      timestamp: Date.now(),
    }),
  });
  
  if (!imageResponse.ok) {
    throw new Error('Failed to store image');
  }
  
  // Return the URL to fetch the image
  return `${FIREBASE_DB_URL}/images/${messageId}.json`;
}

// Function to get image URL for displaying
function getImageDisplayUrl(messageId: string): string {
  return `${FIREBASE_DB_URL}/images/${messageId}.json`;
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
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageBase64, text, username, userId, timestamp } = body;
    
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    
    const messageId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    
    // Store image in Firebase
    let imageUrl;
    try {
      imageUrl = await storeImageInFirebase(imageBase64, messageId);
      console.log("Image stored in Firebase successfully");
    } catch (error) {
      console.error("Image storage failed:", error);
      return NextResponse.json({ error: "Failed to store image" }, { status: 500 });
    }
    
    const imageMessage: ImageMessage = {
      id: messageId,
      imageUrl: getImageDisplayUrl(messageId),
      imageStoragePath: `images/${messageId}`,
      text: text || "",
      username,
      timestamp: timestamp || Date.now(),
      userId,
    };
    
    // Save message metadata to Firebase
    const firebaseResponse = await fetch(`${FIREBASE_DB_URL}/messages.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "image",
        imageUrl: imageMessage.imageUrl,
        imageStoragePath: imageMessage.imageStoragePath,
        text: imageMessage.text,
        username: imageMessage.username,
        timestamp: imageMessage.timestamp,
        userId: imageMessage.userId,
        createdAt: new Date().toISOString()
      }),
    });
    
    const firebaseResult = await firebaseResponse.json();
    
    if (!firebaseResponse.ok) {
      console.error("Firebase save error:", firebaseResult);
      return NextResponse.json({ error: "Failed to save to Firebase" }, { status: 500 });
    }
    
    // Trigger Pusher event
    const payload = {
      name: "new-image",
      channel: "private-chat-channel",
      data: JSON.stringify({ 
        ...imageMessage, 
        id: messageId
      })
    };
    
    const timestamp_pusher = Math.floor(Date.now() / 1000);
    const bodyString = JSON.stringify(payload);
    const path = `/apps/${PUSHER_APP_ID}/events`;
    const queryString = `auth_key=${PUSHER_KEY}&auth_timestamp=${timestamp_pusher}&auth_version=1.0&body_md5=${await getMD5(bodyString)}`;
    const stringToSign = `POST\n${path}\n${queryString}`;
    const signature = await getSignature(PUSHER_SECRET, stringToSign);
    
    const pusherResponse = await fetch(`https://api-${PUSHER_CLUSTER}.pusher.com${path}?${queryString}&auth_signature=${signature}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyString,
    });
    
    if (!pusherResponse.ok) {
      const errorText = await pusherResponse.text();
      console.error("Pusher API error:", errorText);
      return NextResponse.json({ 
        success: true, 
        message: imageMessage,
        firebaseId: firebaseResult.name,
        warning: "Saved but Pusher notification failed"
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: imageMessage,
      firebaseId: firebaseResult.name 
    });
    
  } catch (error) {
    console.error("Error sending image:", error);
    return NextResponse.json(
      { error: "Failed to send image", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
