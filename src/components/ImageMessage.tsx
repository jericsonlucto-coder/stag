"use client";

import { useState } from "react";
import Image from "next/image";

interface ImageMessageProps {
  imageUrl: string;
  username: string;
  timestamp: number;
  text?: string;
  isOwn: boolean;
  onImageClick?: (imageUrl: string) => void;
}

export default function ImageMessage({ 
  imageUrl, 
  username, 
  timestamp, 
  text, 
  isOwn,
  onImageClick 
}: ImageMessageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] sm:max-w-[70%] md:max-w-[60%] rounded-lg p-1.5 sm:p-2.5 ${
          isOwn ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"
        }`}
      >
        <div className="flex items-center gap-1 sm:gap-2 mb-0.5">
          <span className="font-semibold text-[11px] sm:text-sm truncate max-w-[120px] sm:max-w-[200px]">
            {username}
          </span>
          <span className="text-[8px] sm:text-xs opacity-75 flex-shrink-0">
            {formatTime(timestamp)}
          </span>
        </div>
        
        {text && (
          <p className="break-words whitespace-pre-wrap text-[11px] sm:text-sm mb-2">
            {text}
          </p>
        )}
        
        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200 rounded-lg">
              <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-500"></div>
            </div>
          )}
          {error ? (
            <div className="bg-red-100 text-red-600 p-2 sm:p-4 rounded-lg text-center text-[10px] sm:text-sm">
              Failed to load image
            </div>
          ) : (
            <img
              src={imageUrl}
              alt="Shared image"
              className={`rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity ${
                isLoading ? "opacity-0" : "opacity-100"
              }`}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setError(true);
              }}
              onClick={() => onImageClick && onImageClick(imageUrl)}
              style={{ maxHeight: "300px", objectFit: "contain" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}