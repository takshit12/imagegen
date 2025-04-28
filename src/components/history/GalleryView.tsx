import { useEffect, useState } from 'react';
import { supabase } from '../../../supabase/supabase';
import CreativePreview from '@/components/generator/CreativePreview';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Search, Loader2, Grid3x3, Download } from 'lucide-react';

interface DbImage {
  id: string;
  path: string;
  prompt: string;
  size: string;
  created_at: string;
  exec_id: string;
}

export default function GalleryView() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadImages();
  }, [sortBy, dateFilter]);

  async function loadImages() {
    try {
      setLoading(true);
      
      let query = supabase
        .from('generated_images')
        .select('*');
      
      // Apply date filter if selected
      if (dateFilter) {
        const startDate = new Date(dateFilter);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(dateFilter);
        endDate.setHours(23, 59, 59, 999);
        
        query = query
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString());
      }
      
      // Apply sorting
      if (sortBy === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sortBy === 'oldest') {
        query = query.order('created_at', { ascending: true });
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw error;
      }
      
      if (!data || data.length === 0) {
        setImages([]);
        setLoading(false);
        return;
      }
      
      // Create signed URLs
      const signedResults = await Promise.all(
        data.map(async (row: DbImage) => {
          try {
            const { data: signed } = await supabase.storage
              .from('generated-images')
              .createSignedUrl(row.path, 60 * 60);
              
            return {
              id: row.id,
              headline: row.prompt?.substring(0, 50) || 'Generated',
              description: row.prompt || '',
              imageUrl: signed?.signedUrl,
              style: 'gallery',
              variation: 0,
              audience: '',
              created_at: row.created_at,
              exec_id: row.exec_id
            };
          } catch (err) {
            console.error(`Error signing URL for ${row.path}:`, err);
            return null;
          }
        })
      );
      
      // Filter out nulls (failed signs)
      let validResults = signedResults.filter(Boolean);
      
      // Apply search filter if needed
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        validResults = validResults.filter(img => 
          img.headline.toLowerCase().includes(query) || 
          img.description.toLowerCase().includes(query)
        );
      }
      
      setImages(validResults);
    } catch (err: any) {
      console.error('Error loading gallery:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = () => {
    loadImages();
  };

  const toggleImageSelection = (id: string) => {
    setSelectedImages(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const downloadSelected = async () => {
    if (selectedImages.length === 0) return;
    
    setDownloading(true);
    try {
      // For simplicity, we'll just download the first selected image for this example
      const selectedImage = images.find(img => img.id === selectedImages[0]);
      if (selectedImage && selectedImage.imageUrl) {
        const response = await fetch(selectedImage.imageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `image-${selectedImage.id}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSortBy('newest');
    setDateFilter(undefined);
    loadImages();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/5 backdrop-blur-xl p-4 rounded-xl">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by prompt or description..."
              className="bg-white/5 border-0 text-white pr-10"
            />
            <button 
              onClick={handleSearch}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <Search size={18} />
            </button>
          </div>
          
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px] bg-white/5 border-0 text-white">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="bg-black/90 text-white border-white/20">
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-white/5 border-0 text-white">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFilter ? format(dateFilter, 'PPP') : 'Filter by date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="bg-black/90 border-white/20 text-white p-0">
              <Calendar
                mode="single"
                selected={dateFilter}
                onSelect={setDateFilter}
                initialFocus
                className="text-white"
              />
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <Button 
            variant="outline" 
            onClick={clearFilters}
            className="bg-white/5 border-0 text-white"
          >
            Clear filters
          </Button>
          
          <Button 
            variant="default"
            disabled={selectedImages.length === 0 || downloading}
            onClick={downloadSelected}
            className="bg-white text-black hover:bg-gray-200"
          >
            {downloading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Downloading</>
            ) : (
              <><Download className="mr-2 h-4 w-4" /> Download {selectedImages.length > 0 ? `(${selectedImages.length})` : ''}</>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-12 bg-white/5 backdrop-blur-xl rounded-xl">
          <Grid3x3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white">No images found</h3>
          <p className="text-gray-400 mt-2">Try adjusting your filters or generate new images</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {images.map(image => (
            <div 
              key={image.id} 
              className={`relative rounded-xl overflow-hidden transition-all duration-200 ${
                selectedImages.includes(image.id) ? 'ring-2 ring-white' : ''
              }`}
              onClick={() => toggleImageSelection(image.id)}
            >
              <CreativePreview creative={image} />
              {selectedImages.includes(image.id) && (
                <div className="absolute top-2 right-2 bg-white text-black w-5 h-5 rounded-full flex items-center justify-center">
                  ✓
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 