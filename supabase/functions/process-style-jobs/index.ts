/* eslint-disable */
// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// --- Detailed Style Replication Instructions (copied from edit-image) ---
const DETAILED_STYLE_INSTRUCTIONS = `
INSTRUCTIONS FOR STYLE REPLICATION:
- Font Style: Pay meticulous attention to replicating the exact font style, including typeface, weight, kerning, leading, and any specific typographic treatments (e.g., outlines, shadows, distortions) present in the reference images.
- Texture & Material: Analyze and reproduce the surface textures, material qualities (e.g., glossiness, grain, fabric weave, metallic sheen, matte finish), and overall finish seen in the reference images.
- Lighting & Shadows: Precisely match the lighting conditions, including the direction, intensity, softness/hardness, and color temperature of light sources. Replicate the resulting shadows, highlights, and reflections accurately.
- Color Palette: Strictly adhere to the exact color palette demonstrated in the reference images. Match primary, secondary, and accent colors, along with their precise hue, saturation, and brightness levels.
- Composition & Placement: Replicate the compositional structure, balance, and framing. Ensure the placement, scale, and orientation of elements relative to each other and the image borders match the references.
- Overall Aesthetic: Capture the overall mood, artistic style (e.g., minimalist, maximalist, retro, futuristic, photorealistic, illustrative, painterly), and visual essence of the reference images. Ensure the generated image feels like it belongs to the same set.
`;

