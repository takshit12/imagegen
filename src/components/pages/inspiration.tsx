import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Keep tabs for layout consistency?
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  Share2,
  Image as ImageIcon,
  Palette,
  Sparkles,
  Loader2,
  Lightbulb, // Icon for inspiration
  Grid3x3,
} from "lucide-react";
import CreativePreview from "../generator/CreativePreview"; // Re-use preview
import { useToast } from "@/components/ui/use-toast";
import { InspirationDropZone } from "../generator/InspirationDropZone"; // Re-use drop zone
import { supabase } from "../../../supabase/supabase"; // <-- ADD THIS IMPORT (adjust path if needed)
import GalleryView from "../history/GalleryView";

// --- REMOVE Supabase Client Initialization (Same as generator) ---
// const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
//
// if (!supabaseUrl || !supabaseAnonKey) {
//   console.error(
//     "Supabase URL or Anon Key is missing. Please check your environment variables (.env)."
//   );
//   throw new Error("Supabase configuration missing in environment variables.");
// }
//
// // Add timeout option during client initialization (Same as generator)
// const supabase = createClient(supabaseUrl, supabaseAnonKey, {
//   global: {
//     fetch: (input, init) => {
//       // Increase timeout to 5 minutes (300,000 ms)
//       const timeout = 300000;
//       const controller = new AbortController();
//       const signal = controller.signal;
//       const timeoutId = setTimeout(() => controller.abort(), timeout);
//
//       return fetch(input, { ...init, signal })
//         .then(response => {
//           clearTimeout(timeoutId);
//           return response;
//         })
//         .catch(error => {
//           clearTimeout(timeoutId);
//           throw error;
//         });
//     },
//   },
// });
// --- End REMOVAL ---

// Define the structure for the generated creative data (Same as generator)
interface GeneratedCreative {
  id: string;
  headline: string;
  description: string;
  b64_json: string; // Making this required to match InspirationDropZone
  imageUrl?: string;
  style: string;
  variation: number;
  audience: string;
}

