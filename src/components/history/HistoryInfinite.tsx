import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../supabase/supabase';
import CreativePreview from '@/components/generator/CreativePreview';

interface DbImage {
  id: string;
  path: string;
  prompt: string;
  size: string;
  created_at: string;
  exec_id: string;
}

export default function HistoryInfinite() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 8;

  // Initial load
  useEffect(() => {
    loadImages();
  }, []);

  async function loadImages() {
    try {
      if (!hasMore || loading) return;
      
      setLoading(true);
      
      let query = supabase
        .from('generated_images')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
        
      if (cursor) {
        query = query.lt('created_at', cursor);
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw error;
      }
      
      if (!data || data.length === 0) {
        setHasMore(false);
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
              style: 'inspired',
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
      const validResults = signedResults.filter(Boolean);
      
      setItems(prev => [...prev, ...validResults]);
      
      // Set the cursor to the created_at of the last item
      if (data.length > 0) {
        setCursor(data[data.length - 1].created_at);
      }
      
      // Check if we have more items
      setHasMore(data.length === PAGE_SIZE);
      
    } catch (err: any) {
      console.error('Error loading history:', err);
      setError(err.message || 'Error loading images');
    } finally {
      setLoading(false);
    }
  }

  // Set up scroll event handling for infinite scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    function handleScroll() {
      if (!hasMore || loading) return;
      
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadImages();
      }
    }
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, cursor]);

  return (
    <div 
      ref={containerRef}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto h-[calc(100vh-240px)] p-4"
    >
      {items.length === 0 && !loading && !error && (
        <div className="col-span-full text-center py-10 text-gray-400">
          No generated images found. Create some using the Brand Style Duplicator!
        </div>
      )}
      
      {error && (
        <div className="col-span-full text-center py-10 text-red-400">
          Error: {error}
        </div>
      )}
      
      {items.map(item => (
        <CreativePreview key={item.id} creative={item} />
      ))}
      
      {loading && (
        <div className="col-span-full text-center py-6 text-gray-400">
          Loading more images...
        </div>
      )}
    </div>
  );
} 