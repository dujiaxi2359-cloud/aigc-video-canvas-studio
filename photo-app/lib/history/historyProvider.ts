import { loadLocalHistory, saveLocalHistory } from "@/lib/history/localHistory";

// Current provider is localStorage. Future SaaS mode can replace this with DB calls.
export const historyProvider = {
  list: loadLocalHistory,
  save: saveLocalHistory,
};
