import { useAuth } from "../auth/useAuth";

export default function RoleGuard({ allowed, children, fallback = null }) {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;

  if (!user) return fallback;

  // Normalize allowed list (can contain role names or role ids)
  const allowedList = Array.isArray(allowed) ? allowed.map((a) => String(a).toLowerCase()) : [];

  const profile = user.profile || {};
  const roleName = (profile.roles && profile.roles.name) ? String(profile.roles.name).toLowerCase() : null;
  const roleId = profile.role_id != null ? String(profile.role_id) : null;

  // If allowed is not provided, allow by default (no restriction)
  if (!allowed || allowedList.length === 0) return children;

  // Check allowed by role name or role id
  const allowedByName = roleName && allowedList.includes(roleName);
  const allowedById = roleId && allowedList.includes(roleId);

  if (!allowedByName && !allowedById) return fallback;
  return children;
}
