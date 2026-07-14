import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";

let paddlePromise: Promise<Paddle | undefined> | null = null;

export const PADDLE_CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || "";
export const PADDLE_PRO_PRICE_ID = import.meta.env.VITE_PADDLE_PRO_PRICE_ID || "";
export const PADDLE_CLASS_PRICE_ID = import.meta.env.VITE_PADDLE_CLASS_PRICE_ID || "";

export function hasPaddleConfig(): boolean {
  return Boolean(PADDLE_CLIENT_TOKEN && PADDLE_PRO_PRICE_ID && PADDLE_CLASS_PRICE_ID);
}

export function getPaddle(eventCallback?: (event: PaddleEventData) => void): Promise<Paddle | undefined> {
  if (!hasPaddleConfig()) return Promise.resolve(undefined);
  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      environment: "production",
      token: PADDLE_CLIENT_TOKEN,
      eventCallback,
      checkout: {
        settings: {
          displayMode: "overlay",
          theme: "light",
        },
      },
    });
    return paddlePromise;
  }
  return paddlePromise.then((paddle) => {
    if (eventCallback && paddle) {
      paddle.Update({ eventCallback });
    }
    return paddle;
  });
}
