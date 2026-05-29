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

// Upload to imgBB (free, no env needed)
async function uploadToImgBB(base64Image: string): Promise<string> {
  // Remove the data:image/xxx;base64, prefix if present
  const base64Data = base64Image.includes('base64,') 
    ? base64Image.split('base64,')[1] 
    : base64Image;
  
  const formData = new FormData();
  formData.append('image', base64Data);
  
  // Using a demo key - you should register for your own free key at https://api.imgbb.com/
  // This key is for testing only, please replace with your own
  const response = await fetch('https://api.imgbb.com/1/upload?key=YOUR_IMGBB_API_KEY', {
    method: 'POST',
    body: formData,
  });
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error('Image upload failed: ' + data.error?.message);
  }
  
  return data.data.url;
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
    
    // Upload image to imgBB
    let imageUrl;
    try {
      imageUrl = await uploadToImgBB(imageBase64);
      console.log("Image uploaded successfully:", imageUrl);
    } catch (error) {
      console.error("Image upload failed:", error);
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }
    
    const imageMessage: ImageMessage = {
      id: messageId,
      imageUrl,
      imageStoragePath: `images/${messageId}`,
      text: text || "",
      username,
      timestamp: timestamp || Date.now(),
      userId,
    };
    
    // Save to Firebase Database
    const firebaseResponse = await fetch(`${FIREBASE_DB_URL}/messages.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "image",
        imageUrl: imageMessage.imageUrl,
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
    
    console.log("Saved to Firebase with ID:", firebaseResult.name);
    
    // Trigger Pusher event
    const payload = {
      name: "new-image",
      channel: "private-chat-channel",
      data: JSON.stringify({ ...imageMessage, id: messageId })
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
      // Still return success since Firebase saved
      return NextResponse.json({ 
        success: true, 
        message: imageMessage,
        firebaseId: firebaseResult.name,
        warning: "Saved but Pusher notification failed"
      });
    }
    
    const pusherResult = await pusherResponse.json();
    console.log("Pusher send result:", pusherResult);
    
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