import api from "../client";
//fetches school data
export const fetchSchoolsSummary = async (params = {}) => {
  // params: { school_id: [id1, id2], include_details: true/false }
  const search = new URLSearchParams();
  if (params.school_id) {
    (Array.isArray(params.school_id) ? params.school_id : [params.school_id]).forEach(id => search.append('school_id', id));
  }
  if (params.include_details !== undefined) {
    search.append('include_details', params.include_details ? 'true' : 'false');
  }
  const { data } = await api.get(`/schools/summary?${search.toString()}`);
  
  return data;
};
