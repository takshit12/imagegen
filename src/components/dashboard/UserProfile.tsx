import { useAuth } from "../../../supabase/auth"

export function UserProfile() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <div>Please sign in</div>
  }

  return (
    <div>
      <h2>Profile</h2>
      <p>Name: {user.user_metadata?.full_name}</p>
      <p>Email: {user.email}</p>
    </div>
  )
}
