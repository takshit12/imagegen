# A/B Test Creative Generator - Technical Documentation

## Overview

This application is an AI-powered marketing tool that allows users to generate multiple visual variations of ad creatives without design skills. It's built with React, Supabase for authentication and data storage, and Stripe for payment processing.

## User Flow

### 1. Landing Page & Authentication

- **Home Page**: Users land on the marketing page (`src/components/pages/home.tsx`) which showcases the product features and pricing.
- **Authentication**: Users can sign up or log in through forms (`src/components/auth/SignUpForm.tsx` and `LoginForm.tsx`).
- **Authentication Flow**:
  - New users register with email, password, and full name
  - Returning users log in with email and password
  - Authentication state is managed through the Supabase Auth API and stored in React context

### 2. Dashboard & Generator Access

- After authentication, users are directed to the dashboard (`src/components/pages/dashboard.tsx`)
- The dashboard provides an overview of the user's activity and quick access to the generator
- Navigation to the generator is available from both the dashboard and the main navigation

### 3. Creative Generation Process

- **Generator Interface** (`src/components/pages/generator.tsx`):
  - Users input core ad elements (headline, description, audience)
  - Users can include a product image URL
  - Style preferences and number of variations can be configured
  - Upon submission, the system generates multiple creative variations

### 4. Preview & Export

- Generated creatives are displayed in a preview gallery
- Users can download all creatives or export them to ad platforms
- Usage history and remaining credits are tracked in the dashboard

### 5. Subscription Management

- Users can subscribe to different plans through Stripe checkout
- Successful payments redirect to a success page (`src/components/pages/success.tsx`)

## Supabase Functionality

### Authentication

The application uses Supabase Auth for user management (`supabase/auth.tsx`):

- **User Registration**: Creates new users in Supabase Auth with custom metadata
- **Session Management**: Tracks user sessions and authentication state
- **Protected Routes**: Implemented through the `PrivateRoute` component in `App.tsx`

### Data Storage

Supabase PostgreSQL database stores:

- **User Profiles**: Extended user information beyond auth data
- **Subscriptions**: User subscription details from Stripe
- **Webhook Events**: Logs of Stripe webhook events for auditing

### Context Provider

The `AuthProvider` component wraps the application to provide authentication context:

```tsx
// From supabase/auth.tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Authentication logic...

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
```

## Edge Functions

The application uses Supabase Edge Functions for server-side operations:

### 1. Create Checkout (`supabase/functions/create-checkout/index.ts`)

- **Purpose**: Creates a Stripe checkout session for subscription purchases
- **Inputs**: Price ID, user ID, and return URL
- **Process**:
  - Validates required parameters
  - Creates a Stripe checkout session with the specified price
  - Includes user metadata for tracking
- **Output**: Returns the checkout session ID and URL

### 2. Get Plans (`supabase/functions/get-plans/index.ts`)

- **Purpose**: Retrieves available subscription plans from Stripe
- **Process**:
  - Queries Stripe API for active plans
  - Formats the response for the frontend
- **Output**: Returns a list of available subscription plans

### 3. Payments Webhook (`supabase/functions/payments-webhook/index.ts`)

- **Purpose**: Processes Stripe webhook events to update subscription status
- **Supported Events**:
  - `customer.subscription.created`: Records new subscriptions
  - `customer.subscription.updated`: Updates subscription details
  - `customer.subscription.deleted`: Marks subscriptions as canceled
  - `checkout.session.completed`: Links checkout sessions to subscriptions
  - `invoice.payment_succeeded`: Records successful payments
  - `invoice.payment_failed`: Handles failed payments
- **Process**:
  - Verifies webhook signature
  - Logs event to database
  - Updates subscription status in database
  - Updates user subscription status when relevant

## Image Generation

### Current Implementation (Mock)

Currently, the image generation is mocked in `src/components/pages/generator.tsx`:

```tsx
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
```

This mock implementation:
1. Simulates a 3-second API call
2. Creates an array of mock creative objects
3. Uses Unsplash placeholder images with different IDs
4. Updates the UI with the generated creatives

### Planned Implementation

The planned implementation for real AI-powered image generation will involve:

1. **New Edge Function**: Create a dedicated edge function for image generation
   - Accept parameters from the generator form
   - Process the request and call an external AI service

2. **AI Service Integration**:
   - Integrate with an image generation API (e.g., DALL-E, Midjourney, or Stability AI)
   - Pass the headline, description, audience, and style preferences
   - Request multiple variations based on the user's settings

3. **Response Processing**:
   - Process the AI-generated images
   - Store them in Supabase Storage or another cloud storage solution
   - Return URLs to the frontend

4. **Usage Tracking**:
   - Track generation requests in the database
   - Decrement user credits for each generation
   - Enforce usage limits based on subscription tier

5. **Error Handling**:
   - Implement robust error handling for API failures
   - Provide fallback options when generation fails
   - Add retry mechanisms for transient errors

6. **Optimization**:
   - Cache common generation parameters
   - Implement background processing for large batch requests
   - Add image optimization for different device sizes

## Future Enhancements

1. **Advanced Customization**: Allow more granular control over generated variations
2. **A/B Test Analytics**: Track performance of different creative variations
3. **Direct Ad Platform Integration**: Push creatives directly to Facebook, Google, etc.
4. **Collaborative Workflows**: Team sharing and approval processes
5. **Template Library**: Pre-built templates for common ad formats
