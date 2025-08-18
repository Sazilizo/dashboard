import { useAuth } from "../auth/useAuth";

export default function RoleGuard({ allowed, children, fallback = null }) {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user || (allowed && !allowed.includes(user.profile.roles.name))) return fallback;
  return children;
}
