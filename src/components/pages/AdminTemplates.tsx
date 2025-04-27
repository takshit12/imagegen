import { useState, useEffect } from 'react';
import { supabase } from '../../../supabase/supabase'; // <-- ADD THIS IMPORT (adjust path if needed)
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Interface for the structure of required_inputs JSON (for validation)
interface RequiredInputConfig {
    id: string;
    label: string;
    type: 'text' | 'image_upload' | 'color' | 'number'; // Add more types as needed
    required?: boolean;
    defaultValue?: string | number | boolean;
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    // Other potential properties
}

export default function AdminTemplates() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    
    // State for admin verification
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);

    // Check if user is admin on component mount
    useEffect(() => {
        async function checkAdminStatus() {
            try {
                setIsCheckingAdmin(true);
                
                // Get current user
                const { data: { user }, error } = await supabase.auth.getUser();
                
                if (error || !user) {
                    console.error("Auth error:", error);
                    setIsAdmin(false);
                    toast({
                        title: "Authentication Error",
                        description: "Please log in to access this page.",
                        variant: "destructive",
                    });
                    navigate('/login');
                    return;
                }
                
                // Check if user has admin role in metadata
                // You need to have set this in your Supabase auth user metadata
                const isUserAdmin = user.user_metadata?.is_admin === true;
                
                setIsAdmin(isUserAdmin);
                
                if (!isUserAdmin) {
                    toast({
                        title: "Access Denied",
                        description: "You don't have permission to access this page.",
                        variant: "destructive",
                    });
                    navigate('/');
                }
            } catch (error) {
                console.error("Admin check failed:", error);
                setIsAdmin(false);
            } finally {
                setIsCheckingAdmin(false);
            }
        }
        
        checkAdminStatus();
    }, [navigate, toast]);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [basePrompt, setBasePrompt] = useState('');
    const [requiredInputsJson, setRequiredInputsJson] = useState('[]'); // Start with empty array JSON
    const [isActive, setIsActive] = useState(true);
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [referenceFiles, setReferenceFiles] = useState<FileList | null>(null);

    // --- Helper Function: Upload file to Supabase Storage ---
    const uploadFile = async (file: File, bucket: string, pathPrefix: string): Promise<string> => {
        const fileExt = file.name.split('.').pop();
        const filePath = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { error: uploadError, data: uploadData } = await supabase.storage
            .from(bucket)
            .upload(filePath, file);

        if (uploadError) {
            console.error("Upload Error:", uploadError);
            throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
        }

        // Construct the public URL
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

        if (!urlData || !urlData.publicUrl) {
             console.error("URL Error: Could not get public URL after upload for", filePath);
             // Fallback or specific error handling needed if public URLs are disabled or fail
             throw new Error(`Uploaded ${file.name} but failed to get its public URL.`);
        }
        console.log(`Uploaded ${file.name} to ${urlData.publicUrl}`);
        return urlData.publicUrl;
    };

    // --- Form Submission Handler ---
    const handleAddTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // 1. Validate Required Inputs
        if (!name || !basePrompt || !thumbnailFile) {
            toast({ title: "Missing Fields", description: "Name, Base Prompt, and Thumbnail Image are required.", variant: "destructive" });
            setIsLoading(false);
            return;
        }

        // 2. Validate requiredInputsJson structure
        let parsedRequiredInputs: RequiredInputConfig[] = [];
        try {
            parsedRequiredInputs = JSON.parse(requiredInputsJson);
            if (!Array.isArray(parsedRequiredInputs)) {
                throw new Error("required_inputs must be a JSON array.");
            }
            // Add more validation here if needed (e.g., check object structure)
        } catch (error: any) {
            toast({ title: "Invalid JSON", description: `Error parsing Required Inputs JSON: ${error.message}`, variant: "destructive" });
            setIsLoading(false);
            return;
        }

        try {
            // 3. Upload Thumbnail Image
            const thumbnailUrl = await uploadFile(thumbnailFile, 'template-images', 'thumbnails');

            // 4. Upload Reference Images (if any)
            const referenceImageUrls: string[] = [];
            if (referenceFiles) {
                for (const file of Array.from(referenceFiles)) {
                    const url = await uploadFile(file, 'template-images', 'references');
                    referenceImageUrls.push(url);
                }
            }

            // 5. Prepare Data for Supabase Table
            const newTemplateData = {
                name,
                description: description || null, // Use null if empty
                base_prompt: basePrompt,
                thumbnail_url: thumbnailUrl,
                reference_image_urls: referenceImageUrls.length > 0 ? referenceImageUrls : null,
                required_inputs: parsedRequiredInputs,
                is_active: isActive,
            };

             console.log("Inserting new template:", newTemplateData);

            // 6. Insert into Supabase
            const { error: insertError, data: insertData } = await supabase
                .from('style_templates')
                .insert([newTemplateData])
                .select(); // Optionally select to confirm insertion

            if (insertError) {
                console.error("Insert Error:", insertError);
                throw new Error(`Failed to add template: ${insertError.message}`);
            }

             console.log("Insertion successful:", insertData);
            toast({ title: "Template Added", description: `Successfully added template: ${name}` });

            // 7. Reset Form (Optional)
            setName('');
            setDescription('');
            setBasePrompt('');
            setRequiredInputsJson('[]');
            setIsActive(true);
            setThumbnailFile(null);
            setReferenceFiles(null);
            // Clear file input elements visually if needed (using refs or key prop)


        } catch (error: any) {
            console.error("Failed to add template:", error);
            toast({ title: "Error Adding Template", description: error.message || "An unexpected error occurred.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };


    // --- Render Form ---
    // If still checking admin status, show loading
    if (isCheckingAdmin) {
        return (
            <div className="container mx-auto py-10 px-4 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-center mx-auto mb-4" />
                    <p>Verifying permissions...</p>
                </div>
            </div>
        );
    }
    
    // If not admin, don't render admin content (should already be redirected)
    if (isAdmin === false) {
        return (
            <div className="container mx-auto py-10 px-4">
                <div className="text-center">
                    <p className="text-red-500">Access Denied. Admins only.</p>
                    <Button onClick={() => navigate('/')} className="mt-4">Back to Home</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-6">Admin - Manage Style Templates</h1>

            <Card className="max-w-3xl mx-auto">
                <CardHeader>
                    <CardTitle>Add New Style Template</CardTitle>
                    <CardDescription>Define a new template for users to generate images from.</CardDescription>
                </CardHeader>
                <form onSubmit={handleAddTemplate}>
                    <CardContent className="space-y-4">
                        {/* Name */}
                        <div className="space-y-1">
                            <Label htmlFor="name">Template Name <span className="text-red-500">*</span></Label>
                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g., Bubble Wrap Logo" />
                        </div>

                        {/* Description */}
                        <div className="space-y-1">
                            <Label htmlFor="description">Description</Label>
                            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Briefly explain what this template does." />
                        </div>

                        {/* Base Prompt */}
                        <div className="space-y-1">
                            <Label htmlFor="basePrompt">Base Prompt <span className="text-red-500">*</span></Label>
                            <Textarea id="basePrompt" value={basePrompt} onChange={(e) => setBasePrompt(e.target.value)} required rows={6} placeholder="The core, non-editable prompt. Use {{placeholder_id}} for user inputs defined below (e.g., {{user_logo_description}}, {{color1}})." />
                        </div>

                        {/* Thumbnail Image */}
                        <div className="space-y-1">
                            <Label htmlFor="thumbnail">Thumbnail Image <span className="text-red-500">*</span></Label>
                            <Input id="thumbnail" type="file" accept="image/*" onChange={(e) => setThumbnailFile(e.target.files ? e.target.files[0] : null)} required />
                            {thumbnailFile && <p className="text-sm text-muted-foreground">Selected: {thumbnailFile.name}</p>}
                        </div>

                        {/* Reference Images */}
                        <div className="space-y-1">
                            <Label htmlFor="referenceImages">Reference Images (Optional)</Label>
                            <Input id="referenceImages" type="file" accept="image/*" multiple onChange={(e) => setReferenceFiles(e.target.files)} />
                            {referenceFiles && referenceFiles.length > 0 && <p className="text-sm text-muted-foreground">Selected: {Array.from(referenceFiles).map(f => f.name).join(', ')}</p>}
                        </div>

                         {/* Required Inputs JSON */}
                         <div className="space-y-1">
                            <Label htmlFor="requiredInputs">Required User Inputs (JSON Array)</Label>
                            <Textarea
                                id="requiredInputs"
                                value={requiredInputsJson}
                                onChange={(e) => setRequiredInputsJson(e.target.value)}
                                rows={8}
                                placeholder='Paste JSON array defining inputs, e.g., [{"id": "user_logo", "label": "Upload Logo", "type": "image_upload", "required": true}]'
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Define inputs needed from the user. Types: "text", "image_upload", "color", "number". Include "id", "label", "type", optionally "required", "defaultValue", etc.
                            </p>
                        </div>

                        {/* Is Active */}
                        <div className="flex items-center space-x-2">
                            <Checkbox id="isActive" checked={isActive} onCheckedChange={(checked) => setIsActive(Boolean(checked))} />
                            <Label htmlFor="isActive">Active (Visible to Users)</Label>
                        </div>

                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                            Add Template
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {/* Add sections for Listing/Editing/Deleting templates later */}
            <div className="mt-10">
                <h2 className="text-2xl font-bold mb-4">Existing Templates</h2>
                {/* Placeholder for listing templates */}
                <p className="text-muted-foreground">(Template list will appear here)</p>
            </div>
        </div>
    );
}

// Helper to get Supabase client instance if not globally available
// You might have a different setup for accessing your Supabase client
// import { createClient } from '@supabase/supabase-js';
// const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// const supabase = createClient(supabaseUrl!, supabaseAnonKey!);
// Make sure this client has permissions based on your RLS for the admin actions