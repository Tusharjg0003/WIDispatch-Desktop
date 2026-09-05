// The application's ProductionTabController.
//
// Wired here rather than in a component so tab state has a lifetime
// independent of React mounting: open plants survive navigating to another
// section and back.

import { ProductionTabController } from "./ProductionTabController.ts";
import { createTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

export const productionTabController = new ProductionTabController({
  storage: createTabSessionStorage("production"),
});
