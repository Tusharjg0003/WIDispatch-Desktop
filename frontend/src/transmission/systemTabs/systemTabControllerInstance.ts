// Transmission Systems reuse the pump-station tab controller with their own
// store, URL base, list tab and sub-tabs.

import { TransmissionTabController } from "../tabs/TransmissionTabController.ts";
import { createTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";
import { systemTabStore } from "./systemTabStore.ts";
import { DEFAULT_SYSTEM_SUB_TAB, SYSTEM_LIST_TAB_TITLE, isSystemSubTab } from "./systemTab.types.ts";

export const systemTabController = new TransmissionTabController({
  storage: createTabSessionStorage("transmission-systems"),
  store: systemTabStore,
  basePath: "/transmission/systems",
  listTitle: SYSTEM_LIST_TAB_TITLE,
  isSubTab: isSystemSubTab,
  defaultSubTab: DEFAULT_SYSTEM_SUB_TAB,
});
