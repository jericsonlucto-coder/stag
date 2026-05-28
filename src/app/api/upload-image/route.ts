import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Image size should be less than 2MB" }, { status: 400 });
    }
    
    // Convert file to base64 with compression
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const mimeType = file.type;
    
    // Create compressed image URL
    const imageUrl = `data:${mimeType};base64,${base64}`;
    
    // Log size for debugging
    console.log(`Image uploaded: ${file.name}, size: ${(base64.length / 1024).toFixed(2)}KB`);
    
    return NextResponse.json({ url: imageUrl, success: true });
  } catch (error) {
    console.error("Error uploading image:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
