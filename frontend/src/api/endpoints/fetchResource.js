import api from "../client";
import { buildQuery } from "../../utils/query";

/**
 * Generic fetch function for any resource with filters.
 * @param {string} resourcePath - e.g. "/students/list", "/workers/list"
 * @param {object} filters - filters object with arrays or single values
 * @returns {Promise<object>} - API response data
 */
export const fetchResource = async (resourcePath, filters, extraQuery = {}) => {
  const merged = { ...filters, ...extraQuery };
  const query = buildQuery(merged);
  const { data } = await api.get(`${resourcePath}?${query}`);
  return data;
};
