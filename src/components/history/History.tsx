import { useEffect, useState } from 'react';
import { supabase } from '../../../supabase/supabase';
import CreativePreview from '@/components/generator/CreativePreview';

interface DbRow {
  id: string;
  path: string;
  prompt: string;
  size: string;
  created_at: string;
}

export default function History() {
  const [items, setItems] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('generated_images')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('History fetch error', error);
        setLoading(false);
        return;
      }
      if (!data) {
        setLoading(false);
        return;
      }
      // Create signed URLs in parallel
      const signedResults: any[] = await Promise.all(
        data.map(async (row: DbRow) => {
          const { data: signed } = await supabase.storage
            .from('generated-images')
            .createSignedUrl(row.path, 60 * 60);
          return {
            id: row.id,
            headline: row.prompt?.slice(0, 50) || 'Generated',
            description: row.prompt,
            imageUrl: signed?.signedUrl,
            style: 'inspired',
            variation: 0,
            audience: '',
          };
        })
      );
      setItems(signedResults);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <p className="text-gray-400 text-center">Loading history…</p>;
  }

  if (items.length === 0) {
    return <p className="text-gray-400 text-center">No past generations yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {items.map((itm) => (
        <CreativePreview key={itm.id} creative={itm as any} />
      ))}
    </div>
  );
} 