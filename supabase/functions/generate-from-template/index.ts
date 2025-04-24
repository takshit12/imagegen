import { serve } from 'https://deno.land/std@0.170.0/http/server.ts'; // Use a slightly newer std version if available/needed
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'; // Ensure this matches version used elsewhere
import { corsHeaders } from '../_shared/cors.ts'; // Assuming shared CORS headers

// --- Interfaces (Define expected request and template structure) ---

interface UserInput {
  // This will dynamically contain keys based on the template's required_inputs
  // e.g., { user_logo?: string; color1?: string; user_text?: string; ... }
  [key: string]: string | number | boolean | undefined | null;
}

interface RequestPayload {
  templateId: string;
  userInput: UserInput;
  n?: number; // Optional: Number of variations (could be fixed in template or passed)
  size?: string; // Optional: Output size (could be fixed in template or passed)
}

interface StyleTemplate {
  id: string;
  name: string;
  base_prompt: string;
  reference_image_urls?: string[]; // URLs from Supabase storage
  required_inputs?: { id: string; type: string; [key: string]: any }[]; // Input definitions
  // Add other fields if needed by the function logic
}

// --- Helper: Placeholder Replacer ---
// Simple placeholder replacement (e.g., {{placeholder}})
function replacePlaceholders(prompt: string, values: UserInput): string {
  let processedPrompt = prompt;
  for (const key in values) {
    // Ensure value is a string or convert; handle null/undefined
    const valueStr = values[key] === null || values[key] === undefined ? '' : String(values[key]);
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g'); // Match {{ key }}
    processedPrompt = processedPrompt.replace(placeholder, valueStr);
  }
  // Remove any remaining unmatched placeholders (optional)
  processedPrompt = processedPrompt.replace(/{{\s*\w+\s*}}/g, '');
  return processedPrompt;
}

// --- Main Function Logic ---
serve(async (req: Request) => {
  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Initialize Supabase Admin Client (use environment variables)
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use Service Role Key for backend access
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } } // Pass user auth if needed for RLS checks within function
    );

    // 3. Parse Request Body
    const payload: RequestPayload = await req.json();
    const { templateId, userInput, n = 1, size = '1024x1024' } = payload; // Default size/n if not provided

    if (!templateId || !userInput) {
      throw new Error('Missing templateId or userInput in request body.');
    }

    console.log(`Generating from template: ${templateId} with user input:`, userInput);

    // 4. Fetch Template Definition from Supabase
    const { data: template, error: templateError } = await supabaseAdminClient
      .from('style_templates')
      .select('*') // Fetch all columns needed
      .eq('id', templateId)
      .single(); // Expect only one template

    if (templateError) throw templateError;
    if (!template) throw new Error(`Template with ID ${templateId} not found.`);

    console.log("Fetched template:", template.name);

    // 5. Process Prompt: Replace placeholders in base_prompt with userInput values
    const finalPrompt = replacePlaceholders(template.base_prompt, userInput);
    console.log("Processed prompt:", finalPrompt);

    // 6. Prepare FormData for OpenAI
    const formData = new FormData();
    formData.append('prompt', finalPrompt);
    formData.append('model', 'dall-e-3'); // Or the model suitable for dall-e-3
    formData.append('n', String(n));
    formData.append('size', size);
    formData.append('response_format', 'b64_json'); // Make sure it returns base64

    // 7. Handle User-Uploaded Images (if any) - Identify based on userInput keys/template definition
    //    Requires agreement on how image data (base64) is passed in userInput
    //    Example: if userInput contains a 'user_logo' field with base64 data
    let hasImageUploads = false;
    
    if (template.required_inputs && Array.isArray(template.required_inputs)) {
      const imageInputKeys = template.required_inputs
          .filter((input: any) => input.type === 'image_upload')
          .map((input: any) => input.id);

      for (const key of imageInputKeys) {
          const base64Data = userInput[key];
          if (typeof base64Data === 'string' && base64Data.length > 10) { // Basic check for non-empty base64
              try {
                  // Convert base64 to Blob
                  const byteString = atob(base64Data);
                  const mimeString = 'image/png'; // Or detect from base64 prefix if included
                  const ab = new ArrayBuffer(byteString.length);
                  const ia = new Uint8Array(ab);
                  for (let i = 0; i < byteString.length; i++) {
                      ia[i] = byteString.charCodeAt(i);
                  }
                  const blob = new Blob([ab], { type: mimeString });

                  // Append to FormData - For DALL-E 3, we can't use variation API with reference images
                  // We need to decide how to handle and incorporate user images:
                  // 1. Use the images/generations endpoint with prompt only (as we're doing now)
                  // 2. Consider using images/edits endpoint if we want to edit the user's uploaded image
                  
                  formData.append('image', blob, `${key}.png`); // Only for edits endpoint
                  hasImageUploads = true;
                  console.log(`Appended user image from input key: ${key}`);
              } catch (e) {
                  console.error(`Failed to decode/append base64 image for key ${key}:`, e);
                  // Decide if this should be a fatal error or just a warning
              }
          }
      }
    }

    // 8. Fetch & Process Reference Images (if any) from Supabase Storage
    // For DALL-E 3's `generations` endpoint, we don't use reference images directly
    // Instead, we need to ensure our prompt utilizes style descriptions effectively
    // If absolutely needed, consider using the edit or variation endpoints instead

    // 9. Call OpenAI API - Choose the right endpoint based on our needs:
    // - generations: If just using the prompt (with no uploaded images)
    // - edits: If we want to use the uploaded image as a base
    let openaiUrl;
    
    if (hasImageUploads) {
      // If user uploaded an image, use the edits endpoint
      openaiUrl = 'https://api.openai.com/v1/images/edits';
      // Note: For edits, we'd need to append 'mask' too if needed
    } else {
      // If no image uploaded, use the generations endpoint
      openaiUrl = 'https://api.openai.com/v1/images/generations';
    }
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable.');
    }

    console.log(`Calling OpenAI API: ${openaiUrl}`);
    const response = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        // Content-Type is set automatically by fetch when using FormData
      },
      body: formData,
    });

    // 10. Handle OpenAI Response
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('OpenAI API Error:', response.status, errorBody);
      throw new Error(`OpenAI API request failed: ${response.status} ${errorBody}`);
    }

    const result = await response.json();
    console.log("OpenAI response received:", result);

    // Extract base64 images from the response
    const images = result.data.map((img: any) => img.b64_json);

    // 11. Return Success Response
    return new Response(JSON.stringify({ images }), { // Match expected frontend format
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in generate-from-template function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
