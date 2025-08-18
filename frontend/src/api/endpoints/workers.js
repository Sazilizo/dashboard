import api from "../client";
import { buildQuery } from "../../utils/query";

export const fetchWorkers = async (filters) => {
  const query = buildQuery(filters);
  const { data } = await api.get(`/workers/list?${query}`);
  return data;
};
