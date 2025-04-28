import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Wand2,
  Image as ImageIcon,
  Users,
  Palette,
  Sparkles,
  Loader2,
} from "lucide-react";
import CreativePreview from "@/components/generator/CreativePreview";
import { useToast } from "@/components/ui/use-toast";
import { InspirationDropZone } from "@/components/generator/InspirationDropZone";
import { supabase } from "../../../supabase/supabase";

interface GeneratedCreative {
  id: string;
  headline: string;
  description: string;
  b64_json?: string;
  style: string;
  variation: number;
  audience: string;
  imageUrl?: string;
}

interface InspirationDropZoneProps {
  inspirationImages: GeneratedCreative[];
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveImage: (idToRemove: string) => void;
  onUploadClick: () => void;
}

export default function Generator() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCreatives, setGeneratedCreatives] = useState<GeneratedCreative[]>([]);
  const [inspirationImages, setInspirationImages] = useState<GeneratedCreative[]>([]);
  const [formData, setFormData] = useState({
    headline: "",
    description: "",
    audience: "",
    style: "modern",
    variations: 5,
    includeProductImage: false,
    productImageUrl: "",
  });
  const inspirationFileRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (name: string, checked: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSliderChange = (name: string, value: number[]) => {
    setFormData((prev) => ({ ...prev, [name]: value[0] }));
  };

  const handleGenerate = async () => {
    // --- Choose function and prepare payload based on inspiration images ---
    let functionName = "image-generator";
    let requestBody: any = {
        headline: formData.headline,
        description: formData.description,
        audience: formData.audience,
        style: formData.style,
        variations: formData.variations,
    };

    if (inspirationImages.length > 0) {
        functionName = "edit-image"; // Switch to the new function
        // Construct the prompt for the edit function
        const editPrompt = `Generate a new ad creative inspired by the provided ${inspirationImages.length} image(s), incorporating the following details:
Headline: "${formData.headline}"
Product Description: "${formData.description}"
Target Audience: "${formData.audience}"
Desired Visual Style: "${formData.style}"`;

        requestBody = {
            prompt: editPrompt,
            inspirationImages: inspirationImages.map(img => img.b64_json), // Send only base64 strings
            n: formData.variations, // Send number of variations
            // size: "1024x1024" // Can add size if needed
        };
        console.log(`Calling ${functionName} with ${inspirationImages.length} inspiration images.`);
    } else {
        console.log(`Calling ${functionName} (no inspiration images).`);
    }
    // --- End function choice ---


    if (!formData.headline || !formData.description || !formData.audience) {
      toast({
        title: "Missing Information",
        description: "Please fill in Headline, Description, and Target Audience.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedCreatives([]); // Clear previous main results
    // Optionally clear inspiration images on new generation? Decide based on desired UX
    // setInspirationImages([]);

    try {
      // For edit-image, use direct fetch with better large payload handling
      if (functionName === "edit-image") {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error("Supabase configuration missing.");
        }
        
        // Direct fetch with increased timeout 
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10-minute timeout
        
        const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Edge function error response:", response.status, errorText);
          throw new Error(`Function invocation failed with status ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.images || !Array.isArray(data.images)) {
          console.error("Invalid response structure from edge function:", data);
          throw new Error("Received invalid data structure from the generator function.");
        }

        const newCreatives: GeneratedCreative[] = data.images.map((url: string, index: number) => ({
          id: `creative-${Date.now()}-${index}`,
          headline: formData.headline,
          description: formData.description,
          audience: formData.audience,
          style: formData.style,
          variation: index + 1,
          imageUrl: url,
        }));

        setGeneratedCreatives(newCreatives);

        toast({
          title: "Creatives Generated",
          description: `Successfully created ${newCreatives.length} ad variations.`,
        });
      } else {
        // For standard image generator, use the original approach
        const timeoutDuration = 60000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

        const { data, error } = await supabase.functions.invoke(
          functionName, // Use the determined function name
          {
            body: requestBody, // Use the determined request body
          }
        );

        if (error) {
          if (error.message.includes('aborted')) {
             throw new Error(`Function invocation timed out after ${timeoutDuration / 1000} seconds.`);
          } else {
             throw new Error(`Function invocation error: ${error.message}`);
          }
        }

        if (!data || !data.images || !Array.isArray(data.images)) {
          console.error("Invalid response structure from edge function:", data);
          throw new Error("Received invalid data structure from the generator function.");
        }

        const newCreatives: GeneratedCreative[] = data.images.map(
          (b64: string, index: number) => ({
            id: `creative-${Date.now()}-${index}`,
            headline: formData.headline,
            description: formData.description,
            audience: formData.audience,
            style: formData.style,
            variation: index + 1,
            b64_json: b64,
          })
        );

        setGeneratedCreatives(newCreatives);

        toast({
          title: "Creatives Generated",
          description: `Successfully created ${newCreatives.length} ad variations.`,
        });
      }
    } catch (error: any) {
      console.error("Generation failed:", error);
      toast({
        title: "Generation Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setGeneratedCreatives([]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = (type: string) => {
    toast({
      title: "Export Initiated",
      description: `Exporting ${generatedCreatives.length} creatives as ${type}... (Not implemented)`,
    });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (inspirationImages.length >= 4) {
        toast({
            title: "Limit Reached",
            description: "You can add a maximum of 4 inspiration images.",
            variant: "destructive"
        });
        return;
    }
    try {
      const creativeDataString = e.dataTransfer.getData("application/json");
      if (creativeDataString) {
        const droppedCreative: GeneratedCreative = JSON.parse(creativeDataString);

        if (!inspirationImages.some(img => img.id === droppedCreative.id)) {
            setInspirationImages((prev) => [...prev, droppedCreative]);
        }
      }
    } catch (error) {
      console.error("Failed to handle drop:", error);
      toast({
        title: "Drop Failed",
        description: "Could not add the image for inspiration.",
        variant: "destructive"
      });
    }
  };

  const removeInspirationImage = (idToRemove: string) => {
    setInspirationImages((prev) => prev.filter(img => img.id !== idToRemove));
  };

  const handleInspirationUploadClick = () => {
    inspirationFileRef.current?.click();
  };

  const handleInspirationDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const newImage: GeneratedCreative = {
            id: Date.now().toString(),
            b64_json: reader.result as string,
            headline: "Uploaded Image",
            description: file.name,
            style: "inspiration",
            variation: 0,
            audience: "general",
          };
          setInspirationImages((prev) => [...prev, newImage]);
        };
        reader.readAsDataURL(file);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please drop an image file.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div 
      className="min-h-screen bg-black text-gray-200 relative font-sans"
      style={ { backgroundImage: "url('/Pasted Graphic 2.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' } }
    >
      <div className="absolute inset-0 bg-black/60 z-0" />
      
      <div className="container mx-auto py-12 px-4 relative z-10">
        <div className="flex flex-col space-y-10">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white font-serif mb-2">
              A/B Test Creative Generator
            </h1>
            <p className="text-lg text-gray-300/80">
              Generate multiple ad variations to optimize your campaign performance
            </p>
          </div>

          <Tabs defaultValue="generator" className="w-full">
            <div className="flex justify-center mb-8">
                <TabsList className="inline-flex h-auto items-center justify-center rounded-lg bg-transparent p-0 text-gray-400">
                  <TabsTrigger value="generator" className="px-4 py-1.5 text-sm data-[state=active]:text-white data-[state=active]:bg-white/10 rounded-md transition-colors">Generator</TabsTrigger>
                  <TabsTrigger value="history" className="px-4 py-1.5 text-sm data-[state=active]:text-white data-[state=active]:bg-white/10 rounded-md transition-colors">History</TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="generator" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <Card className="lg:col-span-1 bg-white/5 backdrop-blur-xl shadow-2xl rounded-xl border-0">
                  <CardContent className="p-6 text-gray-200">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="headline" className="text-sm font-medium text-gray-200">Ad Headline</Label>
                          <span className="text-xs text-gray-400/80">Required</span>
                        </div>
                        <Input
                          id="headline"
                          name="headline"
                          placeholder="Enter main ad headline"
                          value={formData.headline}
                          onChange={handleInputChange}
                          className="bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md py-2"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-medium text-gray-200">Product Description</Label>
                         <span className="text-xs text-gray-400/80 float-right">Required</span>
                        <Textarea
                          id="description"
                          name="description"
                          placeholder="Describe your product or service"
                          rows={4}
                          value={formData.description}
                          onChange={handleInputChange}
                           className="bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md"
                        />
                      </div>

                      <div className="space-y-2">
                         <Label htmlFor="audience" className="text-sm font-medium text-gray-200">Target Audience</Label>
                         <span className="text-xs text-gray-400/80 float-right">Required</span>
                         <Textarea
                          id="audience"
                          name="audience"
                          placeholder="Describe target audience"
                          rows={3}
                          value={formData.audience}
                          onChange={handleInputChange}
                          className="bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md"
                        />
                      </div>

                       <div className="space-y-3 pt-2">
                         <div className="flex items-center justify-between p-3 bg-black/10 rounded-lg">
                           <Label htmlFor="includeProductImage" className="text-sm text-gray-300 cursor-pointer flex items-center gap-2">
                            <ImageIcon className="h-4 w-4 text-gray-400 inline" /> Include product image
                          </Label>
                          <Switch
                            id="includeProductImage"
                            checked={formData.includeProductImage}
                            onCheckedChange={(checked) => handleSwitchChange("includeProductImage", checked)}
                             className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600 scale-90"
                          />
                         </div>
                        {formData.includeProductImage && (
                          <div className="space-y-1.5 pl-1">
                            <Input
                              id="productImageUrl"
                              name="productImageUrl"
                              placeholder="Image URL: https://..."
                              value={formData.productImageUrl}
                              onChange={handleInputChange}
                              className="bg-white/5 border-0 placeholder-gray-400/60 focus-visible:ring-1 focus-visible:ring-white/50 text-white rounded-md py-2 text-sm"
                            />
                          </div>
                        )}
                      </div>

                       <div className="space-y-2 pt-2">
                         <Label htmlFor="style" className="text-sm font-medium text-gray-200 flex items-center gap-2">
                            <Palette className="h-4 w-4 text-gray-400 inline" /> Visual Style
                         </Label>
                          <Select name="style" value={formData.style} onValueChange={(value) => handleSelectChange("style", value)}>
                            <SelectTrigger id="style" className="bg-white/5 border-0 text-white focus:ring-1 focus:ring-white/50 rounded-md w-full justify-start">
                              <SelectValue placeholder="Select style" />
                            </SelectTrigger>
                             <SelectContent className="bg-black/80 backdrop-blur-md border-white/20 text-gray-200 mt-1 border-0 shadow-xl rounded-md">
                              <SelectItem value="modern" className="focus:bg-white/10 focus:text-white rounded">Modern & Minimal</SelectItem>
                              <SelectItem value="bold" className="focus:bg-white/10 focus:text-white rounded">Bold & Vibrant</SelectItem>
                              <SelectItem value="elegant" className="focus:bg-white/10 focus:text-white rounded">Elegant & Sophisticated</SelectItem>
                              <SelectItem value="playful" className="focus:bg-white/10 focus:text-white rounded">Playful & Fun</SelectItem>
                              <SelectItem value="corporate" className="focus:bg-white/10 focus:text-white rounded">Corporate & Professional</SelectItem>
                            </SelectContent>
                          </Select>
                      </div>

                       <div className="space-y-3 pt-2">
                         <div className="flex justify-between items-center text-sm mb-1">
                           <Label htmlFor="variations" className="text-gray-200 flex items-center gap-2">
                               <Sparkles className="h-4 w-4 text-gray-400 inline" /> Number of Variations
                           </Label>
                           <span className="font-medium text-gray-200 pr-1">{formData.variations}</span>
                         </div>
                          <Slider
                            id="variations"
                            min={2}
                            max={10}
                            step={1}
                            value={[formData.variations]}
                            onValueChange={(value) => handleSliderChange("variations", value)}
                            className="[&>span:first-child]:h-1 [&>span:first-child>span]:bg-indigo-400 [&>span:last-child]:bg-white/15 [&>span:last-child]:h-1 [&>span:last-child>span]:bg-white [&>span:last-child>span]:border-0 [&>span:last-child>span]:shadow-md [&>span:last-child>span]:h-3 [&>span:last-child>span]:w-3 [&>span:last-child>span]:mt-[-3px]"
                          />
                      </div>

                      <div className="pt-6 flex justify-center">
                        <Button
                          size="lg"
                          onClick={handleGenerate}
                          disabled={isGenerating}
                          className="w-full bg-white text-black hover:bg-gray-200 disabled:opacity-40 disabled:bg-gray-500 font-semibold text-base rounded-lg shadow-lg hover:shadow-gray-300/30 transition-all duration-300"
                        >
                          {isGenerating ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                          ) : (
                            <><Sparkles className="mr-2 h-4 w-4" /> Generate Creatives</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="lg:col-span-2 space-y-8">
                  {isGenerating && (
                    <div className="flex flex-col items-center justify-center h-96 bg-white/5 backdrop-blur-xl rounded-xl text-center text-gray-300">
                     <Loader2 className="h-12 w-12 text-gray-400 animate-spin mb-4" />
                      <p className="font-medium text-lg">Generating your ad creatives...</p>
                      <p className="text-sm text-gray-400">This may take a moment.</p>
                    </div>
                  )}

                  {!isGenerating && generatedCreatives.length > 0 && (
                    <Card className="bg-white/5 backdrop-blur-xl shadow-2xl rounded-xl border-0 text-gray-200">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-center mb-6">
                         <h3 className="text-xl font-semibold text-white">Generated Creatives</h3>
                          <div className="space-x-2">
                            <Button variant="outline" size="sm" onClick={() => handleExport("PNG")} className="bg-white/5 hover:bg-white/10 border-0 text-gray-300 backdrop-blur-sm text-xs px-3 py-1.5 rounded-md">
                              <Download className="mr-1 h-4 w-4" /> Export All
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleExport("Share")} className="bg-white/5 hover:bg-white/10 border-0 text-gray-300 backdrop-blur-sm text-xs px-3 py-1.5 rounded-md">
                              <Share2 className="mr-1 h-4 w-4" /> Share
                            </Button>
                          </div>
                        </div>
                        <ScrollArea className="h-[calc(100vh-320px)] pr-1">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {generatedCreatives.map((creative) => (
                              <CreativePreview key={creative.id} creative={creative} />
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {!isGenerating && generatedCreatives.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-96 bg-white/5 backdrop-blur-xl rounded-xl text-center text-gray-300">
                      <ImageIcon className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-200">Your creatives will appear here</h3>
                      <p className="mt-1 text-sm text-gray-400 px-4">Fill in the details and click 'Generate Creatives'.</p>
                    </div>
                  )}

                  {generatedCreatives.length > 0 && !isGenerating && (
                    <InspirationDropZone
                      inspirationImages={inspirationImages}
                      onDrop={handleInspirationDrop}
                      onDragOver={handleDragOver}
                      onRemoveImage={removeInspirationImage}
                      onUploadClick={handleInspirationUploadClick}
                    />
                  )}

                  <div className="mb-4">
                    <Label className="mb-2 block">Inspiration Image (Optional)</Label>
                    <InspirationDropZone
                      inspirationImages={inspirationImages}
                      onDrop={handleInspirationDrop}
                      onDragOver={handleDragOver}
                      onRemoveImage={removeInspirationImage}
                      onUploadClick={handleInspirationUploadClick}
                    />
                    <Input
                      ref={inspirationFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                           const reader = new FileReader();
                          reader.onloadend = () => {
                            const newImage: GeneratedCreative = {
                              id: Date.now().toString(),
                              b64_json: reader.result as string,
                               headline: "Uploaded Image",
                              description: file.name,
                              style: "inspiration",
                              variation: 0,
                              audience: "general",
                            };
                            setInspirationImages((prev) => [...prev, newImage]);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-6">
               <Card className="bg-white/5 backdrop-blur-xl shadow-2xl rounded-xl border-0 text-gray-200">
                <CardContent className="p-10 text-center">
                    <p className="text-gray-400">History feature coming soon!</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
