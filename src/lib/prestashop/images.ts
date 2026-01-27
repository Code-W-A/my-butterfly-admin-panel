const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const getBaseUrl = () => {
  const baseUrl = process.env.PRESTASHOP_BASE_URL;
  if (!baseUrl) throw new Error("Missing PRESTASHOP_BASE_URL");
  return normalizeBaseUrl(baseUrl);
};

export function buildPrestashopPublicImageUrl(imageId: number): string {
  const baseUrl = getBaseUrl();
  const digits = String(imageId).split("");
  const path = digits.join("/");
  return `${baseUrl}/img/p/${path}/${imageId}.jpg`;
}
