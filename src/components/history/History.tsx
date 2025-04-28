import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HistoryInfinite from "./HistoryInfinite";
import GalleryView from "./GalleryView";
import { Grid3x3, List } from 'lucide-react';

export default function History() {
  const [view, setView] = useState('gallery');

  return (
    <div className="h-full w-full">
      <Tabs value={view} onValueChange={setView} className="w-full">
        <div className="flex justify-center mb-6">
          <TabsList className="inline-flex h-auto items-center justify-center rounded-lg bg-white/5 backdrop-blur-md p-1 text-gray-400">
            <TabsTrigger value="gallery" className="px-4 py-2 text-sm data-[state=active]:text-white data-[state=active]:bg-white/10 rounded-md transition-colors flex items-center gap-2">
              <Grid3x3 size={16} />
              Gallery View
            </TabsTrigger>
            <TabsTrigger value="list" className="px-4 py-2 text-sm data-[state=active]:text-white data-[state=active]:bg-white/10 rounded-md transition-colors flex items-center gap-2">
              <List size={16} />
              List View
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="gallery" className="mt-2">
          <GalleryView />
        </TabsContent>

        <TabsContent value="list" className="mt-2">
          <HistoryInfinite />
        </TabsContent>
      </Tabs>
    </div>
  );
} 