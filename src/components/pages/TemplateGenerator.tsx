import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, Loader2, Sparkles, Palette, ImageIcon, Share2, Download, AlertCircle } from 'lucide-react';
import CreativePreview from '../generator/CreativePreview'; // Re-use existing preview component

// --- Supabase Client Initialization ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is missing.");
}

// Initialize client with longer timeout for image generation
const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  global: {
    fetch: (input, init) => {
      // 5 minute timeout (300,000 ms)
      const timeout = 300000;
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      return fetch(input, { ...init, signal })
        .then(response => {
          clearTimeout(timeoutId);
          return response;
        })
        .catch(error => {
          clearTimeout(timeoutId);
          throw error;
        });
    },
  },
});
// --- End Supabase Client Initialization ---

// Template type with all fields we need
interface StyleTemplate {
  id: string;
  name: string;
  description: string | null;
  base_prompt: string;
  thumbnail_url: string;
  reference_image_urls: string[] | null;
  required_inputs: RequiredInputConfig[];
}

// For the generated images output
interface GeneratedCreative {
  id: string;
  headline: string;
  description: string;
  b64_json: string;
  style: string;
  variation: number;
  audience: string;
}

// Interface for required_inputs configuration objects
interface RequiredInputConfig {
  id: string;
  label: string;
  type: 'text' | 'image_upload' | 'color' | 'number';
  required?: boolean;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

// Dynamic user input values
interface UserInputs {
  [key: string]: string | number | boolean;
}

export default function TemplateGenerator() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // States
  const [template, setTemplate] = useState<StyleTemplate | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCreatives, setGeneratedCreatives] = useState<GeneratedCreative[]>([]);
  const [userInputs, setUserInputs] = useState<UserInputs>({});
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Fetch template data on mount or templateId change
  useEffect(() => {
    async function fetchTemplate() {
      if (!templateId) {
        setTemplateError('No template ID provided');
        setIsLoadingTemplate(false);
        return;
      }

      try {
        setIsLoadingTemplate(true);
        setTemplateError(null);

        const { data, error } = await supabase
          .from('style_templates')
          .select('*')
          .eq('id', templateId)
          .eq('is_active', true)
          .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error('Template not found');
        }

        console.log('Fetched template:', data);
        
        // Initialize userInputs with default values from required_inputs
        const initialInputs: UserInputs = {};
        if (data.required_inputs && Array.isArray(data.required_inputs)) {
          data.required_inputs.forEach(input => {
            if ('defaultValue' in input) {
              initialInputs[input.id] = input.defaultValue;
            } else if (input.type === 'color') {
              initialInputs[input.id] = '#FFFFFF'; // Default color if not specified
            } else {
              initialInputs[input.id] = ''; // Default for text, etc.
            }
          });
        }
        
        setTemplate(data as StyleTemplate);
        setUserInputs(initialInputs);
      } catch (err: any) {
        console.error('Error fetching template:', err);
        setTemplateError(err.message || 'Failed to load template');
        toast({
          title: 'Error',
          description: 'Failed to load template. Please try again or choose another.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingTemplate(false);
      }
    }

    fetchTemplate();
  }, [templateId, toast]);

  // Handle text/color/number input changes
  const handleInputChange = useCallback((id: string, value: string | number) => {
    setUserInputs(prev => ({ ...prev, [id]: value }));
  }, []);

  // Handle file input changes (for image_upload type)
  const handleFileChange = useCallback((id: string, file: File) => {
    // Convert file to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target?.result as string;
      if (base64String) {
        // Extract just the base64 data (remove data:image/xxx;base64, prefix)
        const base64Data = base64String.split(',')[1];
        setUserInputs(prev => ({ ...prev, [id]: base64Data }));
      }
    };
    reader.readAsDataURL(file);
  }, []);

  // Generate images
  const handleGenerate = async () => {
    if (!template) return;

    // Validate required inputs
    const missingInputs = template.required_inputs
      .filter(input => input.required && !userInputs[input.id])
      .map(input => input.label);

    if (missingInputs.length > 0) {
      toast({
        title: 'Missing Required Inputs',
        description: `Please provide: ${missingInputs.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedCreatives([]);

    try {
      console.log('Generating with inputs:', userInputs);
      
      // Call the Edge Function
      const { data, error } = await supabase.functions.invoke('generate-from-template', {
        body: { 
          templateId: template.id,
          userInput: userInputs,
          // Can add size, n here too if needed
        },
      });

      if (error) {
        throw new Error(`Function invocation error: ${error.message}`);
      }

      if (!data || !data.images || !Array.isArray(data.images)) {
        console.error('Invalid response structure:', data);
        throw new Error('Received invalid data structure from the generator function.');
      }

      console.log(`Received ${data.images.length} base64 images.`);

      // Map results to GeneratedCreative format
      const newCreatives: GeneratedCreative[] = data.images.map(
        (b64: string, index: number) => ({
          id: `creative-${Date.now()}-${index}`,
          headline: template.name,
          description: template.description || 'Generated image',
          audience: '', // placeholder
          style: template.id,
          variation: index + 1,
          b64_json: b64,
        })
      );

      setGeneratedCreatives(newCreatives);
      
      toast({
        title: 'Generation Complete',
        description: `Successfully created ${newCreatives.length} image(s)`,
      });
    } catch (error: any) {
      console.error('Generation failed:', error);
      toast({
        title: 'Generation Failed',
        description: error.message || 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Dynamic input renderer based on type
  const renderInput = (input: RequiredInputConfig) => {
    const { id, label, type, required, defaultValue } = input;
    const currentValue = userInputs[id];

    switch (type) {
      case 'text':
        return (
          <div key={id} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium text-gray-200">
              {label} {required && <span className="text-red-400">*</span>}
            </Label>
            <Input
              id={id}
              type="text"
              value={currentValue as string || ''}
              onChange={(e) => handleInputChange(id, e.target.value)}
              required={required}
              placeholder={input.placeholder as string || ''}
              className="bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md"
            />
          </div>
        );

      case 'color':
        return (
          <div key={id} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium text-gray-200">
              {label} {required && <span className="text-red-400">*</span>}
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id={id}
                type="color"
                value={currentValue as string || '#FFFFFF'}
                onChange={(e) => handleInputChange(id, e.target.value)}
                required={required}
                className="w-10 h-10 p-1 bg-white/5 border-0 rounded-md cursor-pointer"
              />
              <Input 
                type="text"
                value={currentValue as string || '#FFFFFF'}
                onChange={(e) => handleInputChange(id, e.target.value)}
                required={required}
                className="flex-1 bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md font-mono"
              />
            </div>
          </div>
        );

      case 'number':
        return (
          <div key={id} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium text-gray-200">
              {label} {required && <span className="text-red-400">*</span>}
            </Label>
            <Input
              id={id}
              type="number"
              value={currentValue as number || 0}
              onChange={(e) => handleInputChange(id, parseFloat(e.target.value))}
              required={required}
              min={input.min as number || 0}
              max={input.max as number || 100}
              step={input.step as number || 1}
              className="bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md"
            />
          </div>
        );

      case 'image_upload':
        return (
          <div key={id} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium text-gray-200">
              {label} {required && <span className="text-red-400">*</span>}
            </Label>
            <div className="flex flex-col gap-2">
              <Input
                id={id}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files && e.target.files[0] && handleFileChange(id, e.target.files[0])}
                required={required}
                className="bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md file:bg-indigo-600/70 file:text-white file:border-0 file:rounded-md file:px-3 file:py-1.5 cursor-pointer"
              />
              {userInputs[id] && (
                <div className="px-3 py-1.5 bg-indigo-600/20 text-white text-sm rounded-md">
                  Image selected
                </div>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div key={id} className="text-yellow-400 text-sm">
            <AlertCircle className="inline-block mr-1 h-4 w-4" />
            Unknown input type: {type}
          </div>
        );
    }
  };

  // Loading state
  if (isLoadingTemplate) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mx-auto mb-4" />
          <p className="text-lg text-gray-300">Loading template...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (templateError) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/5 backdrop-blur-xl border-0 text-white">
          <CardHeader>
            <CardTitle className="text-xl flex items-center text-red-400">
              <AlertCircle className="mr-2 h-5 w-5" /> Error Loading Template
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">{templateError}</p>
            <Button
              variant="outline"
              onClick={() => navigate('/templates')}
              className="w-full"
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> Back to Templates
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No template
  if (!template) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/5 backdrop-blur-xl border-0 text-white">
          <CardHeader>
            <CardTitle className="text-xl">Template Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">The requested template could not be found or is inactive.</p>
            <Button
              variant="outline"
              onClick={() => navigate('/templates')}
              className="w-full"
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> Back to Templates
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main template render with inputs
  return (
    <div 
      className="min-h-screen bg-black text-gray-200 relative font-sans"
      style={{ backgroundImage: "url('/Pasted Graphic 3.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}
    >
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="container mx-auto py-12 px-4 relative z-10">
        <div className="mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/templates')}
            className="bg-white/5 hover:bg-white/10 border-0 text-gray-300"
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back to Templates
          </Button>
        </div>

        <div className="flex flex-col space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            {/* Template thumbnail */}
            <div className="w-full md:w-32 h-32 bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <img 
                src={template.thumbnail_url} 
                alt={template.name}
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Template title & description */}
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white font-serif mb-2 flex items-center gap-2">
                <Palette className="h-6 w-6 text-indigo-400" /> {template.name}
              </h1>
              <p className="text-lg text-gray-300/80">
                {template.description || 'Generate custom images using this template.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
            {/* Left Column: Template Inputs */}
            <div className="lg:col-span-1 space-y-6">
              {/* Base Prompt Preview (read-only) */}
              <Card className="bg-white/5 backdrop-blur-xl shadow-xl rounded-xl border-0 text-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl text-white">Base Prompt</CardTitle>
                  <CardDescription className="text-gray-400">
                    The core template that will be combined with your inputs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-black/40 p-3 rounded-md text-gray-300 text-sm font-mono overflow-auto max-h-32">
                    {template.base_prompt}
                  </div>
                </CardContent>
              </Card>

              {/* User Input Fields - dynamically rendered */}
              <Card className="bg-white/5 backdrop-blur-xl shadow-xl rounded-xl border-0 text-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl text-white">Customize Template</CardTitle>
                  <CardDescription className="text-gray-400">
                    Provide the inputs needed for this template
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {template.required_inputs && template.required_inputs.length > 0 ? (
                    template.required_inputs.map(input => renderInput(input))
                  ) : (
                    <p className="text-gray-400 italic">This template doesn't require any custom inputs.</p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full bg-white text-black hover:bg-gray-200 disabled:opacity-40 disabled:bg-gray-500 font-semibold text-base rounded-lg shadow-lg hover:shadow-gray-300/30 transition-all duration-300"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="mr-2 h-4 w-4" /> Generate</>
                    )}
                  </Button>
                </CardFooter>
              </Card>

              {/* Reference Images (if any) */}
              {template.reference_image_urls && template.reference_image_urls.length > 0 && (
                <Card className="bg-white/5 backdrop-blur-xl shadow-xl rounded-xl border-0 text-gray-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl text-white">Reference Images</CardTitle>
                    <CardDescription className="text-gray-400">
                      Examples used by this template
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {template.reference_image_urls.map((url, index) => (
                        <div key={index} className="aspect-square bg-gray-800 rounded-md overflow-hidden">
                          <img src={url} alt={`Reference ${index + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Results Area */}
            <div className="lg:col-span-2">
              {/* Loading State */}
              {isGenerating && (
                <div className="flex flex-col items-center justify-center h-96 bg-white/5 backdrop-blur-xl rounded-xl text-center text-gray-300">
                  <Loader2 className="h-12 w-12 text-gray-400 animate-spin mb-4" />
                  <p className="font-medium text-lg">Generating your image{generatedCreatives.length > 1 ? 's' : ''}...</p>
                  <p className="text-sm text-gray-400">This may take a moment.</p>
                </div>
              )}

              {/* Results Display */}
              {!isGenerating && generatedCreatives.length > 0 && (
                <Card className="bg-white/5 backdrop-blur-xl shadow-2xl rounded-xl border-0 text-gray-200">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-semibold text-white">Generated Images</h3>
                      <div className="space-x-2">
                        <Button variant="outline" size="sm" onClick={() => alert('Export functionality not implemented')} className="bg-white/5 hover:bg-white/10 border-0 text-gray-300 backdrop-blur-sm text-xs px-3 py-1.5 rounded-md">
                          <Download className="mr-1 h-4 w-4" /> Export All
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => alert('Share functionality not implemented')} className="bg-white/5 hover:bg-white/10 border-0 text-gray-300 backdrop-blur-sm text-xs px-3 py-1.5 rounded-md">
                          <Share2 className="mr-1 h-4 w-4" /> Share
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[calc(100vh-240px)] pr-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {generatedCreatives.map((creative) => (
                          <CreativePreview key={creative.id} creative={creative} />
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Placeholder/Empty State */}
              {!isGenerating && generatedCreatives.length === 0 && (
                <div className="flex flex-col items-center justify-center h-96 bg-white/5 backdrop-blur-xl rounded-xl text-center text-gray-300">
                  <ImageIcon className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-200">Your generated images will appear here</h3>
                  <p className="mt-1 text-sm text-gray-400 px-4">Fill in the required inputs and click "Generate" to create images with this template.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 