import { NextResponse } from "next/server";

const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";

export async function POST(request: Request) {
  try {
    const { imageData, messageId } = await request.json();
    
    if (!imageData || !messageId) {
      return NextResponse.json({ error: "Missing image data" }, { status: 400 });
    }
    
    // Store the image in a separate Firebase path
    const imageResponse = await fetch(`${FIREBASE_DB_URL}/images/${messageId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full: imageData.full,
        thumbnail: imageData.thumbnail,
        timestamp: Date.now(),
      }),
    });
    
    if (!imageResponse.ok) {
      throw new Error("Failed to store image");
    }
    
    return NextResponse.json({ success: true, messageId });
    
  } catch (error) {
    console.error("Error uploading image:", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}