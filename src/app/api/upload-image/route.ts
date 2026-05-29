import { NextResponse } from "next/server";

interface ImageMessage {
  id: string;
  imageUrl: string;
  username: string;
  timestamp: number;
  userId: string;
  text?: string;
}

const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    const username = formData.get("username") as string;
    const userId = formData.get("userId") as string;
    const text = formData.get("text") as string || "";
    const messageId = formData.get("messageId") as string;

    if (!file || !username || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const imageUrl = `data:${file.type};base64,${base64Image}`;

    // Save to Firebase
    const imageMessage: ImageMessage = {
      id: messageId,
      imageUrl,
      username,
      timestamp: Date.now(),
      userId,
      text: text || undefined,
    };

    const firebaseResponse = await fetch(`${FIREBASE_DB_URL}/messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "image",
        imageUrl,
        username,
        timestamp: imageMessage.timestamp,
        userId,
        text: text || undefined,
        createdAt: new Date().toISOString()
      }),
    });

    const firebaseResult = await firebaseResponse.json();

    if (!firebaseResponse.ok) {
      return NextResponse.json(
        { error: "Failed to save to Firebase" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      messageId: firebaseResult.name,
      imageUrl 
    });

  } catch (error) {
    console.error("Error uploading image:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}