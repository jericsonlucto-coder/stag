import { useState, useCallback } from "react";

interface ImageUploadResult {
  uploadImage: (file: File, caption: string, username: string, userId: string) => Promise<string | null>;
  isUploading: boolean;
  error: string | null;
}

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 9);

export function useImageUpload(): ImageUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadImage = useCallback(async (
    file: File, 
    caption: string, 
    username: string, 
    userId: string
  ): Promise<string | null> => {
    setIsUploading(true);
    setError(null);

    try {
      const messageId = generateId();
      const formData = new FormData();
      formData.append("image", file);
      formData.append("username", username);
      formData.append("userId", userId);
      formData.append("text", caption);
      formData.append("messageId", messageId);

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload image");
      }

      return data.messageId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error uploading image:", err);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { uploadImage, isUploading, error };
}