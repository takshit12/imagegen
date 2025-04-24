import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Star, ThumbsUp, ThumbsDown } from "lucide-react";
import { useState } from "react";

interface CreativeProps {
  creative: {
    id: string;
    headline: string;
    description: string;
    imageUrl: string;
    style: string;
    variation: number;
  };
}

export default function CreativePreview({ creative }: CreativeProps) {
  const [isFavorite, setIsFavorite] = useState(false);

  return (
    <Card className="overflow-hidden border-gray-200 hover:shadow-md transition-shadow">
      <div className="relative">
        <img
          src={creative.imageUrl}
          alt={`Creative variation ${creative.variation}`}
          className="w-full h-48 object-cover"
        />
        <Badge
          variant="secondary"
          className="absolute top-2 right-2 bg-white/90 text-black"
        >
          Variation {creative.variation}
        </Badge>
      </div>

      <CardContent className="p-4">
        <h3 className="font-semibold text-lg mb-2 line-clamp-2">
          {creative.headline}
        </h3>
        <p className="text-gray-600 text-sm line-clamp-3">
          {creative.description}
        </p>

        <div className="flex items-center mt-3 text-xs text-gray-500">
          <span className="bg-gray-100 px-2 py-1 rounded-full">
            {creative.style}
          </span>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between p-4 pt-0 gap-2">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFavorite(!isFavorite)}
          >
            <Star
              className={`h-4 w-4 ${isFavorite ? "fill-yellow-400 text-yellow-400" : ""}`}
            />
          </Button>
          <Button variant="ghost" size="icon">
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-3 w-3" />
          Download
        </Button>
      </CardFooter>
    </Card>
  );
}
