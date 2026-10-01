import { createContext } from "react";

// The public language of the site, for the few words the theme adds itself.
export const LanguageContext = createContext<"de" | "en">("de");
