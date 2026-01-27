import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "My Butterfly Admin",
  version: packageJson.version,
  copyright: `© ${currentYear}, My Butterfly Dashboard.`,
  meta: {
    title: "My Butterfly Dashboard",
    description: "My Butterfly Dashboard",
  },
};
