import { createForgeHandler } from "@/lib/forge-handler";
import { generateForgeImage } from "@/lib/forge-image-generator";

export const runtime = "nodejs";

export const POST = createForgeHandler({ generateForgeImage });
