import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Star, ThumbsUp, ThumbsDown, GripVertical } from "lucide-react";
import { useState } from "react";

interface CreativeProps {
  creative: {
    id: string;
    headline: string;
    description: string;
    b64_json?: string;
    imageUrl?: string;
    style: string;
    variation: number;
  };
}

export default function CreativePreview({ creative }: CreativeProps) {
  const [isFavorite, setIsFavorite] = useState(false);

  const imageSrc = creative.imageUrl
    ? creative.imageUrl
    : `data:image/png;base64,${creative.b64_json}`;

  // Function to handle downloading the individual image
  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = imageSrc;
    // Suggest a filename (e.g., based on headline and variation)
    const filename = `${creative.headline.replace(/\s+/g, '_').toLowerCase()}_var${creative.variation}.png`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle drag start event
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    // Set data to transfer (e.g., the creative object as JSON)
    e.dataTransfer.setData("application/json", JSON.stringify(creative));
    e.dataTransfer.effectAllowed = "copy"; // Indicate copying is allowed
  };

  return (
    <Card
      draggable
      onDragStart={handleDragStart}
      className="overflow-hidden bg-white/5 backdrop-blur-xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 ease-in-out relative group cursor-grab rounded-xl border-0 text-gray-200"
    >
      <GripVertical className="absolute top-2 left-2 text-gray-400/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200" size={18} />

      <div className="relative">
        <img
          src={imageSrc}
          alt={`Creative variation ${creative.variation}`}
          className="w-full h-48 object-cover"
        />
        <Badge
          variant="secondary"
          className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-gray-200 text-xs border-0 px-2 py-0.5 rounded-md"
        >
          Variation {creative.variation}
        </Badge>
      </div>

      <CardContent className="p-3 space-y-1.5">
        <h3 className="font-semibold text-sm text-white line-clamp-2">
          {creative.headline}
        </h3>
        <p className="text-gray-300/90 text-xs line-clamp-3">
          {creative.description}
        </p>

        <div className="flex items-center pt-1 text-xs text-gray-400">
          <span className="bg-white/5 px-2 py-0.5 rounded-full border-0">
            {creative.style}
          </span>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between p-2 pt-1 gap-1 border-t border-white/10 mt-2">
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => setIsFavorite(!isFavorite)} className="text-gray-400 hover:text-yellow-400 hover:bg-white/5 h-7 w-7 rounded-full">
            <Star className={`h-4 w-4 ${isFavorite ? "fill-yellow-400" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/5 h-7 w-7 rounded-full">
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/5 h-7 w-7 rounded-full">
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} className="bg-white/5 hover:bg-white/10 border-0 text-gray-300 backdrop-blur-sm text-xs px-3 py-1 rounded-md h-7">
          <Download className="mr-1.5 h-3 w-3" />
          Download
        </Button>
      </CardFooter>
    </Card>
  );
}
