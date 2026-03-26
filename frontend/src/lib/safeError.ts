export const getErrorMessageFromUnknown = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== "object") return fallback;

  const response = Reflect.get(error, "response");
  if (response && typeof response === "object") {
    const data = Reflect.get(response, "data");
    if (data && typeof data === "object") {
      const responseMessage = Reflect.get(data, "message");
      if (typeof responseMessage === "string" && responseMessage.trim()) {
        return responseMessage;
      }

      const responseError = Reflect.get(data, "error");
      if (typeof responseError === "string" && responseError.trim()) {
        return responseError;
      }
    }
  }

  const directMessage = Reflect.get(error, "message");
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage;
  }

  return fallback;
};
