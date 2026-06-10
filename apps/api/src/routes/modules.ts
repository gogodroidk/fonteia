import { PRODUCT_MODULES } from "@fonteia/domain";
import { jsonResponse, type ApiResponse } from "./types";

export function getModules(): ApiResponse<typeof PRODUCT_MODULES> {
  return jsonResponse(PRODUCT_MODULES);
}