// --- Renamed Component: BrandStyleDuplicator --- 
export default function BrandStyleDuplicator() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("generator");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCreatives, setGeneratedCreatives] = useState<GeneratedCreative[]>([]);
  const [inspirationImages, setInspirationImages] = useState<GeneratedCreative[]>([]); 
  const [formData, setFormData] = useState({ 
    prompt: "", // Changed from headline, primary text input now
    variations: 1, // Default to 1 variation initially
    size: "auto", 
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simplified Input Handler (only for prompt now)
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    // Ensure only 'prompt' field updates state, if needed
    if (name === 'prompt') {
       setFormData((prev) => ({ ...prev, prompt: value }));
    }
  };

  // Renamed handleSelectChange to handleOptionChange for clarity
  const handleOptionChange = (name: string, value: string | number) => {
     // Handle size and variations changes
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Keep handleSliderChange separate or merge into handleOptionChange
  const handleSliderChange = (value: number[]) => {
    setFormData((prev) => ({ ...prev, variations: value[0] }));
  };

  // --- File Upload Handler (Keep as is) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const files = Array.from(e.target.files);
    const remainingSlots = 10 - inspirationImages.length;

    if (files.length > remainingSlots) {
      toast({
        title: "Limit Exceeded",
        description: `You can only add ${remainingSlots} more image(s).`,
        variant: "destructive",
      });
      // Optionally, just take the allowed number of files
      files.splice(remainingSlots);
    }

    if (files.length === 0) return; 

    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
          toast({
              title: "Invalid File Type",
              description: `Skipping non-image file: ${file.name}`,
              variant: "destructive"
          });
          return; // Skip non-image files
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const base64String = loadEvent.target?.result as string;
        if (base64String) {
          const newImage: GeneratedCreative = {
            id: `uploaded-${Date.now()}-${Math.random()}`,
            b64_json: base64String.split(',')[1],
            headline: file.name, // Use filename as placeholder title for the preview
            description: "Uploaded image", // Generic placeholder
            audience: "", // Remove or leave blank
            style: "uploaded", // Indicate it was uploaded
            variation: 0, 
          };
          // Add to state, checking limit again just in case
          setInspirationImages((prev) => {
              if (prev.length < 10) {
                  return [...prev, newImage];
              } else {
                   toast({ title: "Limit Reached", description: "Cannot add more than 10 images.", variant: "destructive" });
                   return prev;
              }
          });
        }
      };
      reader.onerror = (error) => {
        console.error("File reading error:", error);
        toast({ title: "File Error", description: `Could not read file: ${file.name}`, variant: "destructive" });
      };
      reader.readAsDataURL(file); // Read file as base64 data URI
    });

    // Reset file input value
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  // --- Trigger File Input Click (Keep as is) ---
  const triggerFileInput = () => {
      fileInputRef.current?.click();
  };

  // --- Modified handleGenerate for Style Replication using Job System ---
  const handleGenerate = async () => {
    // --- Validation: Require inspiration images and a prompt for the new content ---
    if (inspirationImages.length === 0) {
       toast({ title: "Inspiration Missing", description: "Please add at least one inspiration image.", variant: "destructive"});
       return;
    }
     if (!formData.prompt) { // Check for the main prompt
      toast({ title: "Prompt Missing", description: "Please enter a prompt describing the new image content.", variant: "destructive" });
      return;
    }
    // --- End Validation ---

    // --- Construct the prompt for Style Replication --- 
    const stylePrompt = `Replicate the supplied reference artwork  ${inspirationImages.length} so precisely that the final  ${formData.variations} new image feels indistinguishable from the original, with the *only* permissible change being the replacement of live text; under no circumstances introduce, remove, resize, crop, or reposition any graphic, icon, rule, badge, illustration, texture, gradient, shadow, lighting effect, or negative-space ratio. Work at the identical canvas dimensions and aspect ratio as the reference, using its exact coordinate grid, baseline grid, and column gutters so every element keeps its original spatial relationships. Copy the type hierarchy verbatim: match font families, weights, optical sizes, and OpenType features; preserve letter-spacing, word-spacing, and line-height so new copy sits on the same baselines without reflowing adjacent objects. Maintain smart punctuation, ligatures, and case conventions exactly as shown. Capture the palette by sampling the precise HEX/RGB values—primary, secondary, accent, and any gradient stops—then apply them to text, icons, backgrounds, and overlays with no hue or luminosity drift. Mirror all blending modes, opacities, noise layers, grain overlays, vignette strength, and emboss/deboss settings so tonal depth and texture density remain identical. Duplicate every effect parameter: drop-shadow direction, distance, blur radius, spread, colour temperature; inner-shadow choke and angle; glow radius and opacity; reflection fade ramps; bevel light source position; and motion-blur trajectories where present. Reproduce iconography stroke weights, corner radii, cap styles, and alignment in relation to label copy so visual rhythm stays intact. Ensure photographic or 3-D renders (if present) retain their current highlights, contrast curves, and edge sharpness; do not swap or re-light them. When inserting new text—be it translation, price change, or tagline update—dynamically adjust tracking and discretionary hyphenation inside the existing bounding box so the block neither expands nor contracts; honour original rag, justification rules, and orphan control. Preserve microcopy scale and micro-margin offsets around trademarks, disclaimers, and utility labels. Keep the underlying layer structure logical: group headlines, subheads, body text, and icons exactly as in the source so further edits respect clipping paths and adjustment layers already in place. Apply the identical percentage of monochrome noise or halftone frequency to any replacement vector shapes or bitmap layers so they assimilate seamlessly. Conform to the same global lighting schema—angle, intensity, and colour temperature—so highlights, shadows, and depth cues remain coherent. Do not generate UI chrome, device frames, stock photos, or decorative assets absent from the reference. Output a single flattened PNG (or identical file format to the source) at the source resolution, ready for immediate drop-in replacement with zero downstream layout shifts.The new image must depict the following content: "${formData.prompt}". Ensure the output style is highly consistent with the provided examples.`;

    // Now using job system instead of direct edit-image call
    const jobFunctionName = "submit-style-job";

    const requestBody = {
        prompt: stylePrompt,
        inspirationImages: inspirationImages.map(img => img.b64_json),
        n: formData.variations,
        size: formData.size === "auto" ? "1024x1024" : formData.size, // Default to 1024x1024 if auto
    };

    console.log(`Submitting style job with ${inspirationImages.length} inspiration images and size ${formData.size}.`);

    setIsGenerating(true);
    setGeneratedCreatives([]);

    try {
      // Submit job to the job system
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Supabase configuration missing.");
      }
      
      // Get user session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || supabaseAnonKey;

      // Submit the job
      const response = await fetch(`${supabaseUrl}/functions/v1/${jobFunctionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Job submission error:", response.status, errorText);
        throw new Error(`Job submission failed with status ${response.status}: ${errorText}`);
      }

      const jobData = await response.json();
      
      if (!jobData || !jobData.job_id) {
        throw new Error("Invalid job response received");
      }

      const jobId = jobData.job_id;
      console.log(`Job submitted successfully. Job ID: ${jobId}`);

      toast({
        title: "Job Submitted",
        description: "Your image generation job has been submitted and is processing in the background.",
      });

      // Start polling for job status
      pollJobStatus(jobId);
      
    } catch (error: any) {
      console.error("Job submission failed:", error);
      toast({
        title: "Job Submission Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  };

  // New function to poll job status
  const pollJobStatus = async (jobId: string) => {
    const maxAttempts = 60; // Maximum number of polling attempts (10 minutes at 10-second intervals)
    const pollInterval = 10000; // Poll every 10 seconds
    let attempt = 0;
    
    const checkStatus = async () => {
      try {
        attempt++;
        console.log(`Polling job status (attempt ${attempt}/${maxAttempts})...`);
        
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        // Query the style_jobs table to check status
        const { data: jobData, error } = await supabase
          .from('style_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (error) {
          console.error("Error fetching job status:", error);
          return false;
        }
        
        if (!jobData) {
          console.error("No job data found for ID:", jobId);
          return false;
        }
        
        console.log(`Job status: ${jobData.status}`);
        
        if (jobData.status === 'COMPLETED') {
          // Job completed successfully
          if (jobData.exec_id) {
            // Fetch generated images using the execution ID
            const { data: imageData, error: imageError } = await supabase
              .from('generated_images')
              .select('*')
              .eq('exec_id', jobData.exec_id);
            
            if (imageError) {
              console.error("Error fetching generated images:", imageError);
              return true; // End polling but show error
            }
            
            if (!imageData || imageData.length === 0) {
              console.error("No generated images found for exec_id:", jobData.exec_id);
              return true; // End polling but show error
            }
            
            // Create signed URLs for all images
            const signedResults = await Promise.all(
              imageData.map(async (row, index) => {
                try {
                  const { data: signed } = await supabase.storage
                    .from('generated-images')
                    .createSignedUrl(row.path, 60 * 60);
                    
                  return {
                    id: `job-${jobId}-${index}`,
                    headline: formData.prompt.substring(0, 50) + (formData.prompt.length > 50 ? '...' : ''),
                    description: 'Generated based on inspiration',
                    audience: '',
                    style: 'inspired',
                    variation: index + 1,
                    imageUrl: signed?.signedUrl,
                    b64_json: '', // Empty string to satisfy the interface
                  };
                } catch (err) {
                  console.error(`Error signing URL for ${row.path}:`, err);
                  return null;
                }
              })
            );
            
            // Filter out nulls (failed signs)
            const validResults = signedResults.filter(Boolean);
            
            setGeneratedCreatives(validResults);
            toast({
              title: "Images Generated",
              description: `Successfully created ${validResults.length} images based on your inspiration.`,
            });
          } else {
            toast({
              title: "Generation Complete",
              description: "Job completed but no images were found.",
              variant: "destructive",
            });
          }
          
          return true; // End polling
        } else if (jobData.status === 'FAILED') {
          // Job failed
          toast({
            title: "Generation Failed",
            description: jobData.error_message || "The image generation job failed. Please try again.",
            variant: "destructive",
          });
          return true; // End polling
        } else if (attempt >= maxAttempts) {
          // Exceeded max polling attempts
          toast({
            title: "Status Check Timeout",
            description: "The image generation is still in progress. Check the Gallery tab later for results.",
            variant: "default",
          });
          return true; // End polling
        }
        
        // Continue polling
        return false;
      } catch (error) {
        console.error("Error polling job status:", error);
        return attempt >= maxAttempts; // Only stop if max attempts reached
      }
    };
    
    // Initial delay before first poll
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Poll until completion or timeout
    while (true) {
      const shouldStop = await checkStatus();
      if (shouldStop) {
        setIsGenerating(false);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  };

  // --- Drag/Drop Handlers (Update max images to 10) ---
   const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const currentCount = inspirationImages.length;
    let addedCount = 0;

    // Process dragged creative first (if applicable)
    try {
      const creativeDataString = e.dataTransfer.getData("application/json");
      if (creativeDataString) {
        const droppedCreative: GeneratedCreative = JSON.parse(creativeDataString);
        // Check ID and total count before adding
        if (!inspirationImages.some(img => img.id === droppedCreative.id) && currentCount + addedCount < 10) {
            setInspirationImages((prev) => [...prev, droppedCreative]);
            addedCount++;
        }
      } 
    } catch (error) {
      // Ignore JSON parse error if files are dropped
    }

    // Process dropped files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        const remainingSlots = 10 - (currentCount + addedCount);

        if (files.length > remainingSlots) {
          toast({
            title: "Limit Exceeded",
            description: `Max 10 images allowed. ${files.length - remainingSlots} file(s) were not added.`,
            variant: "destructive",
          });
        }

        // Use the file handler logic
        const filesToAdd = files.slice(0, remainingSlots);
        if (filesToAdd.length > 0) {
            // Create a synthetic event object for handleFileChange
             const syntheticEvent = { 
                target: { files: new DataTransfer().files } 
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            // Create a FileList 
            const dt = new DataTransfer();
            filesToAdd.forEach(file => dt.items.add(file));
            syntheticEvent.target.files = dt.files;

            handleFileChange(syntheticEvent);
        }
    }
  };
  // --- End Updated Drop Handler ---

  const removeInspirationImage = (idToRemove: string) => {
    setInspirationImages((prev) => prev.filter(img => img.id !== idToRemove));
  };

  const handleExport = (type: string) => {
    toast({
      title: "Export Initiated",
      description: `Exporting ${generatedCreatives.length} creatives as ${type}... (Not implemented)`,
    });
  };

  return (
    <div 
      className="min-h-screen bg-black text-gray-200 relative font-sans"
      style={ { backgroundImage: "url('/Pasted Graphic 3.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' } }
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 z-0" />

      <div className="container mx-auto py-12 px-4 relative z-10">
        <div className="flex flex-col space-y-10">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white font-serif mb-2 flex items-center justify-center gap-3">
              <Lightbulb className="h-8 w-8 text-indigo-400" /> Brand Style Duplicator
            </h1>
            <p className="text-lg text-gray-300/80">
              Generate new creatives based on the visual style of existing images.
            </p>
          </div>

          <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex justify-center mb-8">
              <TabsList className="inline-flex h-auto items-center justify-center rounded-lg bg-white/5 backdrop-blur-md p-1 text-gray-400">
                <TabsTrigger value="generator" className="px-4 py-2 text-sm data-[state=active]:text-white data-[state=active]:bg-white/10 rounded-md transition-colors flex items-center gap-2">
                  <Sparkles size={16} />
                  Generator
                </TabsTrigger>
                <TabsTrigger value="gallery" className="px-4 py-2 text-sm data-[state=active]:text-white data-[state=active]:bg-white/10 rounded-md transition-colors flex items-center gap-2">
                  <Grid3x3 size={16} />
                  Gallery
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="generator" className="mt-6">
          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Column 1: Inputs & Inspiration Drop Zone */}
              <div className="lg:col-span-1 flex flex-col gap-8">
                {/* Input Form Card - Borderless */}
                <Card className="bg-white/5 backdrop-blur-xl shadow-2xl rounded-xl border-0 text-gray-200">
                  <CardContent className="p-6">
                     <h3 className="text-lg font-semibold mb-5 text-white">New Image Details</h3>
                     <div className="space-y-5">
                       {/* Main Prompt Input */}
                       <div className="space-y-2">
                         <Label htmlFor="prompt" className="text-sm font-medium text-gray-200">Prompt for New Image</Label>
                         <Textarea 
                            id="prompt"
                            name="prompt" 
                            placeholder="Describe the content of the new image..." 
                            rows={4} 
                            value={formData.prompt} 
                            onChange={handleInputChange} 
                            className="bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md"
                         />
                       </div>
                       
                       {/* Removed Description & Audience TextAreas */}
                       {/* Removed Style Select */}

                      {/* Resolution Selector */}
                      <div className="space-y-2 pt-2">
                          <Label htmlFor="size" className="text-sm font-medium text-gray-200 flex items-center gap-2">
                             <ImageIcon className="h-4 w-4 text-gray-400 inline" /> Output Resolution
                          </Label>
                          <Select name="size" value={formData.size} onValueChange={(value) => handleOptionChange("size", value)}>
                            <SelectTrigger id="size" className="bg-white/5 border-0 text-white focus:ring-1 focus:ring-white/50 rounded-md w-full justify-start">
                              <SelectValue placeholder="Select resolution" />
                            </SelectTrigger>
                             <SelectContent className="bg-black/80 backdrop-blur-md border-white/20 text-gray-200 mt-1 border-0 shadow-xl rounded-md">
                               <SelectItem value="auto" className="focus:bg-white/10 focus:text-white rounded">Auto (Default)</SelectItem>
                               <SelectItem value="1024x1024" className="focus:bg-white/10 focus:text-white rounded">1024x1024 (Square)</SelectItem>
                               <SelectItem value="1536x1024" className="focus:bg-white/10 focus:text-white rounded">1536x1024 (Landscape)</SelectItem>
                               <SelectItem value="1024x1536" className="focus:bg-white/10 focus:text-white rounded">1024x1536 (Portrait)</SelectItem>
                             </SelectContent>
                          </Select>
                      </div>
                       {/* Variations Slider */}
                       <div className="space-y-3 pt-2">
                         <div className="flex justify-between items-center text-sm mb-1">
                          <Label htmlFor="variations" className="text-gray-200 flex items-center gap-2">
                             <Sparkles className="h-4 w-4 text-gray-400 inline" /> Number of Variations
                           </Label>
                           <span className="font-medium text-gray-200 pr-1">{formData.variations}</span>
                         </div>
                         <Slider id="variations" min={1} max={10} step={1} value={[formData.variations]} onValueChange={handleSliderChange} className="[&>span:first-child]:h-1 [&>span:first-child>span]:bg-indigo-400 [&>span:last-child]:bg-white/15 [&>span:last-child]:h-1 [&>span:last-child>span]:bg-white [&>span:last-child>span]:border-0 [&>span:last-child>span]:shadow-md [&>span:last-child>span]:h-3 [&>span:last-child>span]:w-3 [&>span:last-child>span]:mt-[-3px]" />
                       </div>
                     </div>
                   </CardContent>
                </Card>

                {/* Hidden File Input */} 
                <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    multiple
                    accept="image/*"
                    className="hidden"
                />

                {/* Inspiration Drop Zone (Pass upload trigger) */}
                <InspirationDropZone
                  inspirationImages={inspirationImages}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onRemoveImage={removeInspirationImage}
                  onUploadClick={triggerFileInput} // Pass the trigger function
                />

                 {/* Generate Button - Classy */} 
                  <div className="mt-0 flex flex-col gap-3">
                    <div className="p-3 bg-indigo-500/10 rounded-lg text-xs text-gray-300">
                      <p className="flex items-center mb-1">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">Background Processing</span>
                      </p>
                      <p>Style duplication jobs run in the background. You can safely navigate away and check the Gallery tab later to see results.</p>
                    </div>
                    
                    <Button
                      size="lg"
                      onClick={handleGenerate}
                      disabled={isGenerating || inspirationImages.length === 0 || !formData.prompt} // Also disable if prompt is empty
                      className="w-full bg-white text-black hover:bg-gray-200 disabled:opacity-40 disabled:bg-gray-500 font-semibold text-base rounded-lg shadow-lg hover:shadow-gray-300/30 transition-all duration-300"
                    >
                      {isGenerating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                      ) : (
                        <><Sparkles className="mr-2 h-4 w-4" /> Generate Inspired Creatives</>
                      )}
                    </Button>
                </div>
              </div>

              {/* Column 2: Results Area - Styled */}
              <div className="lg:col-span-2">
                {/* Loading State - Borderless */}
                {isGenerating && (
                  <div className="flex flex-col items-center justify-center h-96 bg-white/5 backdrop-blur-xl rounded-xl text-center text-gray-300">
                    <Loader2 className="h-12 w-12 text-gray-400 animate-spin mb-4" />
                      <p className="font-medium text-lg">Processing your request</p>
                      <p className="text-sm text-gray-400 mt-2">Your image generation job is now processing in the background.</p>
                      <p className="text-sm text-gray-400 mt-3">You can check the Gallery tab at any time to see completed images.</p>
                  </div>
                )}

                {/* Results Display - Borderless */}
                {!isGenerating && generatedCreatives.length > 0 && (
                   <Card className="bg-white/5 backdrop-blur-xl shadow-2xl rounded-xl border-0 text-gray-200">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-semibold text-white">Generated Creatives</h3>
                        <div className="space-x-2">
                          {/* Classy Buttons */}
                          <Button variant="outline" size="sm" onClick={() => handleExport("PNG")} className="bg-white/5 hover:bg-white/10 border-0 text-gray-300 backdrop-blur-sm text-xs px-3 py-1.5 rounded-md"> <Download className="mr-1 h-4 w-4" /> Export All</Button>
                          <Button variant="outline" size="sm" onClick={() => handleExport("Share")} className="bg-white/5 hover:bg-white/10 border-0 text-gray-300 backdrop-blur-sm text-xs px-3 py-1.5 rounded-md"> <Share2 className="mr-1 h-4 w-4" /> Share </Button>
                        </div>
                      </div>
                      <ScrollArea className="h-[calc(100vh-240px)] pr-1"> {/* Adjusted height */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6"> {/* Increased gap */}
                          {generatedCreatives.map((creative) => (
                            <CreativePreview key={creative.id} creative={creative} />
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Placeholder - Borderless */}
                {!isGenerating && generatedCreatives.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-96 bg-white/5 backdrop-blur-xl rounded-xl text-center text-gray-300">
                    <ImageIcon className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-200">Generated creatives will appear here</h3>
                    <p className="mt-1 text-sm text-gray-400 px-4">Add inspiration images, describe the new content, and click 'Generate'.</p>
                  </div>
                )}
              </div>
            </div> 
            </TabsContent>

            <TabsContent value="gallery" className="mt-6">
              <GalleryView />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
} 