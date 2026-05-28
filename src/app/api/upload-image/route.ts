import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No image provided", success: false }, { status: 400 });
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: "File must be an image", success: false }, { status: 400 });
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Image size should be less than 2MB", success: false }, { status: 400 });
    }
    
    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const mimeType = file.type;
    const imageUrl = `data:${mimeType};base64,${base64}`;
    
    console.log(`Image uploaded successfully: ${file.name}, size: ${(base64.length / 1024).toFixed(2)}KB`);
    
    return NextResponse.json({ 
      url: imageUrl, 
      success: true 
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    return NextResponse.json(
      { error: "Failed to upload image", success: false },
      { status: 500 }
    );
  }
}
