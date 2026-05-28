import { create } from "zustand";
import { historyApi } from "../services/historyApi";
import type { GenerationHistory } from "../types/history";

type State = {
  histories: GenerationHistory[];
  fetchHistories: () => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
};

export const useHistoryStore = create<State>((set, get) => ({
  histories: [],
  fetchHistories: async () => set({ histories: await historyApi.list() }),
  deleteHistory: async (id) => {
    await historyApi.remove(id);
    await get().fetchHistories();
  }
}));
