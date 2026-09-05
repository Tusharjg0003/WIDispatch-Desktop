import { EconomicsTabController } from "./EconomicsTabController.ts";
import { createTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

export const economicsTabController = new EconomicsTabController({
  storage: createTabSessionStorage("economics"),
});
