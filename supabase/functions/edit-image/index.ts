import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts"; // Adjust path/definition if needed
// Helper function to safely get environment variables
function getEnvVar(key) {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Environment variable ${key} is not set.`);
  }
  return value;
}
// --- Detailed Style Replication Instructions ---
const DETAILED_STYLE_INSTRUCTIONS = `

INSTRUCTIONS FOR STYLE REPLICATION:
- Font Style: Pay meticulous attention to replicating the exact font style, including typeface, weight, kerning, leading, and any specific typographic treatments (e.g., outlines, shadows, distortions) present in the reference images.
- Texture & Material: Analyze and reproduce the surface textures, material qualities (e.g., glossiness, grain, fabric weave, metallic sheen, matte finish), and overall finish seen in the reference images.
- Lighting & Shadows: Precisely match the lighting conditions, including the direction, intensity, softness/hardness, and color temperature of light sources. Replicate the resulting shadows, highlights, and reflections accurately.
- Color Palette: Strictly adhere to the exact color palette demonstrated in the reference images. Match primary, secondary, and accent colors, along with their precise hue, saturation, and brightness levels.
- Composition & Placement: Replicate the compositional structure, balance, and framing. Ensure the placement, scale, and orientation of elements relative to each other and the image borders match the references.
- Overall Aesthetic: Capture the overall mood, artistic style (e.g., minimalist, maximalist, retro, futuristic, photorealistic, illustrative, painterly), and visual essence of the reference images. Ensure the generated image feels like it belongs to the same set.
`;
// -------------------------------------------
// Helper function to convert base64 string (potentially data URI) to Blob
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
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  console.log("edit-image function invoked (using multipart/form-data).");
  try {
    const apiKey = getEnvVar("OPENAI_API_KEY");
    // NOTE: The documentation isn't explicit about the endpoint for gpt-image-1 multi-image input.
    // We'll *assume* it's still /v1/images/generations based on the model name, but this might need
    // adjustment if OpenAI uses a different endpoint like /v1/images/edits or similar for this model.
    const openaiUrl = "https://api.openai.com/v1/images/edits";
    // --- Get data from Frontend Request ---
    const { prompt: userContentPrompt, inspirationImages, n = 1, size = "1024x1024" } = await req.json(); // Renamed variable for clarity
    console.log("Received user content prompt:", userContentPrompt ? "Yes" : "No");
    console.log("Received inspiration images count:", inspirationImages?.length || 0);
    // --- Input Validation ---
    if (!userContentPrompt) {
      throw new Error("Missing required field: prompt (for new image content).");
    }
    if (!inspirationImages || !Array.isArray(inspirationImages) || inspirationImages.length === 0 || inspirationImages.length > 4) {
      throw new Error("Missing or invalid 'inspirationImages' field. Provide 1 to 4 base64 encoded images.");
    }
    // Basic check if strings are provided
    if (!inspirationImages.every((img)=>typeof img === 'string' && img.length > 10)) {
      throw new Error("Invalid 'inspirationImages' field. All items must be non-empty strings.");
    }
    const numVariations = Math.max(1, Math.min(10, Number(n) || 1));
    // --- Combine User Prompt with Detailed Instructions ---
    const finalPrompt = userContentPrompt + DETAILED_STYLE_INSTRUCTIONS;
    console.log("Constructed final prompt for OpenAI."); // Log that the prompt is combined
    // --- Prepare OpenAI API Request Body as FormData ---
    const formData = new FormData();
    formData.append('prompt', finalPrompt); // Use the combined prompt
    formData.append('model', 'gpt-image-1');
    formData.append('n', String(numVariations));
    formData.append('size', size);
    // Add other text parameters if needed (quality, etc.)
    // formData.append('quality', 'auto');
    // Convert base64 images to Blobs and append them
    // Use the same field name 'image' for all, as suggested by some API patterns
    console.log("Converting images to Blobs...");
    for(let i = 0; i < inspirationImages.length; i++){
      try {
        const blob = await base64ToBlob(inspirationImages[i]);
        // --- Use image[] syntax as suggested by the OpenAI error --- 
        formData.append('image[]', blob, `image${i}.png`);
        console.log(`Appended image ${i} as Blob using key 'image[]'.`); // Updated log
      } catch (conversionError) {
        console.error(`Error converting image ${i} to Blob:`, conversionError);
        throw new Error(`Failed to process inspiration image ${i + 1}. Ensure it's a valid base64 string.`);
      }
    }
    console.log("Sending multipart/form-data request to OpenAI...");
    // --- Call OpenAI API ---
    const openaiResponse = await fetch(openaiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
      body: formData
    });
    // --- Handle OpenAI Response ---
    const responseBodyText = await openaiResponse.text();
    console.log("Received response status from OpenAI:", openaiResponse.status);
    // console.log("Received response body from OpenAI:", responseBodyText);
    if (!openaiResponse.ok) {
      let errorBody;
      try {
        errorBody = JSON.parse(responseBodyText);
        console.error("OpenAI API Error Body:", errorBody);
      } catch (e) {
        console.error("Failed to parse OpenAI error response:", responseBodyText);
        errorBody = {
          error: {
            message: responseBodyText
          }
        };
      }
      // Check for specific error messages if OpenAI provides hints
      if (responseBodyText.includes("Invalid image format") || responseBodyText.includes("Could not process image")) {
        throw new Error(`OpenAI could not process the provided inspiration images. Status: ${openaiResponse.status}`);
      }
      throw new Error(`OpenAI API request failed: ${openaiResponse.status} ${openaiResponse.statusText} - ${errorBody?.error?.message || 'Unknown error details'}`);
    }
    const responseData = JSON.parse(responseBodyText);
    if (!responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0 || !responseData.data[0].b64_json) {
      console.error("Invalid or empty data structure received from OpenAI:", responseData);
      throw new Error("OpenAI response did not contain valid image data.");
    }
    const imageB64List = responseData.data.map((item)=>item.b64_json);
    console.log(`Successfully generated ${imageB64List.length} images using inspiration.`);

    // === NEW: Upload images to Supabase Storage and return signed URLs ===
    try {
      // Lazy import to avoid bundle size if not used elsewhere
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

      const supabaseUrl = getEnvVar('SUPABASE_URL');
      const serviceRoleKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

      // Extract user id from JWT if provided, else use 'anonymous'
      let uid = 'anonymous';
      const authHeader = req.headers.get('authorization') || '';
      if (authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.slice(7);
          const [, payload] = token.split('.');
          const jsonPayload = JSON.parse(atob(payload));
          uid = jsonPayload.sub || jsonPayload.user_id || 'anonymous';
        } catch (_) {
          // ignore decoding errors
        }
      }

      const execId = crypto.randomUUID();
      const signedUrls: string[] = [];

      for (let i = 0; i < imageB64List.length; i++) {
        const filePath = `${uid}/${execId}/${i}.png`;
        const fileBytes = Uint8Array.from(atob(imageB64List[i]), c=>c.charCodeAt(0));

        // Upload (overwriting if exists just in case)
        const { error: uploadErr } = await supabaseAdmin.storage
          .from('generated-images')
          .upload(filePath, fileBytes, { contentType: 'image/png', upsert: true });
        if (uploadErr) throw uploadErr;

        // Create 1-hour signed URL
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from('generated-images')
          .createSignedUrl(filePath, 60 * 60);
        if (signErr) throw signErr;

        signedUrls.push(signed.signedUrl);
      }

      // --- Send Response back to Frontend ---
      return new Response(JSON.stringify({ images: signedUrls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } catch (storageErr) {
      console.error('Storage upload/sign error, falling back to base64:', storageErr);
      // Fallback: return base64 if storage fails (keeps old behaviour)
      return new Response(JSON.stringify({ images: imageB64List }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (error) {
    console.error("Function Error:", error);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return new Response(JSON.stringify({
      error: error.message || "An internal server error occurred."
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
}); // Define inline CORS headers if needed
 // const corsHeaders = {
 //   'Access-Control-Allow-Origin': '*', // Or specific origin
 //   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 // };
