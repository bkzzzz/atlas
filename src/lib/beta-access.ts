import "server-only";
import { createBetaAccessHandler } from "@/lib/beta-access-handler";

export const betaAccess = createBetaAccessHandler({
  accessCode: process.env.BETA_ACCESS_CODE,
  secureCookies: process.env.NODE_ENV === "production",
});
