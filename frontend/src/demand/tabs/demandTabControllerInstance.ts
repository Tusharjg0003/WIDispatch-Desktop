import { DemandTabController } from "./DemandTabController.ts";
import { createTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

export const demandTabController = new DemandTabController({
  storage: createTabSessionStorage("demand"),
});
