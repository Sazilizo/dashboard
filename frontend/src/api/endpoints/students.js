//api/endpoint/students.js
import api from "../client";
import { buildQuery } from "../../utils/query";

export const fetchStudents = async (filters) => {
  const query = buildQuery(filters);
  const { data } = await api.get(`/students/list?${query}`);
  return data;
};
