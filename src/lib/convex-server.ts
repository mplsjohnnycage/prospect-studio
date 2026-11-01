import { api } from "../../convex/_generated/api";
import { fetchAuthAction, fetchAuthMutation, fetchAuthQuery } from "./auth-server";
export { api };
export function getConvex() {
  return {
    query: fetchAuthQuery,
    mutation: fetchAuthMutation,
    action: fetchAuthAction,
  };
}
