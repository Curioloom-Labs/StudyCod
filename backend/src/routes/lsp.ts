import { Router, type Request, type Response } from "express";
import axios, { AxiosError } from "axios";
import { authRequired } from "../middleware/authMiddleware";
import { logger } from "../utils/logger";

const router = Router();
const bridgeUrl = String(process.env.LSP_PROXY_URL || "http://127.0.0.1:4010").replace(/\/+$/, "");

function proxyPath(req: Request): string {
  const suffix = req.path.replace(/^\/lsp(?=\/|$)/, "");
  return `${bridgeUrl}${suffix || "/"}`;
}

router.use(authRequired);
router.use(async (req: Request, res: Response) => {
  try {
    const response = await axios.request({
      method: req.method,
      url: proxyPath(req),
      params: req.query,
      data: req.body,
      headers: {
        "x-studycod-lsp-secret": String(process.env.LSP_PROXY_SECRET || ""),
        accept: "application/json"
      },
      timeout: 35_000,
      validateStatus: () => true
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.warn("[lsp] bridge request failed", {
      method: req.method,
      path: req.path,
      status: axiosError.response?.status,
      message: axiosError.message
    });
    res.status(503).json({ message: "Language server is temporarily unavailable" });
  }
});

export default router;
