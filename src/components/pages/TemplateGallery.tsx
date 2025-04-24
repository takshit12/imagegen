import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Palette, Sparkles } from 'lucide-react';

// --- Supabase Client Initialization ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is missing.");
}

const supabase = createClient(supabaseUrl!, supabaseAnonKey!);
// --- End Supabase Client Initialization ---

interface StyleTemplate {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string;
  // Other fields are not needed for the gallery view
}

export default function TemplateGallery() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates when component mounts
  useEffect(() => {
    async function fetchTemplates() {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from('style_templates')
          .select('id, name, description, thumbnail_url')
          .eq('is_active', true)
          .order('name');

        if (error) {
          throw error;
        }

        console.log('Fetched templates:', data);
        setTemplates(data || []);
      } catch (err: any) {
        console.error('Error fetching templates:', err);
        setError(err.message || 'Failed to load templates');
        toast({
          title: 'Error',
          description: 'Failed to load templates. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchTemplates();
  }, [toast]);

  return (
    <div 
      className="min-h-screen bg-black text-gray-200 relative font-sans"
      style={{ backgroundImage: "url('/Pasted Graphic 3.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}
    >
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="container mx-auto py-12 px-4 relative z-10">
        <div className="flex flex-col space-y-10">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white font-serif mb-2 flex items-center justify-center gap-3">
              <Palette className="h-8 w-8 text-indigo-400" /> Style Templates
            </h1>
            <p className="text-lg text-gray-300/80">
              Choose a template to generate custom styled images
            </p>
          </div>

          {/* Templates Grid */}
          <div className="mt-8">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mb-4" />
                <p className="text-lg text-gray-300">Loading templates...</p>
              </div>
            ) : error ? (
              <div className="text-center py-20">
                <p className="text-lg text-red-400">{error}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white"
                >
                  Retry
                </button>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-lg text-gray-300">No templates available yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template) => (
                  <Link 
                    key={template.id} 
                    to={`/template/${template.id}`}
                    className="transform transition-transform hover:scale-[1.02] focus:outline-none"
                  >
                    <Card className="h-full bg-white/5 backdrop-blur-md border-0 shadow-xl hover:shadow-2xl transition-all duration-300 rounded-xl overflow-hidden">
                      <div className="aspect-[1.5/1] bg-gray-800 overflow-hidden">
                        <img 
                          src={template.thumbnail_url} 
                          alt={template.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback if image fails to load
                            e.currentTarget.src = '/placeholder-image.jpg';
                          }} 
                        />
                      </div>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xl text-white">{template.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="py-0">
                        <p className="text-gray-300 text-sm line-clamp-2">
                          {template.description || 'No description available.'}
                        </p>
                      </CardContent>
                      <CardFooter className="pt-4">
                        <button className="w-full py-2 bg-indigo-600/70 hover:bg-indigo-600 text-white rounded-md flex items-center justify-center gap-1.5 transition-colors">
                          <Sparkles className="h-4 w-4" /> Use Template
                        </button>
                      </CardFooter>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 