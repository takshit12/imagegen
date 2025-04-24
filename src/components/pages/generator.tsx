import { useState } from "react";
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
import CreativePreview from "../generator/CreativePreview";
import { useToast } from "@/components/ui/use-toast";

export default function Generator() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCreatives, setGeneratedCreatives] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    headline: "",
    description: "",
    audience: "",
    style: "modern",
    variations: 5,
    includeProductImage: true,
    productImageUrl: "",
  });

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

  const handleGenerate = () => {
    // Validate form
    if (!formData.headline) {
      toast({
        title: "Missing information",
        description: "Please enter a headline for your ad",
        variant: "destructive",
      });
      return;
    }

    if (!formData.description) {
      toast({
        title: "Missing information",
        description: "Please enter a product description",
        variant: "destructive",
      });
      return;
    }

    if (!formData.audience) {
      toast({
        title: "Missing information",
        description: "Please define your target audience",
        variant: "destructive",
      });
      return;
    }

    if (formData.includeProductImage && !formData.productImageUrl) {
      toast({
        title: "Missing information",
        description:
          "Please provide a product image URL or disable the product image option",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    // Simulate API call with timeout
    setTimeout(() => {
      // Mock generated creatives
      const mockCreatives = Array.from(
        { length: formData.variations },
        (_, i) => ({
          id: `creative-${i}`,
          headline: formData.headline,
          description: formData.description,
          imageUrl: `https://images.unsplash.com/photo-${1550000000 + i}?w=800&q=80`,
          style: formData.style,
          variation: i + 1,
        }),
      );

      setGeneratedCreatives(mockCreatives);
      setIsGenerating(false);

      toast({
        title: "Creatives generated",
        description: `Successfully created ${formData.variations} ad variations`,
      });
    }, 3000);
  };

  const handleExport = (type: string) => {
    toast({
      title: "Export initiated",
      description: `Exporting creatives as ${type}...`,
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              A/B Test Creative Generator
            </h1>
            <p className="text-gray-500 mt-1">
              Generate multiple ad variations to optimize your campaign
              performance
            </p>
          </div>

          <Tabs defaultValue="generator" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="generator">Generator</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="generator" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Input Form */}
                <Card className="lg:col-span-1 border-gray-200">
                  <CardContent className="pt-6">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="headline"
                            className="text-base font-medium"
                          >
                            Ad Headline
                          </Label>
                          <Badge variant="outline" className="font-normal">
                            Required
                          </Badge>
                        </div>
                        <Input
                          id="headline"
                          name="headline"
                          placeholder="Enter your main ad headline"
                          value={formData.headline}
                          onChange={handleInputChange}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="description"
                            className="text-base font-medium"
                          >
                            Product Description
                          </Label>
                          <Badge variant="outline" className="font-normal">
                            Required
                          </Badge>
                        </div>
                        <Textarea
                          id="description"
                          name="description"
                          placeholder="Describe your product or service"
                          rows={4}
                          value={formData.description}
                          onChange={handleInputChange}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="audience"
                            className="text-base font-medium"
                          >
                            Target Audience
                          </Label>
                          <Badge variant="outline" className="font-normal">
                            Required
                          </Badge>
                        </div>
                        <Textarea
                          id="audience"
                          name="audience"
                          placeholder="Describe your target audience (age, interests, pain points)"
                          rows={3}
                          value={formData.audience}
                          onChange={handleInputChange}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <h3 className="text-base font-medium flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" /> Product Image
                        </h3>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id="includeProductImage"
                            checked={formData.includeProductImage}
                            onCheckedChange={(checked) =>
                              handleSwitchChange("includeProductImage", checked)
                            }
                          />
                          <Label htmlFor="includeProductImage">
                            Include product image
                          </Label>
                        </div>

                        {formData.includeProductImage && (
                          <div className="space-y-2">
                            <Label htmlFor="productImageUrl">Image URL</Label>
                            <Input
                              id="productImageUrl"
                              name="productImageUrl"
                              placeholder="https://example.com/image.jpg"
                              value={formData.productImageUrl}
                              onChange={handleInputChange}
                            />
                          </div>
                        )}
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <h3 className="text-base font-medium flex items-center gap-2">
                          <Palette className="h-4 w-4" /> Style Preferences
                        </h3>

                        <div className="space-y-2">
                          <Label htmlFor="style">Visual Style</Label>
                          <Select
                            value={formData.style}
                            onValueChange={(value) =>
                              handleSelectChange("style", value)
                            }
                          >
                            <SelectTrigger id="style">
                              <SelectValue placeholder="Select style" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="modern">
                                Modern & Minimal
                              </SelectItem>
                              <SelectItem value="bold">
                                Bold & Vibrant
                              </SelectItem>
                              <SelectItem value="elegant">
                                Elegant & Sophisticated
                              </SelectItem>
                              <SelectItem value="playful">
                                Playful & Fun
                              </SelectItem>
                              <SelectItem value="corporate">
                                Corporate & Professional
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <h3 className="text-base font-medium flex items-center gap-2">
                          <Sparkles className="h-4 w-4" /> Generation Options
                        </h3>

                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Label htmlFor="variations">
                              Number of Variations
                            </Label>
                            <span className="text-sm text-gray-500">
                              {formData.variations}
                            </span>
                          </div>
                          <Slider
                            id="variations"
                            min={3}
                            max={10}
                            step={1}
                            value={[formData.variations]}
                            onValueChange={(value) =>
                              handleSliderChange("variations", value)
                            }
                          />
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        size="lg"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Wand2 className="mr-2 h-4 w-4" />
                            Generate Creatives
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Preview Area */}
                <div className="lg:col-span-2">
                  {generatedCreatives.length > 0 ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold">
                          Generated Creatives
                        </h2>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport("images")}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport("adplatform")}
                          >
                            <Share2 className="mr-2 h-4 w-4" />
                            Export to Ad Platform
                          </Button>
                        </div>
                      </div>

                      <ScrollArea className="h-[calc(100vh-240px)]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pr-4">
                          {generatedCreatives.map((creative) => (
                            <CreativePreview
                              key={creative.id}
                              creative={creative}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-gray-200 rounded-lg">
                      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <Wand2 className="h-10 w-10 text-gray-400" />
                      </div>
                      <h3 className="text-xl font-medium mb-2">
                        No creatives generated yet
                      </h3>
                      <p className="text-gray-500 mb-6 max-w-md">
                        Fill out the form with your ad details and click
                        "Generate Creatives" to create multiple ad variations.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-xl font-medium mb-2">Usage History</h3>
                <p className="text-gray-500 mb-6">
                  Track your generation history and remaining credits here.
                </p>
                <div className="max-w-xs mx-auto bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Total Generations</span>
                    <span className="font-medium">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Remaining Credits</span>
                    <span className="font-medium">50</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
