"use client";

import { useState, useEffect } from 'react';

interface ImageMessageProps {
  imageUrl: string;
  text?: string;
  username: string;
  timestamp: number;
  isOwn: boolean;
  onImageClick?: (url: string) => void;
}

interface FirebaseImageData {
  data: string;
  size: number;
  timestamp: number;
  contentType?: string;
}

export default function ImageMessage({ 
  imageUrl, 
  text, 
  username, 
  timestamp, 
  isOwn,
  onImageClick 
}: ImageMessageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  
  const formatTime = (timestamp: number) => 
    new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  
  useEffect(() => {
    // Fetch image from Firebase
    const fetchImage = async () => {
      try {
        console.log("Fetching image from:", imageUrl);
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: FirebaseImageData = await response.json();
        
        if (data && data.data && typeof data.data === 'string' && data.data.startsWith('data:image/')) {
          setImageDataUrl(data.data);
          console.log("Image loaded successfully");
        } else {
          console.error("Invalid image data format:", data);
          setImageError(true);
        }
      } catch (error) {
        console.error('Error loading image:', error);
        setImageError(true);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (imageUrl) {
      fetchImage();
    } else {
      setIsLoading(false);
      setImageError(true);
    }
  }, [imageUrl]);
  
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2 sm:mb-3`}>
      <div className={`max-w-[85%] sm:max-w-[70%] md:max-w-[60%]`}>
        <div
          className={`rounded-lg p-2 sm:p-3 ${
            isOwn ? "bg-blue-500" : "bg-gray-100"
          } overflow-hidden`}
        >
          <div className="flex items-center gap-1 sm:gap-2 mb-2">
            <span className={`font-semibold text-[11px] sm:text-sm truncate max-w-[120px] sm:max-w-[200px] ${isOwn ? "text-white" : "text-gray-800"}`}>
              {username}
            </span>
            <span className={`text-[8px] sm:text-xs ${isOwn ? "text-blue-100" : "text-gray-500"}`}>
              {formatTime(timestamp)}
            </span>
          </div>
          
          {/* Image Container */}
          <div className="relative mb-2">
            {isLoading && (
              <div className="w-full h-48 bg-gray-200 rounded-lg animate-pulse flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            
            {!imageError && imageDataUrl && (
              <img
                src={imageDataUrl}
                alt="Shared image"
                className={`rounded-lg max-w-full max-h-96 object-contain cursor-pointer hover:opacity-90 transition-opacity`}
                onClick={() => onImageClick?.(imageDataUrl)}
                onError={(e) => {
                  console.error("Image failed to load:", e);
                  setImageError(true);
                  setIsLoading(false);
                }}
              />
            )}
            
            {imageError && !isLoading && (
              <div className="w-full h-48 bg-red-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-8 h-8 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-500 text-sm">Failed to load image</p>
                </div>
              </div>
            )}
          </div>
          
          {text && (
            <p className={`break-words whitespace-pre-wrap text-[11px] sm:text-sm ${isOwn ? "text-white" : "text-gray-800"}`}>
              {text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
