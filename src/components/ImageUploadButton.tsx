"use client";

import { useRef, useState, useEffect } from 'react';

interface ImageUploadButtonProps {
  onImageSelect: (base64: string, file: File) => void;
  disabled?: boolean;
}

export default function ImageUploadButton({ onImageSelect, disabled }: ImageUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const processImage = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return false;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return false;
    }
    
    setIsUploading(true);
    
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelect(reader.result as string, file);
        setIsUploading(false);
      };
      reader.onerror = () => {
        alert('Failed to read image file');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
      return true;
    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process image');
      setIsUploading(false);
      return false;
    }
  };
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImage(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await processImage(file);
        }
        break;
      }
    }
  };
  
  useEffect(() => {
    // Add paste event listener to the whole window
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);
  
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />
      
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isUploading}
        className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
          disabled || isUploading
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-gray-100 hover:bg-gray-200'
        }`}
        title="Upload image (Ctrl+V to paste)"
      >
        {isUploading ? (
          <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-gray-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </>
  );
}