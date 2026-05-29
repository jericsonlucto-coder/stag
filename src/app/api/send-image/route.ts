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

interface SendImageRequest {
  imageBase64: string;
  text?: string;
  username: string;
  userId: string;
  timestamp: number;
}

interface FirebaseResponse {
  name: string;
}

// Same credentials as your other endpoints
const PUSHER_APP_ID = "2159204";
const PUSHER_KEY = "bc4bbe143420c20c0e9d";
const PUSHER_SECRET = "bbd18207d17c2f39529e";
const PUSHER_CLUSTER = "ap1";

const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";

// Store image directly in Firebase as base64
async function storeImageInFirebase(base64Image: string, messageId: string): Promise<string> {
  // Validate base64 format
  if (!base64Image.startsWith('data:image/')) {
    throw new Error('Invalid image format');
  }
  
  // Get image size for logging
  const imageSize = base64Image.length;
  const sizeInKB = (imageSize / 1024).toFixed(2);
  console.log(`Storing image size: ${sizeInKB} KB (base64)`);
  
  // Store in Firebase - use PUT to create/update at specific path
  const imageResponse = await fetch(`${FIREBASE_DB_URL}/images/${messageId}.json`, {
    method: "PUT",
    headers: { 
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: base64Image,
      size: imageSize,
      timestamp: Date.now(),
      contentType: base64Image.split(';')[0].split(':')[1] // Extract MIME type
    }),
  });
  
  if (!imageResponse.ok) {
    const errorText = await imageResponse.text();
    console.error("Firebase image store error:", errorText);
    throw new Error(`Failed to store image: ${imageResponse.status}`);
  }
  
  // Return the URL to access the image
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
    
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    
    if (!username || !userId) {
      return NextResponse.json({ error: "Missing user information" }, { status: 400 });
    }
    
    const messageId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    
    // Store image in Firebase
    let imageUrl;
    try {
      imageUrl = await storeImageInFirebase(imageBase64, messageId);
      console.log("Image stored in Firebase successfully");
    } catch (error) {
      console.error("Image storage failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to store image";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
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
    
    // Save message metadata to Firebase messages node
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
    
    if (!firebaseResponse.ok) {
      console.error("Firebase save error:", await firebaseResponse.text());
      return NextResponse.json({ error: "Failed to save message to Firebase" }, { status: 500 });
    }
    
    const firebaseResult: FirebaseResponse = await firebaseResponse.json();
    console.log("Saved message to Firebase with ID:", firebaseResult.name);
    
    // Trigger Pusher event
    const payload = {
      name: "new-image",
      channel: "private-chat-channel",
      data: JSON.stringify({ 
        id: messageId,
        imageUrl: imageMessage.imageUrl,
        text: imageMessage.text,
        username: imageMessage.username,
        timestamp: imageMessage.timestamp,
        userId: imageMessage.userId,
        type: "image"
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
      console.error("Pusher API error:", errorText);
      // Still return success since Firebase saved
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
