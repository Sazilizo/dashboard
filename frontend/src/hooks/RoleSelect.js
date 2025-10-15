import React,{useEffect, useState} from "react";
import api from "../api/client";
import useOnlineStatus from "./useOnlineStatus";
function RoleSelect({ name, value, onChange, required }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    async function fetchRoles() {
      if (!isOnline) {
        // When offline, don't attempt network fetch — return empty list
        setRoles([]);
        setLoading(false);
        return;
      }

      const { data, error } = await api.from("roles").select("id, name");
      if (!error) setRoles(data || []);
      setLoading(false);
    }
    fetchRoles();
  }, []);

  if (loading) return <p>Loading roles...</p>;

  return (
    <select name={name} value={value} onChange={onChange} required={required}>
      <option value="">Select role</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
export default RoleSelect