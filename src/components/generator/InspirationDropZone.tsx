import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XIcon, ImageIcon } from "lucide-react";

// Define the structure for the generated creative data
interface GeneratedCreative {
  id: string;
  headline: string;
  description: string;
  b64_json: string;
  style: string;
  variation: number;
  audience: string;
}

interface InspirationDropZoneProps {
  inspirationImages: GeneratedCreative[];
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveImage: (id: string) => void;
  onUploadClick: () => void;
}

export function InspirationDropZone({
  inspirationImages,
  onDrop,
  onDragOver,
  onRemoveImage,
  onUploadClick,
}: InspirationDropZoneProps) {
  return (
    <Card
      onDrop={onDrop}
      onDragOver={onDragOver}
      className="mt-6 bg-white/5 backdrop-blur-xl shadow-2xl rounded-xl border-0"
    >
      <CardContent className="p-6">
        <div className="text-center mb-4">
          <h4 className="text-base font-medium text-gray-100">
            Drop or Upload Inspiration Images (Max 10)
          </h4>
          <p className="text-xs text-gray-400 mt-1">
            Drag generated creatives or upload local files.
          </p>
        </div>
        <div className="min-h-[100px] flex flex-wrap gap-3 items-center justify-center p-3 bg-black/20 rounded-lg shadow-inner">
          {inspirationImages.length === 0 && (
            <div className="text-center text-gray-500 py-4 flex flex-col items-center">
              <ImageIcon className="mx-auto h-8 w-8 mb-2 text-gray-600" />
              <p className="text-sm font-medium mb-2">Drop images here</p>
              <p className="text-xs text-gray-600 mb-2">or</p>
              <Button 
                variant="outline"
                size="sm"
                onClick={onUploadClick}
                className="bg-white/5 hover:bg-white/10 border-0 text-gray-300 backdrop-blur-sm text-xs px-3 py-1.5 rounded-md"
              >
                Upload Files
              </Button>
            </div>
          )}
          {inspirationImages.map((img) => (
            <div key={img.id} className="relative group w-24 h-24 rounded-lg overflow-hidden shadow-lg bg-black/20">
              <img
                src={`data:image/png;base64,${img.b64_json}`}
                alt={`Inspiration ${img.id}`}
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 opacity-50 group-hover:opacity-100 transition-opacity duration-200 scale-90 hover:scale-100 bg-black/40 hover:bg-red-800/80 text-white rounded-full border-0 p-1"
                onClick={() => onRemoveImage(img.id)}
                aria-label="Remove inspiration image"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 