import api from "../client";
import { buildQuery } from "../../utils/query";

export const fetchSessions = async (filters) => {
  const query = buildQuery(filters);
  const { data } = await api.get(`/sessions/list?${query}`);
  return data;
};