// Helper function to safely get environment variables
function getEnvVar(key) {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Environment variable ${key} is not set.`);
  }
  return value;
}

// Helper function to convert base64 string to Blob
async function base64ToBlob(base64, contentType = 'image/png') {
  // Strip data URI prefix if present
  const base64Data = base64.startsWith('data:') ? base64.split(',')[1] : base64;
  if (!base64Data) {
    throw new Error("Invalid base64 string for blob conversion.");
  }
  // Deno's fetch can convert data URIs directly to blobs
  const response = await fetch(`data:${contentType};base64,${base64Data}`);
  if (!response.ok) {
    throw new Error("Failed to convert base64 to Blob using fetch.");
  }
  return await response.blob();
}

serve(async (_req) => {
  let job = null; // Declare job in outer scope for catch access
  console.log("Processing style jobs...");
  
  try {
    // Initialize Supabase Admin client
    const supabaseUrl = getEnvVar('SUPABASE_URL');
    const serviceRoleKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    // Get the oldest QUEUED job
    const { data: jobData, error: jobError } = await supabaseAdmin
      .from('style_jobs')
      .select('*')
      .eq('status', 'QUEUED')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    
    if (jobError) {
      console.error("Job fetch error:", jobError);
      return new Response(JSON.stringify({ error: jobError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }
    
    job = jobData;
    if (!job) {
      console.log("No jobs to process");
      return new Response(JSON.stringify({ message: "No jobs to process" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }
    
    console.log(`Processing job ${job.id} for user ${job.user_id}`);
    
    // Mark job as PROCESSING
    await supabaseAdmin
      .from('style_jobs')
      .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
      .eq('id', job.id);
    
    // STEP 1: Get inspiration images
    let inspirationImages = [];
    
    if (job.insp_paths && job.insp_paths.length > 0) {
      // Load images from storage
      console.log(`Loading ${job.insp_paths.length} inspiration images from storage`);
      
      for (const path of job.insp_paths) {
        const { data, error: downloadErr } = await supabaseAdmin.storage
          .from('generated-images')
          .download(path);
          
        if (downloadErr) {
          throw new Error(`Failed to download inspiration image at ${path}: ${downloadErr.message}`);
        }
        
        // Convert to base64
        const buffer = await data.arrayBuffer();
        const base64 = base64Encode(new Uint8Array(buffer));
        inspirationImages.push(base64);
      }
    }
    
    // STEP 2: Call OpenAI API
    const apiKey = getEnvVar("OPENAI_API_KEY");
    const openaiUrl = "https://api.openai.com/v1/images/edits";
    
    // Combine prompt with instructions
    const userContentPrompt = job.prompt;
    const finalPrompt = userContentPrompt + DETAILED_STYLE_INSTRUCTIONS;
    const numVariations = Math.max(1, Math.min(10, Number(job.n) || 1));
    const size = job.size || "1024x1024";
    
    // Prepare OpenAI API Request
    const formData = new FormData();
    formData.append('prompt', finalPrompt);
    formData.append('model', 'gpt-image-1');
    formData.append('n', String(numVariations));
    formData.append('size', size);
    
    // Convert and append inspiration images
    console.log("Converting images to Blobs...");
    for(let i = 0; i < inspirationImages.length; i++){
      try {
        const blob = await base64ToBlob(inspirationImages[i]);
        formData.append('image[]', blob, `image${i}.png`);
        console.log(`Appended image ${i} as Blob using key 'image[]'.`);
      } catch (conversionError) {
        console.error(`Error converting image ${i} to Blob:`, conversionError);
        throw new Error(`Failed to process inspiration image ${i + 1}.`);
      }
    }
    
    // Call OpenAI API
    console.log("Sending request to OpenAI...");
    const openaiResponse = await fetch(openaiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
      body: formData
    });
    
    // Handle OpenAI Response
    const responseBodyText = await openaiResponse.text();
    
    if (!openaiResponse.ok) {
      let errorMessage = "OpenAI API request failed";
      try {
        const errorBody = JSON.parse(responseBodyText);
        errorMessage = `${errorMessage}: ${errorBody?.error?.message || responseBodyText}`;
      } catch (e) {
        errorMessage = `${errorMessage}: ${responseBodyText}`;
      }
      throw new Error(errorMessage);
    }
    
    const responseData = JSON.parse(responseBodyText);
    
    if (!responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0) {
      throw new Error("OpenAI response did not contain valid image data");
    }
    
    const imageB64List = responseData.data.map((item) => item.b64_json);
    console.log(`Successfully generated ${imageB64List.length} images using inspiration.`);
    
    // STEP 3: Upload results to storage
    // Generate a unique execution ID that we'll use for storage paths and metadata
    const execId = crypto.randomUUID();
    const signedUrls = [];
    
    console.log(`Uploading ${imageB64List.length} images to storage...`);
    for (let i = 0; i < imageB64List.length; i++) {
      const filePath = `${job.user_id}/${execId}/${i}.png`;
      const fileBytes = Uint8Array.from(atob(imageB64List[i]), c => c.charCodeAt(0));
      
      // Upload to storage
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('generated-images')
        .upload(filePath, fileBytes, { contentType: 'image/png', upsert: true });
        
      if (uploadErr) {
        throw new Error(`Upload failed: ${uploadErr.message}`);
      }
      
      // Create signed URL
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from('generated-images')
        .createSignedUrl(filePath, 60 * 60);
        
      if (signErr) {
        throw new Error(`Failed to create signed URL: ${signErr.message}`);
      }
      
      signedUrls.push(signed.signedUrl);
      
      // Insert into generated_images table
      try {
        await supabaseAdmin.from('generated_images').insert({
          user_id: job.user_id,
          path: filePath,
          prompt: userContentPrompt,
          size,
          exec_id: execId
        });
      } catch (dbErr) {
        console.error('DB insert error:', dbErr);
      }
    }
    
    // STEP 4: Mark job as COMPLETED
    await supabaseAdmin
      .from('style_jobs')
      .update({ 
        status: 'COMPLETED', 
        exec_id: execId,
        updated_at: new Date().toISOString() 
      })
      .eq('id', job.id);
    
    console.log(`Job ${job.id} completed successfully. Execution ID: ${execId}`);
    
    return new Response(JSON.stringify({ 
      message: "Job processed successfully",
      job_id: job.id,
      exec_id: execId,
      images: signedUrls
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
    
  } catch (error) {
    console.error("Job processing error:", error);
    
    // Try to update the job status to FAILED if we have a job ID
    try {
      if (job?.id) {
        await supabaseAdmin
          .from('style_jobs')
          .update({ 
            status: 'FAILED', 
            error_message: error.message || "Unknown error",
            updated_at: new Date().toISOString() 
          })
          .eq('id', job.id);
        
        console.log(`Job ${job.id} marked as FAILED`);
      }
    } catch (updateErr) {
      console.error("Failed to update job status:", updateErr);
    }
    
    return new Response(JSON.stringify({
      error: error.message || "An internal server error occurred."
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
}); 