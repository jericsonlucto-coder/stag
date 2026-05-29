import { NextResponse } from "next/server";

const FIREBASE_DB_URL = "https://chatto-659ec-default-rtdb.firebaseio.com";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const before = searchParams.get("before");
    
    // Fetch messages
    let messagesUrl = `${FIREBASE_DB_URL}/messages.json?orderBy="$key"`;
    if (before) {
      messagesUrl += `&endBefore="${before}"`;
    }
    messagesUrl += `&limitToLast=${limit}`;
    
    const messagesRes = await fetch(messagesUrl);
    const messagesData = await messagesRes.json();
    
    // Fetch all images
    const imagesRes = await fetch(`${FIREBASE_DB_URL}/images.json`);
    const imagesData = await imagesRes.json();
    
    // Combine messages with images
    const combinedMessages = [];
    if (messagesData && typeof messagesData === 'object') {
      for (const [id, msg] of Object.entries(messagesData)) {
        const message: any = {
          id,
          text: (msg as any).text || "",
          username: (msg as any).username || "",
          timestamp: (msg as any).timestamp || Date.now(),
          userId: (msg as any).userId || "",
          type: (msg as any).type || "text",
          imageId: (msg as any).imageId,
          reactions: (msg as any).reactions || [],
          status: "delivered",
        };
        
        // Attach image data if it's an image message
        if (message.type === "image" && message.imageId && imagesData) {
          const imageData = (imagesData as any)[message.imageId];
          if (imageData && imageData.full && imageData.thumbnail) {
            message.imageUrl = imageData.full;
            message.imageThumbnail = imageData.thumbnail;
          }
        }
        
        combinedMessages.push(message);
      }
    }
    
    // Sort by timestamp (oldest first)
    combinedMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    return NextResponse.json({ 
      success: true, 
      messages: combinedMessages,
      count: combinedMessages.length 
    });
    
  } catch (error) {
    console.error("Error getting messages:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to get messages",
      messages: [],
      count: 0
    });
  }
}
