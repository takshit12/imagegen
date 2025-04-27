# Plan: Custom UGC Lipsync Feature using Fal AI

This document outlines the steps required to implement a feature allowing users to upload a video and an audio file (max 1 minute each) and generate a lipsynced video using the Fal AI `sync-lipsync/v2` model. The implementation will leverage Supabase for backend logic (Edge Functions, Database, Storage for results tracking) and Fal AI's queue and webhooks for handling asynchronous processing.

**Core Technologies:**

*   **Frontend:** React (Vite), Supabase Client Library (`@supabase/supabase-js`)
*   **Backend:** Supabase Edge Functions (Deno), Supabase Database (Postgres), Supabase Auth, Supabase Realtime
*   **AI Model:** Fal AI (`fal-ai/sync-lipsync/v2`)
*   **AI Client:** Fal AI Client (`@fal-ai/client`)

---

## Phase 1: Setup & Configuration

1.  **Fal AI Account & API Key:**
    *   [ ] Sign up for an account at [fal.ai](https://fal.ai/).
    *   [ ] Obtain your Fal AI API Key (`FAL_KEY`).

2.  **Supabase Project Secrets:**
    *   [ ] Securely add the Fal AI API Key to your Supabase project secrets. This key will be accessed by the Edge Functions.
        ```bash
        supabase secrets set FAL_KEY=YOUR_ACTUAL_FAL_KEY
        ```
    *   [ ] Verify the secret is set correctly: `supabase secrets list`.

3.  **Database Table (`lipsync_jobs`):**
    *   [ ] Create a new table named `lipsync_jobs` in the `public` schema via the Supabase Dashboard SQL Editor or a migration file.
    *   [ ] Define the following columns:
        *   `id`: `uuid`, Primary Key, Default: `gen_random_uuid()`
        *   `user_id`: `uuid`, Foreign Key -> `auth.users(id)`, Not Null
        *   `fal_request_id`: `text`, Nullable (Stores the ID from Fal AI queue submission)
        *   `status`: `text`, Not Null, Default: `'PENDING'` (Possible values: `PENDING`, `UPLOADING`, `PROCESSING`, `COMPLETED`, `FAILED`)
        *   `input_video_url`: `text`, Not Null (URL from Fal Storage)
        *   `input_audio_url`: `text`, Not Null (URL from Fal Storage)
        *   `output_video_url`: `text`, Nullable (URL of the final video from Fal AI)
        *   `error_message`: `text`, Nullable (Stores error details if the job fails)
        *   `created_at`: `timestamp with time zone`, Not Null, Default: `now()`
        *   `updated_at`: `timestamp with time zone`, Not Null, Default: `now()`
    *   [ ] **Indexes:** Consider adding indexes on `user_id`, `status`, and `fal_request_id` for potential performance improvements.

4.  **Row Level Security (RLS) for `lipsync_jobs`:**
    *   [ ] Enable RLS for the `lipsync_jobs` table.
    *   [ ] Create a policy allowing authenticated users to `SELECT` their own jobs:
        ```sql
        CREATE POLICY "Allow users to select own jobs"
        ON public.lipsync_jobs
        FOR SELECT
        USING (auth.uid() = user_id);
        ```
    *   [ ] Create a policy allowing authenticated users to `INSERT` new jobs (the Edge Function will perform the insert on their behalf but needs this check):
        ```sql
        CREATE POLICY "Allow authenticated users to insert jobs"
        ON public.lipsync_jobs
        FOR INSERT
        WITH CHECK (auth.role() = 'authenticated');
        -- Note: The Edge function using service_role will bypass this,
        -- but it's good practice if direct inserts were ever allowed.
        -- Alternatively, restrict INSERT to the service_role key only if preferred.
        ```
    *   [ ] Create a policy allowing the `service_role` (used by Edge Functions internally when configured) to `UPDATE` job status based on `id` and `fal_request_id`. This is crucial for the webhook handler.
        ```sql
        CREATE POLICY "Allow service role to update jobs"
        ON public.lipsync_jobs
        FOR UPDATE
        USING (true) -- Or restrict based on role if needed
        WITH CHECK (true); -- Be cautious, refine if necessary
        ```
        *(Alternative for Update: Create a specific `SECURITY DEFINER` function for updates triggered only by the webhook function)*

5.  **Enable Realtime for `lipsync_jobs`:**
    *   [ ] In the Supabase Dashboard, navigate to Database -> Replication.
    *   [ ] Ensure the `public` schema is enabled (usually is by default).
    *   [ ] Find the `lipsync_jobs` table and ensure "Enable Realtime" is toggled ON.

---

## Phase 2: Backend Logic (Supabase Edge Functions)

*Prerequisite: Install `@fal-ai/client` as a dev dependency for type support if needed, and ensure it's included in the Edge Function bundle.*

1.  **Edge Function: `submit-lipsync-job`**
    *   [ ] Create a new Edge Function: `supabase functions new submit-lipsync-job`.
    *   [ ] **Purpose:** Handles file uploads to Fal Storage, initiates the Fal AI job via queue, and records the job details in the database.
    *   [ ] **Trigger:** HTTP POST.
    *   [ ] **Authentication:** Verify Supabase JWT from the `Authorization: Bearer <token>` header. Reject if invalid/missing.
    *   [ ] **Input:** `FormData` containing `videoFile` (Blob/File) and `audioFile` (Blob/File).
    *   [ ] **Steps:**
        *   [ ] Initialize Supabase client (using service role for DB updates might be simplest here).
        *   [ ] Initialize Fal AI client (`@fal-ai/client`). Retrieve `FAL_KEY` from environment variables (`Deno.env.get('FAL_KEY')`). Configure the client.
        *   [ ] Get `user_id` from the verified JWT.
        *   [ ] Extract `videoFile` and `audioFile` from the request body (`req.formData()`).
        *   [ ] **File Validation:** Check file types (e.g., `video/*`, `audio/*`) and potentially file sizes (e.g., < 100MB limit, adjust as needed). Reject if invalid. *Note: Duration check is difficult here.*
        *   [ ] **Upload to Fal Storage:**
            *   [ ] Call `const video_url = await fal.storage.upload(videoFile);`
            *   [ ] Call `const audio_url = await fal.storage.upload(audioFile);`
            *   [ ] Handle potential upload errors.
        *   [ ] **Create Initial DB Record:**
            *   Insert a new row into `lipsync_jobs` with:
                *   `user_id`
                *   `input_video_url` (from Fal Storage)
                *   `input_audio_url` (from Fal Storage)
                *   `status = 'UPLOADING'` (or `'PENDING'` if preferred)
            *   [ ] Retrieve the generated `id` (let's call it `job_id`) of this new row.
        *   [ ] **Construct Webhook URL:**
            *   Get the base Supabase functions URL (e.g., `https://<project-ref>.supabase.co/functions/v1/`).
            *   Create the full URL: `const webhookUrl = \`\${functionsBaseUrl}handle-lipsync-webhook?job_id=\${job_id}\`;`
            *   *(Optional Security): Add a secret parameter: `webhookUrl += '&secret=YOUR_SHARED_SECRET';` Store `YOUR_SHARED_SECRET` as another Supabase secret.*
        *   [ ] **Submit to Fal AI Queue:**
            *   Call `const { request_id } = await fal.queue.submit("fal-ai/sync-lipsync/v2", { input: { video_url, audio_url }, webhookUrl });`
            *   [ ] Handle potential submission errors from Fal AI.
        *   [ ] **Update DB Record:**
            *   Update the `lipsync_jobs` row where `id = job_id`.
            *   Set `fal_request_id = request_id`.
            *   Set `status = 'PROCESSING'`.
        *   [ ] **Response:** Return a JSON response to the frontend with `{"success": true, "jobId": job_id}` on success, or `{"success": false, "error": "message"}` on failure.
    *   [ ] **Deployment:** `supabase functions deploy submit-lipsync-job --no-verify-jwt` (verification handled manually inside).

2.  **Edge Function: `handle-lipsync-webhook`**
    *   [ ] Create a new Edge Function: `supabase functions new handle-lipsync-webhook`.
    *   [ ] **Purpose:** Receives completion/failure notifications from Fal AI via webhook and updates the corresponding database record.
    *   [ ] **Trigger:** HTTP POST. This endpoint must be publicly accessible.
    *   [ ] **Authentication:** None directly. Validate using a shared secret in the query parameter if implemented.
    *   [ ] **Input:**
        *   Query Parameters: `job_id` (UUID string), `secret` (optional string).
        *   Request Body: JSON payload from Fal AI (contains `request_id`, `status`, `payload`, `error`).
    *   [ ] **Steps:**
        *   [ ] Initialize Supabase client (service role key needed for updates).
        *   [ ] Extract `job_id` from URL query parameters (`url.searchParams.get('job_id')`). Validate it's a valid UUID.
        *   [ ] *(Optional Security): Extract `secret` from query params. Compare with the stored Supabase secret. Return `401 Unauthorized` if mismatch.*
        *   [ ] Parse the JSON request body (`await req.json()`). Extract `fal_request_id = body.request_id`, `fal_status = body.status`, `payload = body.payload`, `fal_error = body.error`.
        *   [ ] **Fetch Job Record:** Query `lipsync_jobs` table: `select * from lipsync_jobs where id = job_id limit 1`.
        *   [ ] **Validation:**
            *   Check if a job with `job_id` exists. Return `404` if not.
            *   Verify the `fal_request_id` from the webhook body matches the `fal_request_id` stored in the fetched job record. Return `400 Bad Request` or `403 Forbidden` if mismatch (prevents spoofing).
        *   [ ] **Handle Fal AI Status:**
            *   If `fal_status === 'OK'` (or equivalent success status):
                *   Extract the output video URL: `const output_video_url = payload?.video?.url;`. Check if it exists.
                *   Update the `lipsync_jobs` record where `id = job_id`:
                    *   Set `status = 'COMPLETED'`.
                    *   Set `output_video_url = output_video_url`.
                    *   Set `updated_at = now()`.
            *   Else (if `fal_status === 'ERROR'` or other failure):
                *   Extract error details: `const error_message = JSON.stringify(fal_error || payload || body);` (Store relevant details).
                *   Update the `lipsync_jobs` record where `id = job_id`:
                    *   Set `status = 'FAILED'`.
                    *   Set `error_message = error_message`.
                    *   Set `updated_at = now()`.
        *   [ ] **Response:** Return an immediate `200 OK` response (`new Response("Webhook received", { status: 200 });`) to Fal AI to acknowledge receipt, regardless of DB update success/failure (handle DB errors internally).
    *   [ ] **Deployment:** `supabase functions deploy handle-lipsync-webhook --no-verify-jwt`.

---

## Phase 3: Frontend Implementation (React Component)

1.  **Create New Component (`LipsyncUploader.tsx`):**
    *   [ ] Create the basic component structure.
    *   [ ] Add state variables using `useState`:
        *   `videoFile: File | null = null`
        *   `audioFile: File | null = null`
        *   `isSubmitting: boolean = false` (For the initial function call)
        *   `isProcessing: boolean = false` (While waiting for webhook/realtime update)
        *   `currentJobId: string | null = null`
        *   `jobStatus: string | null = null` (e.g., 'PROCESSING', 'COMPLETED', 'FAILED')
        *   `outputUrl: string | null = null`
        *   `errorMessage: string | null = null`
    *   [ ] Import `supabase` client and `useToast`.

2.  **UI Elements:**
    *   [ ] Add `<input type="file" accept="video/*">` for video upload. Use a ref (`useRef`) for programmatic access if needed. Style using a `<Label>`.
    *   [ ] Add `<input type="file" accept="audio/*">` for audio upload. Style using a `<Label>`.
    *   [ ] Display selected file names.
    *   [ ] Add a "Submit" button. Disable it when `isSubmitting`, `isProcessing`, or files are missing.
    *   [ ] Add a status display area (conditionally rendered):
        *   Show loading spinner/text when `isSubmitting` or `isProcessing`. Include `jobStatus` text.
    *   [ ] Add an error display area (conditionally rendered when `errorMessage` is set).
    *   [ ] Add an HTML `<video>` player (conditionally rendered when `outputUrl` is set). Set `src={outputUrl}`, include `controls`.

3.  **File Handling & Validation:**
    *   [ ] Implement `onChange` handlers for file inputs to update state (`setVideoFile`, `setAudioFile`).
    *   [ ] **Client-side Validation:**
        *   Check file size (e.g., `< 100 * 1024 * 1024` for 100MB). Show toast/error if too large.
        *   *(Optional: Basic type check based on extension or MIME type)*.

4.  **Submit Logic (`handleSubmit` function):**
    *   [ ] Attach this function to the Submit button's `onClick`.
    *   [ ] Prevent default form submission if inside a `<form>`.
    *   [ ] Perform final validation checks (files exist).
    *   [ ] Set `isSubmitting = true`, `errorMessage = null`.
    *   [ ] Create `FormData`: `const formData = new FormData(); formData.append('videoFile', videoFile); formData.append('audioFile', audioFile);`
    *   [ ] Invoke the Edge Function:
        ```javascript
        try {
          const { data, error } = await supabase.functions.invoke('submit-lipsync-job', {
            body: formData,
          });

          if (error) throw error;

          if (data?.success && data.jobId) {
            setCurrentJobId(data.jobId);
            setIsProcessing(true);
            setJobStatus('PROCESSING'); // Initial status assumption
            // Clear file inputs and state
            setVideoFile(null);
            setAudioFile(null);
            // Reset file input visually if using refs: ref.current.value = null;
          } else {
            throw new Error(data?.error || 'Failed to submit job.');
          }
        } catch (err: any) {
          console.error("Submission failed:", err);
          setErrorMessage(err.message || 'An unexpected error occurred.');
          toast({ title: 'Submission Failed', description: err.message, variant: 'destructive' });
        } finally {
          setIsSubmitting(false);
        }
        ```

5.  **Realtime Status Updates:**
    *   [ ] Import `useEffect`.
    *   [ ] Set up a Supabase Realtime channel to listen for updates on the specific job.
    *   [ ] Define a type/interface for the `lipsync_jobs` row structure (e.g., `LipsyncJob`).
        ```typescript
        interface LipsyncJob {
          id: string;
          user_id: string;
          fal_request_id: string | null;
          status: string;
          input_video_url: string;
          input_audio_url: string;
          output_video_url: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        }
        ```
    *   [ ] Implement the `useEffect` hook as described in the previous plan, subscribing when `currentJobId` changes and unsubscribing on cleanup.
    *   [ ] Inside the callback:
        *   Update `jobStatus` from `payload.new.status`.
        *   If status is `COMPLETED`, set `outputUrl = payload.new.output_video_url`, set `isProcessing = false`.
        *   If status is `FAILED`, set `errorMessage = payload.new.error_message`, set `isProcessing = false`.

---

## Phase 4: Deployment & Testing

1.  **Environment Variables:**
    *   [ ] Ensure `FAL_KEY` secret is set in Supabase for Edge Functions.
    *   [ ] Ensure Supabase URL (`VITE_SUPABASE_URL`) and Anon Key (`VITE_SUPABASE_ANON_KEY`) are correctly set in the Vercel environment (for Production, Preview, etc.) where the React app is deployed.

2.  **Function Deployment:**
    *   [ ] Deploy both Edge Functions (`submit-lipsync-job`, `handle-lipsync-webhook`) using the Supabase CLI:
        ```bash
        supabase functions deploy submit-lipsync-job --no-verify-jwt
        supabase functions deploy handle-lipsync-webhook --no-verify-jwt
        ```

3.  **Frontend Deployment:**
    *   [ ] Build and deploy the React application to Vercel (or your hosting provider).

4.  **Testing:**
    *   [ ] **Happy Path:** Upload valid video/audio files (< 1 min). Verify job submission, `PROCESSING` status display, Realtime update to `COMPLETED`, and final video playback. Check `lipsync_jobs` table for correct data.
    *   [ ] **File Validation:** Test uploading non-video/audio files, oversized files. Verify client-side rejection.
    *   [ ] **Fal AI Failure:** Simulate a failure scenario if possible (e.g., invalid input URLs manually?), or check logs. Verify status updates to `FAILED` and error message is displayed. Check DB record.
    *   [ ] **Webhook:** Monitor Fal AI dashboard and Edge Function logs (`supabase functions logs --project-ref <ref> handle-lipsync-webhook`) to ensure the webhook is being called and processed correctly.
    *   [ ] **Authentication:** Test submitting without being logged in (should fail). Test selecting jobs (should only see own jobs).

---

This plan provides a comprehensive guide. Remember to handle errors gracefully at each stage and provide informative feedback to the user. 


Documentation:

can help you in how we might approach the build:

Title: Sync Lipsync 2.0 | Video to Video | fal.ai

URL Source: https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js

Markdown Content:
### About

Lipsync Request V2

### 1\. Calling the API[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#api-call-install)

### Install the client[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#api-call-install)

The client provides a convenient way to interact with the model API.

\`\`\`
npm install --save @fal-ai/client
\`\`\`

### Setup your API Key[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#api-call-setup)

Set `FAL_KEY` as an environment variable in your runtime.

\`\`\`
export FAL_KEY="YOUR_API_KEY"
\`\`\`

### Submit a request[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#api-call-submit-request)

The client API handles the API submit protocol. It will handle the request status updates and return the result when the request is completed.

\`\`\`
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/sync-lipsync/v2", {
  input: {
    video_url: "https://v3.fal.media/files/tiger/IugLCDJRIoGqvqTa-EJTr_3wg74vCqyNuQ-IiBd77MM_output.mp4",
    audio_url: "https://fal.media/files/lion/vyFWygmZsIZlUO4s0nr2n.wav"
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === "IN_PROGRESS") {
      update.logs.map((log) => log.message).forEach(console.log);
    }
  },
});
console.log(result.data);
console.log(result.requestId);
\`\`\`

2\. Authentication[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#auth)
----------------------------------------------------------------------------------------

The API uses an API Key for authentication. It is recommended you set the `FAL_KEY` environment variable in your runtime when possible.

### API Key[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#auth-api-key)

In case your app is running in an environment where you cannot set environment variables, you can set the API Key manually as a client configuration.

\`\`\`
import { fal } from "@fal-ai/client";

fal.config({
  credentials: "YOUR_FAL_KEY"
});
\`\`\`

3\. Queue[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#queue)
--------------------------------------------------------------------------------

### Submit a request[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#queue-submit)

The client API provides a convenient way to submit requests to the model.

\`\`\`
import { fal } from "@fal-ai/client";

const { request_id } = await fal.queue.submit("fal-ai/sync-lipsync/v2", {
  input: {
    video_url: "https://v3.fal.media/files/tiger/IugLCDJRIoGqvqTa-EJTr_3wg74vCqyNuQ-IiBd77MM_output.mp4",
    audio_url: "https://fal.media/files/lion/vyFWygmZsIZlUO4s0nr2n.wav"
  },
  webhookUrl: "https://optional.webhook.url/for/results",
});
\`\`\`

### Fetch request status[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#queue-status)

You can fetch the status of a request to check if it is completed or still in progress.

\`\`\`
import { fal } from "@fal-ai/client";

const status = await fal.queue.status("fal-ai/sync-lipsync/v2", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b",
  logs: true,
});
\`\`\`

### Get the result[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#queue-result)

Once the request is completed, you can fetch the result. See the [Output Schema](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#schema-output) for the expected result format.

\`\`\`
import { fal } from "@fal-ai/client";

const result = await fal.queue.result("fal-ai/sync-lipsync/v2", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b"
});
console.log(result.data);
console.log(result.requestId);
\`\`\`

4\. Files[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#files)
--------------------------------------------------------------------------------

Some attributes in the API accept file URLs as input. Whenever that's the case you can pass your own URL or a Base64 data URI.

### Data URI (base64)[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#files-data-uri)

You can pass a Base64 data URI as a file input. The API will handle the file decoding for you. Keep in mind that for large files, this alternative although convenient can impact the request performance.

### Hosted files (URL)[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#files-from-url)

You can also pass your own URLs as long as they are publicly accessible. Be aware that some hosts might block cross-site requests, rate-limit, or consider the request as a bot.

### Uploading files[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#files-upload)

We provide a convenient file storage that allows you to upload files and use them in your requests. You can upload files using the client API and use the returned URL in your requests.

\`\`\`
import { fal } from "@fal-ai/client";

const file = new File(["Hello, World!"], "hello.txt", { type: "text/plain" });
const url = await fal.storage.upload(file);
\`\`\`

5\. Schema[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#schema)
----------------------------------------------------------------------------------

### Input[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#schema-input)

`video_url` `string`\* required

URL of the input video

`audio_url` `string`\* required

URL of the input audio

`sync_mode` `SyncModeEnum`

Lipsync mode when audio and video durations are out of sync. Default value: `"cut_off"`

Possible enum values: `cut_off, loop, bounce, silence, remap`

\`\`\`
{
  "video_url": "https://v3.fal.media/files/tiger/IugLCDJRIoGqvqTa-EJTr_3wg74vCqyNuQ-IiBd77MM_output.mp4",
  "audio_url": "https://fal.media/files/lion/vyFWygmZsIZlUO4s0nr2n.wav",
  "sync_mode": "cut_off"
}
\`\`\`

### Output[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#schema-output)

`video` `[File](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#type-File)`\* required

The generated video

\`\`\`
{
  "video": {
    "url": "https://v3.fal.media/files/kangaroo/WIhlgDEJbccwGwAsvL3vz_output.mp4"
  }
}
\`\`\`

### Other types[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#schema-other)

#### File[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=js#type-File)

`url` `string`\* required

The URL where the file can be downloaded from.

`content_type` `string`

The mime type of the file.

`file_name` `string`

The name of the file. It will be auto-generated if not provided.

`file_size` `integer`

The size of the file in bytes.

`file_data` `string`

File data

Related Models
--------------



documentation on webhooks:

Title: Webhooks

URL Source: https://docs.fal.ai/model-endpoints/webhooks

Markdown Content:
Webhooks work in tandem with the queue system explained above, it is another way to interact with our queue. By providing us a webhook endpoint you get notified when the request is done as opposed to polling it.

Here is how this works in practice, it is very similar to submitting something to the queue but we require you to pass an extra `fal_webhook` query parameter.

To utilize webhooks, your requests should be directed to the `queue.fal.run` endpoint, instead of the standard `fal.run`. This distinction is crucial for enabling webhook functionality, as it ensures your request is handled by the queue system designed to support asynchronous operations and notifications.

\`\`\`
curl --request POST \  --url 'https://queue.fal.run/fal-ai/flux/dev?fal_webhook=https://url.to.your.app/api/fal/webhook' \  --header "Authorization: Key $FAL_KEY" \  --header 'Content-Type: application/json' \  --data '{  "prompt": "Photo of a cute dog"}'
\`\`\`

The request will be queued and you will get a response with the `request_id` and `gateway_request_id`:

\`\`\`
{  "request_id": "024ca5b1-45d3-4afd-883e-ad3abe2a1c4d",  "gateway_request_id": "024ca5b1-45d3-4afd-883e-ad3abe2a1c4d"}
\`\`\`

These two will be mostly the same, but if the request failed and was retried, `gateway_request_id` will have the value of the last tried request, while `request_id` will be the value used in the queue API.

Once the request is done processing in the queue, a `POST` request is made to the webhook URL, passing the request info and the resulting `payload`. The `status` indicates whether the request was successful or not.

### Successful result

The following is an example of a successful request:

\`\`\`
{  "request_id": "123e4567-e89b-12d3-a456-426614174000",  "gateway_request_id": "123e4567-e89b-12d3-a456-426614174000",  "status": "OK",  "payload": {    "images": [      {        "url": "https://url.to/image.png",        "content_type": "image/png",        "file_name": "image.png",        "file_size": 1824075,        "width": 1024,        "height": 1024      }    ],    "seed": 196619188014358660  }}
\`\`\`

### Response errors

When an error happens, the `status` will be `ERROR`. The `error` property will contain a message and the `payload` will provide the error details. For example, if you forget to pass the required `model_name` parameter, you will get the following response:

\`\`\`
{  "request_id": "123e4567-e89b-12d3-a456-426614174000",  "gateway_request_id": "123e4567-e89b-12d3-a456-426614174000",  "status": "ERROR",  "error": "Invalid status code: 422",  "payload": {    "detail": [      {        "loc": ["body", "prompt"],        "msg": "field required",        "type": "value_error.missing"      }    ]  }}
\`\`\`

### Payload errors

For the webhook to include the payload, it must be valid JSON. So if there is an error serializing it, `payload` is set to `null` and a `payload_error` will include details about the error.

\`\`\`
{  "request_id": "123e4567-e89b-12d3-a456-426614174000",  "gateway_request_id": "123e4567-e89b-12d3-a456-426614174000",  "status": "OK",  "payload": null,  "payload_error": "Response payload is not JSON serializable. Either return a JSON serializable object or use the queue endpoint to retrieve the response."}
\`\`\`

### Retry policy

If the webhook fails to deliver the payload, it will retry 10 times in the span of 2 hours.


---
documentation on queue:
Title: Queue

URL Source: https://docs.fal.ai/model-endpoints/queue

Markdown Content:
For requests that take longer than several seconds, as it is usually the case with AI applications, we have built a queue system.

Utilizing our queue system offers you a more granulated control to handle unexpected surges in traffic. It further provides you with the capability to cancel requests if needed and grants you the observability to monitor your current position within the queue. Besides that using the queue system spares you from the headache of keeping around long running https requests.

### Queue endpoints

You can interact with all queue features through a set of endpoints added to you function URL via the `queue` subdomain. The endpoints are as follows:

| Endpoint | Method | Description |
| --- | --- | --- |
| **`queue.fal.run/{appId}`** | POST | Adds a request to the queue |
| **`queue.fal.run/{appId}/requests/{request_id}/status`** | GET | Gets the status of a request |
| **`queue.fal.run/{appId}/requests/{request_id}/status/stream`** | GET | Streams the status of a request until it’s completed |
| **`queue.fal.run/{appId}/requests/{request_id}`** | GET | Gets the response of a request |
| **`queue.fal.run/{appId}/requests/{request_id}/cancel`** | PUT | Cancels a request |

For instance, should you want to use the curl command to submit a request to the aforementioned endpoint and add it to the queue, your command would appear as follows:

\`\`\`
curl -X POST https://queue.fal.run/fal-ai/fast-sdxl \  -H "Authorization: Key $FAL_KEY" \  -d '{"prompt": "a cat"}'
\`\`\`

Here’s an example of a response with the `request_id`:

\`\`\`
{  "request_id": "80e732af-660e-45cd-bd63-580e4f2a94cc",  "response_url": "https://queue.fal.run/fal-ai/fast-sdxl/requests/80e732af-660e-45cd-bd63-580e4f2a94cc",  "status_url": "https://queue.fal.run/fal-ai/fast-sdxl/requests/80e732af-660e-45cd-bd63-580e4f2a94cc/status",  "cancel_url": "https://queue.fal.run/fal-ai/fast-sdxl/requests/80e732af-660e-45cd-bd63-580e4f2a94cc/cancel"}
\`\`\`

The payload helps you to keep track of your request with the `request_id`, and provides you with the necessary information to get the status of your request, cancel it or get the response once it’s ready, so you don’t have to build these endpoints yourself.

### Request status

Once you have the request id you may use this request id to get the status of the request. This endpoint will give you information about your request’s status, it’s position in the queue or the response itself if the response is ready.

\`\`\`
curl -X GET https://queue.fal.run/fal-ai/fast-sdxl/requests/{request_id}/status
\`\`\`

Here’s an example of a response with the `IN_QUEUE` status:

\`\`\`
{  "status": "IN_QUEUE",  "queue_position": 0,  "response_url": "https://queue.fal.run/fal-ai/fast-sdxl/requests/80e732af-660e-45cd-bd63-580e4f2a94cc"}
\`\`\`

#### Status types

Queue `status` can have one of the following types and their respective properties:

*   **`IN_QUEUE`**:
    
    *   `queue_position`: The current position of the task in the queue.
    *   `response_url`: The URL where the response will be available once the task is processed.
*   **`IN_PROGRESS`**:
    
    *   `logs`: An array of logs related to the request. Note that it needs to be enabled, as explained in the next section.
    *   `response_url`: The URL where the response will be available.
*   **`COMPLETED`**:
    
    *   `logs`: An array of logs related to the request. Note that it needs to be enabled, as explained in the next section.
    *   `response_url`: The URL where the response is available.

#### Logs

Logs are disabled by default. In order to enable logs for your request, you need to send the `logs=1` query parameter when getting the status of your request. For example:

\`\`\`
curl -X GET https://queue.fal.run/fal-ai/fast-sdxl/requests/{request_id}/status?logs=1
\`\`\`

When enabled, the `logs` attribute in the queue status contains an array of log entries, each represented by the `RequestLog` type. A `RequestLog` object has the following attributes:

*   `message`: a string containing the log message.
*   `level`: the severity of the log, it can be one of the following:
    *   `STDERR` | `STDOUT` | `ERROR` | `INFO` | `WARN` | `DEBUG`
*   `source`: indicates the source of the log.
*   `timestamp`: a string representing the time when the log was generated.

These logs offer valuable insights into the status and progress of your queued tasks, facilitating effective monitoring and debugging.

#### Streaming status

If you want to keep track of the status of your request in real-time, you can use the streaming endpoint. The response is `text/event-stream` and each event is a JSON object with the status of the request exactly as the non-stream endpoint.

This endpoint will keep the connection open until the status of the request changes to `COMPLETED`.

It supports the same `logs` query parameter as the status.

\`\`\`
curl -X GET https://queue.fal.run/fal-ai/fast-sdxl/requests/{request_id}/status/stream
\`\`\`

Here is an example of a stream of status updates:

\`\`\`
$ curl https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/status/stream?logs=1 --header "Authorization: Key $FAL_KEY"data: {"status": "IN_PROGRESS", "request_id": "3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "response_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "status_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/status", "cancel_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/cancel", "logs": [], "metrics": {}}data: {"status": "IN_PROGRESS", "request_id": "3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "response_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "status_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/status", "cancel_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/cancel", "logs": [{"timestamp": "2024-12-20T15:37:17.120314", "message": "INFO:TRYON:Preprocessing images...", "labels": {}}, {"timestamp": "2024-12-20T15:37:17.286519", "message": "INFO:TRYON:Running try-on model...", "labels": {}}], "metrics": {}}data: {"status": "IN_PROGRESS", "request_id": "3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "response_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "status_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/status", "cancel_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/cancel", "logs": [], "metrics": {}}: pingdata: {"status": "IN_PROGRESS", "request_id": "3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "response_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "status_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/status", "cancel_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/cancel", "logs": [], "metrics": {}}data: {"status": "COMPLETED", "request_id": "3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "response_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf", "status_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/status", "cancel_url": "https://queue.fal.run/fashn/tryon/requests/3e3e5b55-45fb-4e5c-b4d1-05702dffc8bf/cancel", "logs": [{"timestamp": "2024-12-20T15:37:32.161184", "message": "INFO:TRYON:Finished running try-on model.", "labels": {}}], "metrics": {"inference_time": 17.795265674591064}}
\`\`\`

### Cancelling a request

If your request is still in the queue and not already being processed you may still cancel it.

\`\`\`
curl -X PUT https://queue.fal.run/fal-ai/fast-sdxl/requests/{request_id}/cancel
\`\`\`

### Getting the response

Once you get the `COMPLETED` status, the `response` will be available along with its `logs`.

\`\`\`
curl -X GET https://queue.fal.run/fal-ai/fast-sdxl/requests/{request_id}
\`\`\`

Here’s an example of a response with the `COMPLETED` status:

\`\`\`
{  "status": "COMPLETED",  "logs": [    {      "message": "2020-05-04 14:00:00.000000",      "level": "INFO",      "source": "stdout",      "timestamp": "2020-05-04T14:00:00.000000Z"    }  ],  "response": {    "message": "Hello World!"  }}
\`\`\`

----

documentation in curl:
Title: Sync Lipsync 2.0 | Video to Video | fal.ai

URL Source: https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http

Markdown Content:
### About

Lipsync Request V2

### 1\. Calling the API[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#api-call-install)

### Setup your API Key[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#api-call-setup)

Set `FAL_KEY` as an environment variable in your runtime.

\`\`\`
export FAL_KEY="YOUR_API_KEY"
\`\`\`

### Submit a request[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#api-call-submit-request)

The client API handles the API submit protocol. It will handle the request status updates and return the result when the request is completed.

\`\`\`
response=$(curl --request POST \
  --url https://queue.fal.run/fal-ai/sync-lipsync/v2 \
  --header "Authorization: Key $FAL_KEY" \
  --header "Content-Type: application/json" \
  --data '{
     "video_url": "https://v3.fal.media/files/tiger/IugLCDJRIoGqvqTa-EJTr_3wg74vCqyNuQ-IiBd77MM_output.mp4",
     "audio_url": "https://fal.media/files/lion/vyFWygmZsIZlUO4s0nr2n.wav"
   }')
REQUEST_ID=$(echo "$response" | grep -o '"request_id": *"[^"]*"' | sed 's/"request_id": *//; s/"//g')
\`\`\`

2\. Authentication[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#auth)
------------------------------------------------------------------------------------------

The API uses an API Key for authentication. It is recommended you set the `FAL_KEY` environment variable in your runtime when possible.

### API Key[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#auth-api-key)

3\. Queue[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#queue)
----------------------------------------------------------------------------------

### Submit a request[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#queue-submit)

The client API provides a convenient way to submit requests to the model.

\`\`\`
response=$(curl --request POST \
  --url https://queue.fal.run/fal-ai/sync-lipsync/v2 \
  --header "Authorization: Key $FAL_KEY" \
  --header "Content-Type: application/json" \
  --data '{
     "video_url": "https://v3.fal.media/files/tiger/IugLCDJRIoGqvqTa-EJTr_3wg74vCqyNuQ-IiBd77MM_output.mp4",
     "audio_url": "https://fal.media/files/lion/vyFWygmZsIZlUO4s0nr2n.wav"
   }')
REQUEST_ID=$(echo "$response" | grep -o '"request_id": *"[^"]*"' | sed 's/"request_id": *//; s/"//g')
\`\`\`

### Fetch request status[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#queue-status)

You can fetch the status of a request to check if it is completed or still in progress.

\`\`\`
curl --request GET \
  --url https://queue.fal.run/fal-ai/sync-lipsync/requests/$REQUEST_ID/status \
  --header "Authorization: Key $FAL_KEY"
\`\`\`

### Get the result[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#queue-result)

Once the request is completed, you can fetch the result. See the [Output Schema](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#schema-output) for the expected result format.

\`\`\`
curl --request GET \
  --url https://queue.fal.run/fal-ai/sync-lipsync/requests/$REQUEST_ID \
  --header "Authorization: Key $FAL_KEY"
\`\`\`

4\. Files[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#files)
----------------------------------------------------------------------------------

Some attributes in the API accept file URLs as input. Whenever that's the case you can pass your own URL or a Base64 data URI.

### Data URI (base64)[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#files-data-uri)

You can pass a Base64 data URI as a file input. The API will handle the file decoding for you. Keep in mind that for large files, this alternative although convenient can impact the request performance.

### Hosted files (URL)[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#files-from-url)

You can also pass your own URLs as long as they are publicly accessible. Be aware that some hosts might block cross-site requests, rate-limit, or consider the request as a bot.

### Uploading files[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#files-upload)

We provide a convenient file storage that allows you to upload files and use them in your requests. You can upload files using the client API and use the returned URL in your requests.

5\. Schema[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#schema)
------------------------------------------------------------------------------------

### Input[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#schema-input)

`video_url` `string`\* required

URL of the input video

`audio_url` `string`\* required

URL of the input audio

`sync_mode` `SyncModeEnum`

Lipsync mode when audio and video durations are out of sync. Default value: `"cut_off"`

Possible enum values: `cut_off, loop, bounce, silence, remap`

\`\`\`
{
  "video_url": "https://v3.fal.media/files/tiger/IugLCDJRIoGqvqTa-EJTr_3wg74vCqyNuQ-IiBd77MM_output.mp4",
  "audio_url": "https://fal.media/files/lion/vyFWygmZsIZlUO4s0nr2n.wav",
  "sync_mode": "cut_off"
}
\`\`\`

### Output[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#schema-output)

`video` `[File](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#type-File)`\* required

The generated video

\`\`\`
{
  "video": {
    "url": "https://v3.fal.media/files/kangaroo/WIhlgDEJbccwGwAsvL3vz_output.mp4"
  }
}
\`\`\`

### Other types[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#schema-other)

#### File[#](https://fal.ai/models/fal-ai/sync-lipsync/v2/api?platform=http#type-File)

`url` `string`\* required

The URL where the file can be downloaded from.

`content_type` `string`

The mime type of the file.

`file_name` `string`

The name of the file. It will be auto-generated if not provided.

`file_size` `integer`

The size of the file in bytes.

`file_data` `string`

File data

Related Models
--------------

