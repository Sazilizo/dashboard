export function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => search.append(key, v));
    } else if (value !== undefined && value !== null) {
      search.append(key, value);
    }
  });
  return search.toString();
}
